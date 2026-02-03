import type { PluginClient } from "../types.ts";
import { Wildcard } from "./wildcard.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("permissions");

type PermissionAction = "allow" | "ask" | "deny";
type BashPermissions = PermissionAction | Record<string, PermissionAction>;

interface PermissionConfig {
  bash?: BashPermissions;
  external_directory?: PermissionAction;
}

let client: PluginClient | null = null;
let directory: string | null = null;

export function initPermissions(next: PluginClient, root: string): void {
  client = next;
  directory = root;
}

async function getPermissionConfig(): Promise<PermissionConfig> {
  if (!client) {
    return {};
  }
  try {
    const response = await client.config.get();
    if (response.error || !response.data) {
      return {};
    }
    return (response.data as { permission?: PermissionConfig }).permission ?? {};
  } catch (e) {
    log.warn("failed to get config", { error: String(e) });
    return {};
  }
}

async function showToast(message: string, variant: "info" | "success" | "error" = "info"): Promise<void> {
  if (!client) return;
  try {
    await client.tui.showToast({ body: { message, variant } });
  } catch {
  }
}

export async function checkCommandPermission(
  command: string,
  args: string[],
): Promise<void> {
  const config = await getPermissionConfig();
  const bashPerms = config.bash;

  if (!bashPerms) {
    return;
  }

  if (typeof bashPerms === "string") {
    if (bashPerms === "deny") {
      throw new Error(
        `DevEnv spawn denied: All bash commands are disabled by user configuration.`,
      );
    }
    if (bashPerms === "ask") {
      await showToast(`DevEnv: Command "${command}" requires permission (treated as denied)`, "error");
      throw new Error(
        `DevEnv spawn denied: Command "${command}" requires user permission which is not supported by this plugin. ` +
        `Configure explicit "allow" or "deny" in your opencode.json permission.bash settings.`,
      );
    }
    return;
  }

  const action = Wildcard.allStructured({ head: command, tail: args }, bashPerms);

  if (action === "deny") {
    throw new Error(
      `DevEnv spawn denied: Command "${command} ${args.join(" ")}" is explicitly denied by user configuration.`,
    );
  }

  if (action === "ask") {
    await showToast(`DevEnv: Command "${command}" requires permission (treated as denied)`, "error");
    throw new Error(
      `DevEnv spawn denied: Command "${command} ${args.join(" ")}" requires user permission which is not supported by this plugin. ` +
      `Configure explicit "allow" or "deny" in your opencode.json permission.bash settings.`,
    );
  }
}

export async function checkWorkdirPermission(workdir: string): Promise<void> {
  if (!directory) {
    return;
  }

  const normalizedWorkdir = workdir.replace(/\/$/, "");
  const normalizedProject = directory.replace(/\/$/, "");

  if (normalizedWorkdir.startsWith(normalizedProject)) {
    return;
  }

  const config = await getPermissionConfig();
  const extDirPerm = config.external_directory;

  if (extDirPerm === "deny") {
    throw new Error(
      `DevEnv spawn denied: Working directory "${workdir}" is outside project directory "${directory}". ` +
      `External directory access is denied by user configuration.`,
    );
  }

  if (extDirPerm === "ask") {
    log.info("external_directory permission is 'ask', treating as allow for DevEnv plugin", { workdir });
  }
}
