import { initLogger } from "./plugin/logger.ts";
import { initManager } from "./plugin/manager.ts";
import { initPermissions } from "./plugin/pty/permissions.ts";
import { ptyManager } from "./plugin/pty/manager.ts";
import type { PluginContext, PluginResult } from "./plugin/types.ts";
import { devenvSpawn } from "./plugin/tools/spawn.ts";
import { devenvRead } from "./plugin/tools/read.ts";
import { devenvWrite } from "./plugin/tools/write.ts";
import { devenvManage } from "./plugin/tools/manage.ts";

export const DevEnvPlugin = async (
  { client, project, worktree, directory, $ }: PluginContext,
): Promise<PluginResult> => {
  initLogger(client);
  initManager({ project, worktree, shell: $ });
  initPermissions(client, directory);

  return {
    tool: {
      devenv_spawn: devenvSpawn,
      devenv_read: devenvRead,
      devenv_write: devenvWrite,
      devenv_manage: devenvManage,
    },
    event: async ({ event }) => {
      if (!event) {
        return;
      }

      if (event.type === "session.deleted") {
        const sessionId = (event as { properties: { info: { id: string } } }).properties?.info?.id;
        if (sessionId) {
          ptyManager.cleanupBySession(sessionId);
        }
      }
    },
  };
};
