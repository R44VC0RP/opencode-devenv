import type { DevEnvRecord, DevEnvStatus, ProviderKind } from "../devenv.ts";

export type ProviderInfo = {
  status: DevEnvStatus;
  ip?: string;
  distro?: string;
};

export type ProviderCreateInput = {
  name: string;
  distro: string;
  user?: string;
  worktree?: string;
  tmpfsPaths?: string[];
};

export type ProxyTarget = {
  host: string;
  port: number;
};

export interface DevEnvProvider {
  kind: ProviderKind;
  available(): Promise<boolean>;
  info(name: string): Promise<ProviderInfo | null>;
  create(input: ProviderCreateInput): Promise<ProviderInfo>;
  rename(currentName: string, nextName: string): Promise<void>;
  bootstrap(name: string): Promise<void>;
  destroy(name: string): Promise<void>;
  resolveProxyTarget(record: DevEnvRecord, port: number): Promise<ProxyTarget>;
}
