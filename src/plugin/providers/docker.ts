import type { PluginShell } from "../types.ts";
import type { DevEnvStatus } from "../devenv.ts";
import type { DevEnvRecord } from "../devenv.ts";
import type { DevEnvProvider, ProviderCreateInput, ProviderInfo, ProxyTarget } from "./interface.ts";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
};

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, `'\''`)}'`;
};

const normalizeStatus = (state: Record<string, unknown>): DevEnvStatus => {
  const running = state.Running;
  const paused = state.Paused;
  const restarting = state.Restarting;
  const dead = state.Dead;

  if (running === true) {
    return "running";
  }
  if (paused === true || restarting === true) {
    return "stopped";
  }
  if (dead === true) {
    return "error";
  }
  return "stopped";
};

const parseInspect = (value: unknown): ProviderInfo | null => {
  // docker inspect returns an array
  const arr = Array.isArray(value) ? value : [];
  if (arr.length === 0) {
    return null;
  }

  const container = asRecord(arr[0]);
  const state = asRecord(container.State);
  const config = asRecord(container.Config);
  const networkSettings = asRecord(container.NetworkSettings);
  const networks = asRecord(networkSettings.Networks);

  // Get IP from bridge network or first available network
  let ip: string | undefined;
  const bridge = asRecord(networks.bridge);
  ip = asString(bridge.IPAddress);

  if (!ip) {
    // Try to get IP from any network
    for (const netName of Object.keys(networks)) {
      const net = asRecord(networks[netName]);
      const netIp = asString(net.IPAddress);
      if (netIp) {
        ip = netIp;
        break;
      }
    }
  }

  const status = normalizeStatus(state);
  const image = asString(config.Image);

  return {
    status,
    ip,
    distro: image,
  };
};

export class DockerProvider implements DevEnvProvider {
  kind: DevEnvProvider["kind"] = "docker";
  #shell: PluginShell;

  constructor(shell: PluginShell) {
    this.#shell = shell;
  }

  async available(): Promise<boolean> {
    const result = await this.#shell`docker info`.quiet().nothrow();
    return result.exitCode === 0;
  }

  async info(name: string): Promise<ProviderInfo | null> {
    const result = await this.#shell`docker inspect ${name}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      return null;
    }

    return parseInspect(result.json());
  }

  async create(input: ProviderCreateInput): Promise<ProviderInfo> {
    const existing = await this.info(input.name);
    if (existing) {
      // Container exists, make sure it's running
      if (existing.status !== "running") {
        await this.#shell`docker start ${input.name}`.quiet().nothrow();
        const updated = await this.info(input.name);
        if (updated) {
          return updated;
        }
      }
      return existing;
    }

    // Check if Docker is running
    const status = await this.#shell`docker info`.quiet().nothrow();
    if (status.exitCode !== 0) {
      throw new Error("Docker is not running. Please start Docker Desktop or the Docker daemon.");
    }

    // Create container with volume mount for the worktree
    // The worktree will be passed during spawn, but we need to mount common paths
    // We'll mount /Users (macOS) or /home (Linux) to cover most cases
    const homeDir = process.env.HOME || "/root";
    const userDir = homeDir.startsWith("/Users") ? "/Users" : "/home";

    const tmpfsArgs = (input.tmpfsPaths ?? [])
      .filter((path) => path && path.trim())
      .map((path) => `--tmpfs ${shellEscape(path)}`)
      .join(" ");

    const createResult = await this.#shell`docker run -d \
      --name ${input.name} \
      --hostname ${input.name} \
      -v ${userDir}:${userDir} \
      ${tmpfsArgs} \
      ${input.distro} \
      sleep infinity`.quiet().nothrow();

    if (createResult.exitCode !== 0) {
      const stderr = createResult.stderr.toString().trim();
      throw new Error(`Failed to create Docker container '${input.name}': ${stderr}`);
    }

    const created = await this.info(input.name);
    if (!created) {
      throw new Error(`Failed to create Docker container '${input.name}'.`);
    }

    return created;
  }

  async bootstrap(name: string): Promise<void> {
    // Pre-built image (opencodeco/devenv:latest) already has all tools installed.
    // Just verify bun and node are available to catch misconfigured custom images.
    const verify = await this.#shell`docker exec ${name} bash -lc "command -v bun && command -v node"`.quiet().nothrow();
    if (verify.exitCode !== 0) {
      // Fall back to full bootstrap for custom images without pre-installed tools
      await this.#bootstrapFull(name);
    }
  }

  async #bootstrapFull(name: string): Promise<void> {
    const script = [
      "set -e",
      "export DEBIAN_FRONTEND=noninteractive",
      "export HOME=/root",
      "export PATH=/usr/local/bin:/usr/bin:/bin:$PATH",
      "mkdir -p /usr/local/bin",
      "apt-get update -y",
      "apt-get install -y curl ca-certificates gnupg git build-essential python3 pkg-config unzip",
      // Install Node.js 20
      "if ! command -v node >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; fi",
      // Install Bun (Linux version)
      "if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash; fi",
      // Symlink bun to /usr/local/bin and fix permissions
      "if [ -x /root/.bun/bin/bun ]; then ln -sf /root/.bun/bin/bun /usr/local/bin/bun; ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx; fi",
      "chmod 755 /root /root/.bun /root/.bun/bin 2>/dev/null || true",
      // PATH setup for login shells
      "printf 'export PATH=/usr/local/bin:/root/.bun/bin:$PATH\\n' > /etc/profile.d/devtools.sh",
    ].join(" && ");

    const result = await this.#shell`docker exec -u root ${name} bash -c ${script}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim();
      const message = stderr ? `: ${stderr}` : "";
      throw new Error(`DevEnv bootstrap failed for '${name}'${message}`);
    }

    // Verify bun and node are available
    const verify = await this.#shell`docker exec ${name} bash -lc "command -v bun && command -v node"`.quiet().nothrow();
    if (verify.exitCode !== 0) {
      throw new Error(`DevEnv bootstrap failed for '${name}': bun/node not found in PATH.`);
    }
  }

  async rename(currentName: string, nextName: string): Promise<void> {
    if (currentName === nextName) {
      return;
    }

    const result = await this.#shell`docker rename ${currentName} ${nextName}`.quiet().nothrow();
    if (result.exitCode === 0) {
      return;
    }

    const message = result.stderr.toString().trim();
    const suffix = message ? `: ${message}` : "";
    throw new Error(`Failed to rename Docker container '${currentName}' to '${nextName}'${suffix}`);
  }

  async destroy(name: string): Promise<void> {
    const result = await this.#shell`docker rm -f ${name}`.quiet().nothrow();
    if (result.exitCode === 0) {
      return;
    }

    const message = result.stderr.toString().trim();
    // Ignore "no such container" error
    if (message.includes("No such container")) {
      return;
    }

    const suffix = message ? `: ${message}` : "";
    throw new Error(`Failed to delete Docker container '${name}'${suffix}`);
  }

  async resolveProxyTarget(record: DevEnvRecord, port: number): Promise<ProxyTarget> {
    // Get fresh container info to ensure we have the current IP
    const info = await this.info(record.id);
    const host = info?.ip ?? record.ip;

    if (!host) {
      throw new Error(`DevEnv '${record.id}' has no IP available for proxy routing.`);
    }

    return { host, port };
  }
}
