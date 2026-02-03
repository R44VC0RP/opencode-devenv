import { join } from "node:path";
import type { DevEnvConfig, GlobalConfig, ProxyConfig } from "./devenv.ts";

const DEFAULT_PROVIDER: DevEnvConfig["provider"] = "docker";
const DEFAULT_DISTRO = "mandarin3d/opencode-devenv:latest";
const DEFAULT_DOMAIN = "localhost";
const DEFAULT_PROXY: Required<ProxyConfig> = {
  enabled: true,
  entrypoint: 80,
  traefikBinary: "traefik",
};

const PROJECT_CONFIG = ".opencode/devenv.json";
const GLOBAL_CONFIG = ".config/opencode/devenv.json";

const readJson = async <T>(path: string): Promise<T | null> => {
  const file = Bun.file(path);
  const exists = await file.exists();
  if (!exists) {
    return null;
  }

  const text = await file.text();
  if (!text.trim()) {
    return null;
  }

  return JSON.parse(text) as T;
};

export const loadGlobalConfig = async (): Promise<GlobalConfig> => {
  const home = Bun.env.HOME ?? "";
  const globalPath = home ? join(home, GLOBAL_CONFIG) : "";
  const global = globalPath ? await readJson<GlobalConfig>(globalPath) : null;
  return global ?? {};
};

export const loadConfig = async (worktree: string): Promise<DevEnvConfig> => {
  const projectPath = join(worktree, PROJECT_CONFIG);
  const project = await readJson<DevEnvConfig>(projectPath);
  const global = await loadGlobalConfig();

  const provider = project?.provider ?? global.defaultProvider ?? DEFAULT_PROVIDER;
  const distro = project?.distro ?? global.defaultDistro ?? DEFAULT_DISTRO;
  const enabled = project?.enabled ?? true;

  return {
    enabled,
    provider,
    distro,
    machineName: project?.machineName,
    user: project?.user,
    domain: project?.domain, // Only set if explicitly configured; spawn.ts falls back to projectName
    internalPort: project?.internalPort,
  };
};

export const resolveProxyConfig = (global: GlobalConfig): Required<ProxyConfig> => {
  return {
    enabled: global.proxy?.enabled ?? DEFAULT_PROXY.enabled,
    entrypoint: global.proxy?.entrypoint ?? DEFAULT_PROXY.entrypoint,
    traefikBinary: global.proxy?.traefikBinary ?? DEFAULT_PROXY.traefikBinary,
  };
};
