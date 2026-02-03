import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getGatewayRoot } from "../paths.ts";
import type { ProxyConfig, RouteRecord } from "../devenv.ts";
import { buildRoutesFile } from "../routes.ts";

type ProxyRuntime = {
  process: ReturnType<typeof Bun.spawn> | null;
};

const runtime: ProxyRuntime = {
  process: null,
};

export type ProxyPaths = {
  directory: string;
  configPath: string;
  routesPath: string;
};

export type ProxyStatus = {
  running: boolean;
  pid?: number;
  entrypoint: number;
};

export const getProxyPaths = (): ProxyPaths => {
  const root = getGatewayRoot();
  const directory = join(root, "traefik");
  return {
    directory,
    configPath: join(directory, "traefik.yaml"),
    routesPath: join(root, "routes.yaml"),
  };
};

const isRunning = (): boolean => {
  return Boolean(runtime.process && runtime.process.exitCode === null);
};

const writeProxyConfig = async (paths: ProxyPaths, config: Required<ProxyConfig>): Promise<void> => {
  const content = [
    "entryPoints:",
    "  web:",
    `    address: :${config.entrypoint}`,
    "providers:",
    "  file:",
    `    filename: ${paths.routesPath}`,
    "    watch: true",
    "api:",
    "  dashboard: false",
  ].join("\n") + "\n";

  await Bun.write(paths.configPath, content);
};

export const writeRoutesFile = async (
  paths: ProxyPaths,
  routes: RouteRecord[],
  entrypointName = "web",
): Promise<void> => {
  const content = buildRoutesFile(routes, entrypointName);
  await Bun.write(paths.routesPath, content);
};

export const startProxy = async (config: Required<ProxyConfig>): Promise<void> => {
  if (isRunning()) {
    return;
  }

  const binary = Bun.which(config.traefikBinary);
  if (!binary) {
    throw new Error(`Traefik binary not found: ${config.traefikBinary}`);
  }

  const paths = getProxyPaths();
  await mkdir(paths.directory, { recursive: true });
  await writeProxyConfig(paths, config);

  runtime.process = Bun.spawn({
    cmd: [binary, "--configFile", paths.configPath],
    stdout: "ignore",
    stderr: "pipe",
  });
};

export const stopProxy = async (): Promise<void> => {
  if (!runtime.process) {
    return;
  }

  runtime.process.kill();
  runtime.process = null;
};

export const proxyStatus = (config: Required<ProxyConfig>): ProxyStatus => {
  return {
    running: isRunning(),
    pid: runtime.process?.pid,
    entrypoint: config.entrypoint,
  };
};
