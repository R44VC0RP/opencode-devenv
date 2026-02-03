import { tool } from "@opencode-ai/plugin";
import { ptyManager } from "../pty/manager.ts";
import { checkCommandPermission } from "../pty/permissions.ts";
import DESCRIPTION from "./write.txt";

function parseEscapeSequences(input: string): string {
  return input.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|[nrt\\])/g, (match, seq: string) => {
    if (seq.startsWith("x")) {
      return String.fromCharCode(parseInt(seq.slice(1), 16));
    }
    if (seq.startsWith("u")) {
      return String.fromCharCode(parseInt(seq.slice(1), 16));
    }
    if (seq === "n") return "\n";
    if (seq === "r") return "\r";
    if (seq === "t") return "\t";
    if (seq === "\\") return "\\";
    return match;
  });
}

function extractCommands(data: string): string[] {
  const commands: string[] = [];
  const lines = data.split(/[\n\r]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("\x03") && !trimmed.startsWith("\x04")) {
      commands.push(trimmed);
    }
  }
  return commands;
}

function parseCommand(commandLine: string): { command: string; args: string[] } {
  const parts = commandLine.split(/\s+/).filter(Boolean);
  const command = parts[0] ?? "";
  const args = parts.slice(1);
  return { command, args };
}

export const devenvWrite = tool({
  description: DESCRIPTION,
  args: {
    id: tool.schema.string().describe("The PTY session ID (e.g., pty_a1b2c3d4)"),
    data: tool.schema.string().optional().describe("The input data to send to the PTY"),
    kill: tool.schema.boolean().optional().describe("If true, terminates the session"),
    cleanup: tool.schema.boolean().optional().describe("If true and kill=true, removes the session and frees the buffer"),
  },
  async execute(args) {
    const session = ptyManager.get(args.id);
    if (!session) {
      throw new Error(`PTY session '${args.id}' not found. Use devenv_manage with scope=pty.`);
    }

    const kill = args.kill ?? false;
    const cleanup = args.cleanup ?? false;

    if (kill) {
      const success = ptyManager.kill(args.id, cleanup);
      if (!success) {
        throw new Error(`Failed to kill PTY session '${args.id}'.`);
      }

      const cleanupNote = cleanup ? " (session removed)" : " (session retained for log access)";
      return [
        `<devenv_killed>`,
        `Killed: ${args.id}${cleanupNote}`,
        `Title: ${session.title}`,
        `Command: ${session.command} ${session.args.join(" ")}`,
        `Final line count: ${session.lineCount}`,
        `</devenv_killed>`,
      ].join("\n");
    }

    if (!args.data) {
      throw new Error("data is required unless kill=true");
    }

    if (cleanup) {
      throw new Error("cleanup can only be used with kill=true");
    }

    if (session.status !== "running") {
      throw new Error(`Cannot write to PTY '${args.id}' - session status is '${session.status}'.`);
    }

    const parsedData = parseEscapeSequences(args.data);

    const commands = extractCommands(parsedData);
    for (const commandLine of commands) {
      const parsed = parseCommand(commandLine);
      if (parsed.command) {
        await checkCommandPermission(parsed.command, parsed.args);
      }
    }

    const success = ptyManager.write(args.id, parsedData);
    if (!success) {
      throw new Error(`Failed to write to PTY '${args.id}'.`);
    }

    const preview = args.data.length > 50 ? args.data.slice(0, 50) + "..." : args.data;
    const displayPreview = preview.replace(/\x03/g, "^C").replace(/\x04/g, "^D").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    return `Sent ${args.data.length} bytes to ${args.id}: "${displayPreview}"`;
  },
});
