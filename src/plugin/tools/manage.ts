import { tool } from "@opencode-ai/plugin";
import { getManager } from "../manager.ts";
import type { DevEnvRecord } from "../devenv.ts";
import { ptyManager } from "../pty/manager.ts";
import { startWebServer, stopWebServer, isWebServerRunning, getWebServer } from "../pty/web/server.ts";
import { getRoutes } from "../routes.ts";
import { loadGlobalConfig, resolveProxyConfig } from "../config.ts";
import { getProxyPaths, proxyStatus, startProxy, stopProxy, writeRoutesFile } from "../proxy/traefik.ts";
import { rebuildGatewayRoutes, removeGatewayRoute } from "../gateway.ts";
import DESCRIPTION from "./manage.txt";

type ProjectInfo = { projectId: string; projectName: string; worktree: string };

const envStatusOutput = (record: ProjectInfo, env: DevEnvRecord | null): string => {
  if (!env) {
    return [
      "<devenv_env_status>",
      `Project: ${record.projectName}`,
      `Project ID: ${record.projectId}`,
      "Status: missing",
      "Message: No dev environment found. Use devenv_spawn to create one.",
      "</devenv_env_status>",
    ].join("\n");
  }

  const projectName = env.projectName || env.projectId;
  return [
    "<devenv_env_status>",
    `Project: ${projectName}`,
    `Project ID: ${env.projectId}`,
    `Provider: ${env.provider}`,
    `Container: ${env.id}`,
    `Status: ${env.status}`,
    env.distro ? `Image: ${env.distro}` : null,
    env.ip ? `IP: ${env.ip}` : null,
    `Worktree: ${env.worktree}`,
    "</devenv_env_status>",
  ].filter(Boolean).join("\n");
};

