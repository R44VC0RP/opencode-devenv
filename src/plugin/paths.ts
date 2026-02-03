import { join } from "node:path";

export const getGatewayRoot = (): string => {
  const home = Bun.env.HOME ?? "";
  if (!home) {
    throw new Error("HOME is not set; cannot resolve gateway paths.");
  }

  return join(home, ".config/opencode/devenv");
};
