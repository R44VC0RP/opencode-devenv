import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { DevEnvRecord, DevEnvState } from "./devenv.ts";

const DEFAULT_STATE: DevEnvState = {
  version: 1,
  envs: {},
  routes: {},
};

const getStatePath = (): string => {
  const home = Bun.env.HOME ?? "";
  if (!home) {
    throw new Error("HOME is not set; cannot resolve devenv state path.");
  }

  return join(home, ".config/opencode/devenv-state.json");
};

const readStateFile = async (path: string): Promise<DevEnvState> => {
  const file = Bun.file(path);
  const exists = await file.exists();
  if (!exists) {
    return DEFAULT_STATE;
  }

  const text = await file.text();
  if (!text.trim()) {
    return DEFAULT_STATE;
  }

  return JSON.parse(text) as DevEnvState;
};

const writeStateFile = async (path: string, state: DevEnvState): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(state, null, 2));
};

export const loadState = async (): Promise<DevEnvState> => {
  const path = getStatePath();
  return readStateFile(path);
};

export const saveState = async (state: DevEnvState): Promise<void> => {
  const path = getStatePath();
  await writeStateFile(path, state);
};

export const upsertState = async (record: DevEnvRecord): Promise<DevEnvState> => {
  const path = getStatePath();
  const state = await readStateFile(path);
  const envs = {
    ...state.envs,
    [record.projectId]: record,
  };

  const next = {
    ...state,
    envs,
  };

  await writeStateFile(path, next);
  return next;
};

export const removeState = async (projectId: string): Promise<DevEnvState> => {
  const path = getStatePath();
  const state = await readStateFile(path);

  if (!state.envs[projectId]) {
    return state;
  }

  const envs = { ...state.envs };
  delete envs[projectId];

  const next = {
    ...state,
    envs,
  };

  await writeStateFile(path, next);
  return next;
};
