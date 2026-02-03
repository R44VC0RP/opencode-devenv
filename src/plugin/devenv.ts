export type DevEnvStatus = "provisioning" | "running" | "stopped" | "error" | "unknown" | "missing";

export type ProviderKind = "docker";

export type DevEnvRecord = {
  id: string;
  projectId: string;
  projectName: string;
  worktree: string;
  provider: ProviderKind;
  status: DevEnvStatus;
  distro?: string;
  ip?: string;
  domain?: string;
  internalPort?: number;
  bootstrapped?: boolean;
  bootstrapVersion?: number;
  createdAt: number;
  updatedAt: number;
};

export type DevEnvState = {
  version: 1;
  envs: Record<string, DevEnvRecord>;
  routes?: Record<string, RouteRecord>;
};

export type DevEnvConfig = {
  enabled?: boolean;
  provider?: ProviderKind | "auto";
  distro?: string;
  machineName?: string;
  user?: string;
  domain?: string;
  internalPort?: number;
};

export type ProxyConfig = {
  enabled?: boolean;
  entrypoint?: number;
  traefikBinary?: string;
};

export type GlobalConfig = {
  defaultProvider?: ProviderKind | "auto";
  defaultDistro?: string;
  domain?: string;
  proxy?: ProxyConfig;
};

export type RouteRecord = {
  projectId: string;
  envId: string;
  domain: string;
  internalPort: number;
  targetHost: string;
  targetPort: number;
};
