import type { IPty } from "bun-pty";
import type { RingBuffer } from "./buffer.ts";

export type PTYStatus = "running" | "idle" | "exited" | "killed";

export interface PTYSession {
  id: string;
  title: string;
  command: string;
  args: string[];
  workdir: string;
  env?: Record<string, string>;
  status: PTYStatus;
  exitCode?: number;
  pid: number;
  createdAt: Date;
  parentSessionId: string;
  buffer: RingBuffer;
  process: IPty;
}

export interface PTYSessionInfo {
  id: string;
  title: string;
  command: string;
  args: string[];
  workdir: string;
  status: PTYStatus;
  exitCode?: number;
  pid: number;
  createdAt: Date;
  lineCount: number;
}

export interface SpawnOptions {
  command: string;
  args?: string[];
  workdir?: string;
  env?: Record<string, string>;
  title?: string;
  parentSessionId: string;
}

export interface ReadResult {
  lines: string[];
  totalLines: number;
  offset: number;
  hasMore: boolean;
}

export interface SearchResult {
  matches: Array<{ lineNumber: number; text: string }>;
  totalMatches: number;
  totalLines: number;
  offset: number;
  hasMore: boolean;
}
