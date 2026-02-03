import type { RouteRecord } from "./devenv.ts";
import { loadState, saveState } from "./state.ts";

const slugify = (value: string): string => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return cleaned.slice(0, 40);
};

export const resolveDomain = (label: string, suffix: string): string => {
  const trimmed = label.trim();
  if (!trimmed) {
    return suffix;
  }
  if (trimmed.includes(".")) {
    return trimmed;
  }
  const slug = slugify(trimmed);
  return `${slug || trimmed}.${suffix}`;
};

export const getRoutes = async (): Promise<RouteRecord[]> => {
  const state = await loadState();
  return Object.values(state.routes ?? {});
};

export const upsertRoute = async (route: RouteRecord): Promise<RouteRecord[]> => {
  const state = await loadState();
  const routes = {
    ...(state.routes ?? {}),
    [route.projectId]: route,
  };

  await saveState({
    ...state,
    routes,
  });

  return Object.values(routes);
};

export const removeRoute = async (projectId: string): Promise<RouteRecord[]> => {
  const state = await loadState();
  const routes = { ...(state.routes ?? {}) };
  if (routes[projectId]) {
    delete routes[projectId];
  }

  await saveState({
    ...state,
    routes,
  });

  return Object.values(routes);
};

export const buildHostsFile = (routes: RouteRecord[]): string => {
  if (routes.length === 0) {
    return "";
  }

  return routes
    .map((route) => `127.0.0.1 ${route.domain}`)
    .join("\n")
    .concat("\n");
};

export const buildRoutesFile = (routes: RouteRecord[], entrypointName = "web"): string => {
  if (routes.length === 0) {
    return "http:\n  routers: {}\n  services: {}\n";
  }

  const lines: string[] = ["http:", "  routers:"];
  for (const route of routes) {
    lines.push(`    ${route.projectId}:`);
    lines.push(`      rule: "Host(\`${route.domain}\`)"`);
    lines.push(`      entryPoints: [\"${entrypointName}\"]`);
    lines.push(`      service: svc-${route.projectId}`);
  }

  lines.push("  services:");
  for (const route of routes) {
    lines.push(`    svc-${route.projectId}:`);
    lines.push("      loadBalancer:");
    lines.push("        servers:");
    lines.push(`          - url: \"http://${route.targetHost}:${route.targetPort}\"`);
  }

  return lines.join("\n") + "\n";
};