export const devenvManage = tool({
  description: DESCRIPTION,
  args: {
    scope: tool.schema.enum(["env", "pty", "web", "proxy", "routes"]).optional()
      .describe("Scope to manage: env, pty, web, proxy, or routes"),
    action: tool.schema.string().optional().describe("Action to perform (status, list, destroy, start, stop, rebuild)"),
    projectId: tool.schema.string().optional().describe("Project ID for env destroy"),
    port: tool.schema.number().optional().describe("Port for web server (default: 7681)"),
  },
  async execute(args) {
    const scope = args.scope ?? "env";

    if (scope === "env") {
      const action = args.action ?? "status";
      const manager = getManager();
      const info = manager.projectInfo();

      if (action === "status") {
        const env = await manager.status();
        return envStatusOutput(info, env);
      }

      if (action === "list") {
        const envs = await manager.list();
        if (envs.length === 0) {
          return [
            "<devenv_env_list>",
            "Count: 0",
            "Message: No dev environments found.",
            "</devenv_env_list>",
          ].join("\n");
        }

        const lines = envs.map((env) => {
          return `- Project: ${env.projectName} (id: ${env.projectId}) Provider: ${env.provider} Status: ${env.status} Container: ${env.id}`;
        });

        return [
          "<devenv_env_list>",
          `Count: ${envs.length}`,
          ...lines,
          "</devenv_env_list>",
        ].join("\n");
      }

      if (action === "destroy") {
        const record = await manager.destroy(args.projectId);
        if (!record) {
          return [
            "<devenv_env_destroyed>",
            "Status: missing",
            "Message: No dev environment found for the specified project.",
            "</devenv_env_destroyed>",
          ].join("\n");
        }

        await removeGatewayRoute(record.projectId);

        return [
          "<devenv_env_destroyed>",
          `Project: ${record.projectName}`,
          `Project ID: ${record.projectId}`,
          `Provider: ${record.provider}`,
          `Container: ${record.id}`,
          "Status: destroyed",
          "</devenv_env_destroyed>",
        ].join("\n");
      }

      throw new Error(`Unknown env action: ${action}`);
    }

    if (scope === "pty") {
      const action = args.action ?? "list";
      if (action !== "list") {
        throw new Error(`Unknown pty action: ${action}`);
      }

      const sessions = ptyManager.list();
      if (sessions.length === 0) {
        return "<devenv_pty_list>\nNo active PTY sessions.\n</devenv_pty_list>";
      }

      const lines = ["<devenv_pty_list>"];
      for (const session of sessions) {
        const exitInfo = session.exitCode !== undefined ? ` (exit: ${session.exitCode})` : "";
        lines.push(`[${session.id}] ${session.title}`);
        lines.push(`  Command: ${session.command} ${session.args.join(" ")}`);
        lines.push(`  Status: ${session.status}${exitInfo}`);
        lines.push(`  PID: ${session.pid} | Lines: ${session.lineCount} | Workdir: ${session.workdir}`);
        lines.push(`  Created: ${session.createdAt.toISOString()}`);
        lines.push("");
      }
      lines.push(`Total: ${sessions.length} session(s)`);
      lines.push("</devenv_pty_list>");

      return lines.join("\n");
    }

    if (scope === "web") {
      const action = args.action ?? "status";
      const port = args.port ?? 7681;

      if (action === "start") {
        if (isWebServerRunning()) {
          const server = getWebServer();
          return [
            "<devenv_web_status>",
            "Status: already running",
            `URL: http://localhost:${server?.port ?? port}`,
            "</devenv_web_status>",
          ].join("\n");
        }

        const server = startWebServer(port);
        return [
          "<devenv_web_started>",
          "Status: running",
          `URL: http://localhost:${server.port}`,
          "</devenv_web_started>",
        ].join("\n");
      }

      if (action === "stop") {
        if (!isWebServerRunning()) {
          return [
            "<devenv_web_status>",
            "Status: not running",
            "</devenv_web_status>",
          ].join("\n");
        }

        stopWebServer();
        return [
          "<devenv_web_stopped>",
          "Status: stopped",
          "</devenv_web_stopped>",
        ].join("\n");
      }

      if (action === "status") {
        if (isWebServerRunning()) {
          const server = getWebServer();
          return [
            "<devenv_web_status>",
            "Status: running",
            `URL: http://localhost:${server?.port ?? port}`,
            "</devenv_web_status>",
          ].join("\n");
        }
        return [
          "<devenv_web_status>",
          "Status: not running",
          "</devenv_web_status>",
        ].join("\n");
      }

      throw new Error(`Unknown web action: ${action}`);
    }

    if (scope === "proxy") {
      const action = args.action ?? "status";
      const global = await loadGlobalConfig();
      const proxyConfig = resolveProxyConfig(global);
      const proxyPaths = getProxyPaths();
      const routes = await getRoutes();

      if (!proxyConfig.enabled) {
        return [
          "<devenv_proxy_status>",
          "Status: disabled",
          "</devenv_proxy_status>",
        ].join("\n");
      }

      if (action === "start") {
        await writeRoutesFile(proxyPaths, routes);
        await startProxy(proxyConfig);
        const status = proxyStatus(proxyConfig);
        return [
          "<devenv_proxy_started>",
          `Status: ${status.running ? "running" : "not running"}`,
          `Entrypoint: ${status.entrypoint}`,
          "</devenv_proxy_started>",
        ].join("\n");
      }

      if (action === "stop") {
        await stopProxy();
        return [
          "<devenv_proxy_stopped>",
          "Status: stopped",
          "</devenv_proxy_stopped>",
        ].join("\n");
      }

      if (action === "status") {
        const status = proxyStatus(proxyConfig);
        return [
          "<devenv_proxy_status>",
          `Status: ${status.running ? "running" : "not running"}`,
          `Entrypoint: ${status.entrypoint}`,
          "</devenv_proxy_status>",
        ].join("\n");
      }

      throw new Error(`Unknown proxy action: ${action}`);
    }

    if (scope === "routes") {
      const action = args.action ?? "rebuild";
      if (action !== "rebuild") {
        throw new Error(`Unknown routes action: ${action}`);
      }

      const routes = await getRoutes();
      await rebuildGatewayRoutes(routes);
      return [
        "<devenv_routes_rebuilt>",
        `Count: ${routes.length}`,
        "</devenv_routes_rebuilt>",
      ].join("\n");
    }

    throw new Error(`Unknown scope: ${scope}`);
  },
});
