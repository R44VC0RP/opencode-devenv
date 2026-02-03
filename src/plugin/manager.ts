import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { createLogger } from "./logger.ts";
import { loadConfig } from "./config.ts";
import { loadState, removeState, upsertState } from "./state.ts";
import type { DevEnvConfig, DevEnvRecord, ProviderKind } from "./devenv.ts";
import { DockerProvider } from "./providers/docker.ts";
import type { DevEnvProvider } from "./providers/interface.ts";
import type { PluginContext, PluginShell } from "./types.ts";

const log = createLogger("manager");
const BOOTSTRAP_VERSION = 4;
const NEXT_CONFIG_FILES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
];

export type ManagerInput = {
  project: PluginContext["project"];
  worktree: string;
  shell: PluginShell;
};

const resolveProjectId = (projectId: string, worktree: string): string => {
  if (projectId !== "global") {
    return projectId;
  }

  if (!worktree || worktree === "/") {
    return "global";
  }

  const hash = createHash("sha1").update(worktree).digest("hex");
  return `path-${hash}`;
};

const slugify = (value: string): string => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return cleaned.slice(0, 40);
};

const buildMachineName = (projectName: string, projectId: string): string => {
  const slug = slugify(projectName);
  if (slug) {
    return `opencode-${slug}`;
  }

  const suffix = projectId.replace(/^path-/, "").slice(0, 8);
  return `opencode-${suffix}`;
};

const resolveTmpfsPaths = async (worktree: string): Promise<string[]> => {
  if (!worktree) {
    return [];
  }

  for (const name of NEXT_CONFIG_FILES) {
    const file = Bun.file(join(worktree, name));
    if (await file.exists()) {
      return [join(worktree, ".next")];
    }
  }

  return [];
};

const mergeConfig = (base: DevEnvConfig, override?: DevEnvConfig): DevEnvConfig => {
  if (!override) {
    return base;
  }

  return {
    enabled: override.enabled ?? base.enabled,
    provider: override.provider ?? base.provider,
    distro: override.distro ?? base.distro,
    machineName: override.machineName ?? base.machineName,
    user: override.user ?? base.user,
  };
};

type ManagerContext = {
  projectId: string;
  projectName: string;
  worktree: string;
};

export class DevEnvManager {
  #projectId: string;
  #legacyProjectId: string;
  #projectName: string;
  #worktree: string;
  #shell: PluginShell;
  #docker: DockerProvider;

  constructor(input: ManagerInput) {
    this.#legacyProjectId = input.project.id;
    this.#projectId = resolveProjectId(input.project.id, input.worktree);
    this.#projectName = basename(input.worktree) || input.project.id;
    this.#worktree = input.worktree;
    this.#shell = input.shell;
    this.#docker = new DockerProvider(this.#shell);
  }

  async list(): Promise<DevEnvRecord[]> {
    const state = await loadState();
    return Object.values(state.envs);
  }

  projectInfo(): { projectId: string; projectName: string; worktree: string } {
    const context = this.context();
    return {
      projectId: context.projectId,
      projectName: context.projectName,
      worktree: context.worktree,
    };
  }

  async status(): Promise<DevEnvRecord | null> {
    return this.statusWithContext(this.context());
  }

  async ensure(overrides?: DevEnvConfig): Promise<DevEnvRecord> {
    return this.ensureWithContext(this.context(), overrides);
  }

  async ensureForWorkdir(workdir: string, overrides?: DevEnvConfig): Promise<DevEnvRecord> {
    return this.ensureWithContext(this.context(workdir), overrides);
  }

  private async bootstrap(record: DevEnvRecord): Promise<DevEnvRecord> {
    if (record.bootstrapVersion === BOOTSTRAP_VERSION) {
      return record;
    }

    const provider = this.getProviderByKind(record.provider);
    await provider.bootstrap(record.id);

    const next: DevEnvRecord = {
      ...record,
      bootstrapped: true,
      bootstrapVersion: BOOTSTRAP_VERSION,
      updatedAt: Date.now(),
    };

    await upsertState(next);
    return next;
  }

  private async provisionWithContext(
    context: ManagerContext,
    config: DevEnvConfig,
    desiredName: string,
  ): Promise<DevEnvRecord> {

    if (config.enabled === false) {
      throw new Error("Dev environment is disabled for this project.");
    }

    const provider = await this.getProvider(config.provider ?? "auto");
    const name = desiredName;
    const now = Date.now();

    const state = await loadState();
    const existing = state.envs[context.projectId];

    const seed: DevEnvRecord = existing ?? {
      id: name,
      projectId: context.projectId,
      projectName: context.projectName,
      worktree: context.worktree,
      provider: provider.kind,
      status: "provisioning",
      distro: config.distro,
      createdAt: now,
      updatedAt: now,
    };

    const pending: DevEnvRecord = {
      ...seed,
      id: name,
      provider: provider.kind,
      status: "provisioning",
      distro: config.distro ?? seed.distro,
      updatedAt: now,
    };

    await upsertState(pending);

    log.info("provisioning dev environment", {
      projectId: context.projectId,
      machine: name,
      provider: provider.kind,
    });

    const tmpfsPaths = await resolveTmpfsPaths(context.worktree);
    const info = await provider.create({
      name,
      distro: config.distro ?? "ubuntu:22.04",
      user: config.user,
      worktree: context.worktree,
      tmpfsPaths,
    });

    const record: DevEnvRecord = {
      ...pending,
      status: info.status,
      distro: info.distro ?? pending.distro,
      ip: info.ip ?? pending.ip,
      updatedAt: Date.now(),
    };

    await upsertState(record);
    return record;
  }

