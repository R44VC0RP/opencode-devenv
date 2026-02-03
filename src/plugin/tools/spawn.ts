import { tool } from "@opencode-ai/plugin";
import { buildDockerCommand } from "../commands.ts";
import { getManager } from "../manager.ts";
import type { DevEnvConfig, RouteRecord } from "../devenv.ts";
import { ptyManager } from "../pty/manager.ts";
import { checkCommandPermission, checkWorkdirPermission } from "../pty/permissions.ts";
import { emitter } from "../pty/emitter.ts";
import { loadConfig, loadGlobalConfig, resolveProxyConfig } from "../config.ts";
import { resolveDomain } from "../routes.ts";
import { ensureGatewayRoute } from "../gateway.ts";
import DESCRIPTION from "./spawn.txt";

const resolvePort = (args: string[] | undefined, env: Record<string, string> | undefined, defaultPort: number): number => {
  // Check for common port patterns in args
  const portPatterns = [/--port[=\s](\d+)/i, /-p[=\s]?(\d+)/i, /:(\d{4,5})$/];
  const argsStr = (args ?? []).join(" ");
  
  for (const pattern of portPatterns) {
    const match = argsStr.match(pattern);
    if (match && match[1]) {
      const port = Number.parseInt(match[1], 10);
      if (port > 0 && port < 65536) return port;
    }
  }

  // Check environment variables
  const portEnvKeys = ["PORT", "SERVER_PORT", "APP_PORT", "DEV_PORT"];
  for (const key of portEnvKeys) {
    const value = env?.[key];
    if (value) {
      const port = Number.parseInt(value, 10);
      if (port > 0 && port < 65536) return port;
    }
  }

  return defaultPort;
};

export const devenvSpawn = tool({
  description: DESCRIPTION,
  args: {
    command: tool.schema.string().describe("The command/executable to run inside the dev environment"),
    args: tool.schema.array(tool.schema.string()).optional().describe("Arguments to pass to the command"),
    workdir: tool.schema.string().optional().describe("Working directory inside the dev environment"),
    env: tool.schema.record(tool.schema.string(), tool.schema.string()).optional().describe("Environment variables for the command"),
    title: tool.schema.string().optional().describe("Human-readable title for the session"),
    description: tool.schema.string().describe("Clear, concise description of what this PTY session is for in 5-10 words"),
    shell: tool.schema.boolean().optional().describe("Wrap command in a shell so the PTY stays alive after command exits (default: true)"),
    provider: tool.schema.enum(["auto", "docker"]).optional().describe("Provider override (docker only)"),
    distro: tool.schema.string().optional().describe("Docker image to use (default: ubuntu:22.04)"),
    machineName: tool.schema.string().optional().describe("Explicit container name override"),
    user: tool.schema.string().optional().describe("Linux user to run commands as"),
    port: tool.schema.number().optional().describe("Port number for the dev server URL (auto-detected from output if not specified)"),
  },
  async execute(args, ctx) {
    await checkCommandPermission(args.command, args.args ?? []);

    const workdir = args.workdir ?? ctx.directory;
    if (workdir) {
      await checkWorkdirPermission(workdir);
    }

    const overrides: DevEnvConfig = {
      provider: args.provider,
      distro: args.distro,
      machineName: args.machineName,
      user: args.user,
    };

    const manager = getManager();
    const env = await manager.ensureForWorkdir(workdir, overrides);
    const projectConfig = await loadConfig(workdir);
    const globalConfig = await loadGlobalConfig();
    const proxyConfig = resolveProxyConfig(globalConfig);
    const domainSuffix = globalConfig.domain ?? "localhost";

    const cmd = buildDockerCommand({
      container: env.id,
      workdir,
      command: args.command,
      args: args.args ?? [],
      env: args.env,
      user: args.user,
      shell: args.shell,
    });

    let info;
    try {
      info = ptyManager.spawn({
        command: cmd.command,
        args: cmd.args,
        workdir: ctx.worktree,
        title: args.title,
        parentSessionId: ctx.sessionID,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to spawn dev env PTY. Command: ${cmd.command} ${cmd.args.join(" ")} (${message})`,
      );
    }

    const domainLabel = projectConfig.domain ?? env.projectName ?? env.projectId;
    const domain = resolveDomain(domainLabel, domainSuffix);

    // Try to detect port from args/env, default to 3000
    const detectedPort = projectConfig.internalPort
      ?? args.port
      ?? resolvePort(args.args, args.env, 3000);
    
    const gatewayEnabled = proxyConfig.enabled;

    // Track detected port from output (dev servers often report actual port)
    let activePort = detectedPort;
    const outputRegex = /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i;
    let gatewayInfo: { entrypoint: number } | null = null;
    if (gatewayEnabled) {
      try {
        const target = await manager.resolveProxyTarget(env, activePort);
        const route: RouteRecord = {
          projectId: env.projectId,
          envId: env.id,
          domain,
          internalPort: activePort,
          targetHost: target.host,
          targetPort: target.port,
        };
        gatewayInfo = await ensureGatewayRoute(route);
      } catch {
        gatewayInfo = null;
      }
    }
    const unsubscribe = emitter.subscribeOutput(info.id, (data) => {
      const match = data.match(outputRegex);
      if (!match) return;
      const parsed = Number(match[2] ?? "");
      if (!Number.isInteger(parsed) || parsed === activePort) return;
      if (parsed < 1 || parsed > 65535) return;
      activePort = parsed;
      if (gatewayEnabled) {
        manager.resolveProxyTarget(env, activePort).then((target) => {
          const route: RouteRecord = {
            projectId: env.projectId,
            envId: env.id,
            domain,
            internalPort: activePort,
            targetHost: target.host,
            targetPort: target.port,
          };
          return ensureGatewayRoute(route);
        }).catch(() => {});
      }
    });

    const unsubscribeState = emitter.subscribeState(info.id, (status) => {
      if (status !== "running") {
        unsubscribe();
        unsubscribeState();
      }
    });

    const proxyUrl = gatewayInfo
      ? (gatewayInfo.entrypoint === 80
        ? `http://${domain}`
        : `http://${domain}:${gatewayInfo.entrypoint}`)
      : null;
    const directUrl = `http://${env.ip ?? "localhost"}:${activePort}`;

    const output = [
      "<devenv_spawned>",
      `PTY ID: ${info.id}`,
      `Title: ${info.title}`,
      `Command: ${cmd.display}`,
      `Provider: ${env.provider}`,
      `Container: ${env.id}`,
      env.ip ? `IP: ${env.ip}` : null,
      proxyUrl ? `URL: ${proxyUrl}` : null,
      `Direct URL: ${directUrl}`,
      `Port: ${activePort}`,
      `Workdir: ${workdir}`,
      ``,
      `To verify the server is running, use: curl -s -o /dev/null -w "%{http_code}" ${proxyUrl ?? directUrl}`,
      `Note: Dev server must bind to 0.0.0.0 (not localhost) for external access`,
      "</devenv_spawned>",
    ].filter(Boolean).join("\n");

    return output;
  },
});
