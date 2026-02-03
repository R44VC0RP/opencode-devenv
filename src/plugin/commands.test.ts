import { describe, test, expect } from "bun:test";
import { buildDockerCommand } from "./commands.ts";

describe("buildDockerCommand", () => {
  test("builds a shell-wrapped command with env", () => {
    const result = buildDockerCommand({
      container: "opencode-1234",
      workdir: "/Users/ryan/app",
      command: "npm",
      args: ["run", "dev"],
      env: { NODE_ENV: "development" },
      shell: true,
    });

    expect(result.command).toBe("docker");
    expect(result.args[0]).toBe("exec");
    expect(result.args).toContain("-it");
    expect(result.args).toContain("-w");
    expect(result.args).toContain("/Users/ryan/app");
    expect(result.args).toContain("opencode-1234");
    expect(result.args.slice(-3)[0]).toBe("bash");
    expect(result.args.slice(-3)[1]).toBe("-lc");
    expect(result.args.slice(-3)[2]).toContain("env NODE_ENV='development'");
  });

  test("builds a direct command when shell is false", () => {
    const result = buildDockerCommand({
      container: "opencode-1234",
      command: "node",
      args: ["-v"],
      shell: false,
    });

    expect(result.args.slice(-2)).toEqual(["node", "-v"]);
  });

  test("wraps env in shell for direct command", () => {
    const result = buildDockerCommand({
      container: "opencode-1234",
      command: "echo",
      args: ["hello"],
      env: { FOO: "bar" },
      shell: false,
    });

    // With env vars but shell=false, we still wrap in bash -lc
    expect(result.args).toContain("bash");
    expect(result.args).toContain("-lc");
    expect(result.args.slice(-1)[0]).toContain("env FOO='bar'");
  });

  test("adds user flag when specified", () => {
    const result = buildDockerCommand({
      container: "opencode-1234",
      command: "whoami",
      user: "root",
      shell: false,
    });

    expect(result.args).toContain("-u");
    expect(result.args).toContain("root");
  });
});