  private async ensureWithContext(context: ManagerContext, overrides?: DevEnvConfig): Promise<DevEnvRecord> {
    const base = await loadConfig(context.worktree);
    const config = mergeConfig(base, overrides);
    const desiredName = config.machineName ?? buildMachineName(context.projectName, context.projectId);
    const current = await this.statusWithContext(context);
    const existing = current && current.status !== "missing" && current.status !== "unknown"
      ? current
      : await this.provisionWithContext(context, config, desiredName);

    const updated = await this.renameIfNeeded(existing, desiredName, config.machineName);
    return this.bootstrap(updated);
  }

  private async renameIfNeeded(
    record: DevEnvRecord,
    desiredName: string,
    explicitName?: string,
  ): Promise<DevEnvRecord> {
    if (record.id === desiredName) {
      return record;
    }

    if (explicitName && record.id === explicitName) {
      return record;
    }

    const provider = this.getProviderByKind(record.provider);
    await provider.rename(record.id, desiredName);

    const next: DevEnvRecord = {
      ...record,
      id: desiredName,
      updatedAt: Date.now(),
    };

    await upsertState(next);
    return next;
  }

  async destroy(projectId?: string): Promise<DevEnvRecord | null> {
    const state = await loadState();
    const targetId = projectId ?? this.#projectId;
    const record = state.envs[targetId];
    if (!record) {
      return null;
    }

    const provider = this.getProviderByKind(record.provider);
    await provider.destroy(record.id);
    await removeState(targetId);
    return record;
  }

  async resolveProxyTarget(record: DevEnvRecord, port: number): Promise<{ host: string; port: number }> {
    const provider = this.getProviderByKind(record.provider);
    return provider.resolveProxyTarget(record, port);
  }

  private context(worktreeOverride?: string): ManagerContext {
    const worktree = worktreeOverride ?? this.#worktree;
    const projectId = resolveProjectId(this.#legacyProjectId, worktree);
    const projectName = basename(worktree) || projectId;
    return { projectId, projectName, worktree };
  }

  private async statusWithContext(context: ManagerContext): Promise<DevEnvRecord | null> {
    const state = await loadState();
    const legacyRecord = this.#legacyProjectId !== context.projectId
      ? state.envs[this.#legacyProjectId]
      : undefined;
    const record = state.envs[context.projectId] ?? legacyRecord;
    if (!record) {
      return null;
    }

    if (record.projectId !== context.projectId) {
      if (record.worktree && record.worktree !== context.worktree) {
        return null;
      }

      const migrated: DevEnvRecord = {
        ...record,
        projectId: context.projectId,
        projectName: record.projectName || context.projectName,
        worktree: record.worktree || context.worktree,
      };
      await removeState(record.projectId);
      await upsertState(migrated);
      return migrated;
    }

    const name = record.projectName || context.projectName;

    const provider = this.getProviderByKind(record.provider);
    const info = await provider.info(record.id);
    if (!info) {
      const next: DevEnvRecord = {
        ...record,
        projectName: name,
        status: "missing",
        updatedAt: Date.now(),
      };

      await upsertState(next);
      return next;
    }

    const next: DevEnvRecord = {
      ...record,
      projectName: name,
      status: info.status,
      distro: info.distro ?? record.distro,
      ip: info.ip ?? record.ip,
      updatedAt: Date.now(),
    };

    await upsertState(next);
    return next;
  }

  private getProviderByKind(kind: ProviderKind): DevEnvProvider {
    if (kind === "docker") {
      return this.#docker;
    }

    throw new Error(`Provider '${kind}' is not supported. Only 'docker' is available.`);
  }

  private async getProvider(provider: DevEnvConfig["provider"]): Promise<DevEnvProvider> {
    // Docker is the only provider now
    if (provider === "docker" || provider === "auto" || !provider) {
      const available = await this.#docker.available();
      if (!available) {
        throw new Error("Docker is not available. Please install and start Docker.");
      }
      return this.#docker;
    }

    throw new Error(`Provider '${provider}' is not supported. Only 'docker' is available.`);
  }
}

let manager: DevEnvManager | null = null;

export const initManager = (input: ManagerInput): DevEnvManager => {
  manager = new DevEnvManager(input);
  return manager;
};

export const getManager = (): DevEnvManager => {
  if (manager) {
    return manager;
  }

  throw new Error("DevEnvManager is not initialized.");
};
