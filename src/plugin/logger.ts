import type { PluginClient } from "./types.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

let client: PluginClient | null = null;

export function initLogger(next: PluginClient): void {
  client = next;
}

export function createLogger(module: string): Logger {
  const service = `devenv.${module}`;

  const log = (level: LogLevel, message: string, extra?: Record<string, unknown>): void => {
    if (client) {
      client.app.log({
        body: { service, level, message, extra },
      }).catch(() => { });
      return;
    }

    const prefix = `[${service}]`;
    const args = extra ? [prefix, message, extra] : [prefix, message];

    if (level === "debug") {
      console.debug(...args);
      return;
    }

    if (level === "info") {
      console.info(...args);
      return;
    }

    if (level === "warn") {
      console.warn(...args);
      return;
    }

    console.error(...args);
  };

  return {
    debug: (message, extra) => log("debug", message, extra),
    info: (message, extra) => log("info", message, extra),
    warn: (message, extra) => log("warn", message, extra),
    error: (message, extra) => log("error", message, extra),
  };
}
