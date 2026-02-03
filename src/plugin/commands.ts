const SHELL_COMMANDS = new Set(["bash", "zsh", "sh", "fish", "tcsh", "csh", "ksh", "dash"]);

export type DockerCommandInput = {
  container: string;
  workdir?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  user?: string;
  shell?: boolean;
};

export type DockerCommandResult = {
  command: string;
  args: string[];
  display: string;
};

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

const buildEnvFlags = (env: Record<string, string> | undefined): string[] => {
  if (!env) {
    return [];
  }

  const flags: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    flags.push("-e", `${key}=${value}`);
  }
  return flags;
};

const buildEnvPrefix = (env: Record<string, string> | undefined): string => {
  if (!env) {
    return "";
  }

  const parts = Object.entries(env).map(([key, value]) => {
    return `${key}=${shellEscape(value)}`;
  });

  return parts.length > 0 ? `env ${parts.join(" ")} ` : "";
};

export const buildDockerCommand = (input: DockerCommandInput): DockerCommandResult => {
  const args = input.args ?? [];
  const display = [input.command, ...args].join(" ").trim();
  const shell = input.shell !== false;
  const isShell = SHELL_COMMANDS.has(input.command);

  // Base command: docker exec -it
  const commandArgs: string[] = ["exec", "-it"];

  // Add workdir if specified
  if (input.workdir) {
    commandArgs.push("-w", input.workdir);
  }

  // Add user if specified
  if (input.user) {
    commandArgs.push("-u", input.user);
  }

  // Add container name
  commandArgs.push(input.container);

  // If shell mode and not already a shell command, wrap in bash -lc
  if (shell && !isShell) {
    const envPrefix = buildEnvPrefix(input.env);
    // Run command, then exec bash -l to keep PTY alive
    const commandLine = `${envPrefix}${display}; exec bash -l`;
    commandArgs.push("bash", "-lc", commandLine);
    return { command: "docker", args: commandArgs, display };
  }

  // If we have env vars but not using shell wrapping, we need to use env command
  if (input.env && Object.keys(input.env).length > 0) {
    const envPrefix = buildEnvPrefix(input.env);
    const commandLine = `${envPrefix}${display}`;
    commandArgs.push("bash", "-lc", commandLine);
    return { command: "docker", args: commandArgs, display };
  }

  // Direct command execution
  commandArgs.push(input.command, ...args);
  return { command: "docker", args: commandArgs, display };
};
