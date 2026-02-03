import { loadGlobalConfig, resolveProxyConfig } from "./config.ts";
import type { RouteRecord } from "./devenv.ts";
import { removeRoute, upsertRoute } from "./routes.ts";
import { getProxyPaths, proxyStatus, startProxy, stopProxy, writeRoutesFile } from "./proxy/traefik.ts";

export type GatewayStatus = {
  proxy: {
    enabled: boolean;
    running: boolean;
    entrypoint: number;
  };
};

export const ensureGatewayRoute = async (route: RouteRecord): Promise<{ entrypoint: number }> => {
  const global = await loadGlobalConfig();
  const proxyConfig = resolveProxyConfig(global);

  const routes = await upsertRoute(route);
  const proxyPaths = getProxyPaths();

  if (proxyConfig.enabled) {
    await writeRoutesFile(proxyPaths, routes);
    await startProxy(proxyConfig);
  }

  return { entrypoint: proxyConfig.entrypoint };
};

export const removeGatewayRoute = async (projectId: string): Promise<void> => {
  const global = await loadGlobalConfig();
  const proxyConfig = resolveProxyConfig(global);
  const routes = await removeRoute(projectId);
  const proxyPaths = getProxyPaths();

  if (proxyConfig.enabled) {
    await writeRoutesFile(proxyPaths, routes);
    if (routes.length === 0) {
      await stopProxy();
    } else {
      await startProxy(proxyConfig);
    }
  }
};

export const rebuildGatewayRoutes = async (routes: RouteRecord[]): Promise<void> => {
  const global = await loadGlobalConfig();
  const proxyConfig = resolveProxyConfig(global);
  const proxyPaths = getProxyPaths();

  if (proxyConfig.enabled) {
    await writeRoutesFile(proxyPaths, routes);
    if (routes.length === 0) {
      await stopProxy();
    } else {
      await startProxy(proxyConfig);
    }
  }
};

export const getGatewayStatus = async (): Promise<GatewayStatus> => {
  const global = await loadGlobalConfig();
  const proxyConfig = resolveProxyConfig(global);
  const proxy = proxyStatus(proxyConfig);

  return {
    proxy: {
      enabled: proxyConfig.enabled,
      running: proxy.running,
      entrypoint: proxy.entrypoint,
    },
  };
};
