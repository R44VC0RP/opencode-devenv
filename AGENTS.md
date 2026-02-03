# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-02T23:59:08Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW
OpenCode plugin (TypeScript/Bun) that provisions per-project dev environments (OrbStack today) with PTY tooling and a local DNS + Traefik gateway.

## STRUCTURE
```
opencode-devenv/
├── index.ts                 # Package entry (re-exports plugin)
├── src/plugin.ts            # Plugin wiring + tool registration
├── src/plugin/tools/         # Tool handlers + description .txt files
├── src/plugin/pty/           # PTY manager, buffer, web dashboard
├── src/plugin/providers/     # Provider interface + OrbStack impl
├── src/plugin/dns/           # CoreDNS gateway
├── src/plugin/proxy/         # Traefik gateway
├── scripts/                  # Local helper scripts
└── dist/                     # Build output (local)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Plugin entry + tool registration | `src/plugin.ts` | DevEnvPlugin exports tools/events |
| Tool behavior/output | `src/plugin/tools/*.ts` | Output wrapped in `<devenv_...>` tags |
| Tool descriptions | `src/plugin/tools/*.txt` | Co-located runtime description strings |
| Provisioning + lifecycle | `src/plugin/manager.ts` | DevEnvManager + state wiring |
| OrbStack integration | `src/plugin/providers/orbstack.ts` | `orbctl` commands + bootstrap |
| Gateway DNS/proxy | `src/plugin/dns/coredns.ts`, `src/plugin/proxy/traefik.ts`, `src/plugin/gateway.ts` | Local DNS + Traefik file provider |
| PTY web dashboard | `src/plugin/pty/web/server.ts` | Bun.serve + WS stream |
| Config format | `src/plugin/config.ts`, `README.md` | Project + global config defaults |
| Local helper scripts | `scripts/` | Setup helpers (gateway config/resolver) |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `DevEnvPlugin` | const | `src/plugin.ts` | n/a | Main plugin entry |
| `devenv_spawn` | tool | `src/plugin/tools/spawn.ts` | n/a | Spawn PTY + register routes |
| `devenv_manage` | tool | `src/plugin/tools/manage.ts` | n/a | Manage env/pty/web/dns/proxy |
| `DevEnvManager` | class | `src/plugin/manager.ts` | n/a | Provision/ensure/status orchestration |

## CONVENTIONS
- Tool outputs use XML-like tags (e.g., `<devenv_env_status>`) for downstream parsing.
- Tool description text is stored in `.txt` files alongside implementations.
- Keep `.txt` descriptions in sync with handler args/output.
- Tests are colocated with source using `*.test.ts` and run via `bun test`.
- Package entry uses TS source (`index.ts`) rather than a compiled `dist` entry.

## ANTI-PATTERNS (THIS PROJECT)
- None documented in first-party code.

## UNIQUE STYLES
- Service modules (DNS/proxy) follow `getPaths -> start/stop/status` with a module-scoped runtime.
- PTY web UI is a static HTML string served by Bun (no build step).

## COMMANDS
```bash
bun test
bun run typecheck
```

## NOTES
- Local DNS requires `/etc/resolver/opencode.test` (see `README.md`).
- CoreDNS + Traefik binaries must be on PATH for gateway features.
- The repo contains local build artifacts (`dist/`, `node_modules/`) from dev setup.
