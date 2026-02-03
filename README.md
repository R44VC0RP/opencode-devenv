# opencode-devenv

OpenCode plugin that provisions project-scoped Linux dev environments using
Docker. It exposes PTY tools that run inside the dev environment and keeps a
web dashboard for live session control.

## Features

- Project-scoped environments keyed by OpenCode project ID
- Docker container provisioning (works with Docker Desktop, OrbStack, etc.)
- Pre-built image with devtools (bun, node, git, build essentials)
- Fast cold start (~500ms with pre-built image)
- Local state persistence (`~/.config/opencode/devenv-state.json`)
- PTY sessions inside the dev environment
- Web dashboard for PTY sessions
- Reverse proxy for per-project domains via `*.localhost`

## Requirements

- Docker installed and running
- OpenCode plugin support enabled
- Traefik installed (`traefik` on PATH) - optional, for proxy routing

## Setup

Add the plugin to your [OpenCode config](https://opencode.ai/docs/config/):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-devenv"]
}
```

OpenCode installs the plugin on next run.

Install Traefik (optional, for proxy routing):

```bash
brew install traefik
```

No DNS setup required - `*.localhost` resolves natively in all modern browsers.

## Tools Provided

| Tool | Description |
|------|-------------|
| `devenv_spawn` | Provision if needed, then spawn a PTY inside the dev env |
| `devenv_read` | Read PTY output with pagination + regex filtering |
| `devenv_write` | Send input or kill a PTY session |
| `devenv_manage` | Manage env status/list/destroy + web/dashboard + DNS/proxy |

## Usage Examples

### Spawn a dev env shell

```
devenv_spawn: command="bash"
```

Visit your app (default entrypoint port 80):

```
http://<project>.localhost
```

### Check env status

```
devenv_manage: scope="env", action="status"
```

### List all environments

```
devenv_manage: scope="env", action="list"
```

### Destroy the current project environment

```
devenv_manage: scope="env", action="destroy"
```

### Read PTY output

```
devenv_read: id="pty_a1b2c3d4", limit=100
```

### Send input / Ctrl+C

```
devenv_write: id="pty_a1b2c3d4", data="\x03"
```

### Web dashboard

```
devenv_manage: scope="web", action="start"
```

### Proxy (routes *.localhost to containers)

```
devenv_manage: scope="proxy", action="start"
```

### Rebuild routes

```
devenv_manage: scope="routes", action="rebuild"
```

### List PTY sessions

```
devenv_manage: scope="pty", action="list"
```

## Configuration

Project config: `.opencode/devenv.json`

```json
{
  "enabled": true,
  "provider": "docker",
  "distro": "mandarin3d/opencode-devenv:latest",
  "machineName": "opencode-custom",
  "user": "root",
  "domain": "myproject",
  "internalPort": 3000
}
```

Global config: `~/.config/opencode/devenv.json`

```json
{
  "defaultProvider": "docker",
  "defaultDistro": "mandarin3d/opencode-devenv:latest",
  "domain": "localhost",
  "proxy": {
    "enabled": true,
    "entrypoint": 80,
    "traefikBinary": "traefik"
  }
}
```

## How It Works

- The environment name defaults to `opencode-<project-name>` (slugged from the repo directory)
- Existing containers are reused; new ones created via `docker run -d ... sleep infinity`
- State is stored in `~/.config/opencode/devenv-state.json`
- The pre-built image (`mandarin3d/opencode-devenv:latest`) includes bun, node, git, and build tools
- Bootstrap is a quick verification (~100ms) rather than installing packages
- `*.localhost` resolves natively - no DNS setup required
- Traefik routes `<project>.localhost` to the container's internal port
- Dev servers should bind to `0.0.0.0` inside the dev environment
- Each project gets its own container, so ports only conflict within that project
- For Next.js projects, `.next` is mounted as tmpfs inside the container to prevent stale dev locks on the host

## Docker Image

The default image `mandarin3d/opencode-devenv:latest` is based on Ubuntu 22.04 and includes:

- Node.js 20
- Bun 1.3.8
- Git, curl, build-essential, python3
- Properly configured PATH for all tools

To build your own image, see the `Dockerfile` in this repo.

## Local Development

```bash
bun install
bun run typecheck
bun test
```

To load a local checkout in OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/opencode-devenv"]
}
```
