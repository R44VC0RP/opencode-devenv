# OVERVIEW
Core plugin implementation for dev environment lifecycle, gateway routing, and PTY surfaces used by devenv_* tools.

# STRUCTURE
```
src/plugin/
├── commands.ts        # Builds orbctl command lines for providers
├── config.ts          # Project/global config resolution + defaults
├── state.ts           # Persistent devenv state read/write helpers
├── manager.ts         # Provision/ensure/status orchestration
├── gateway.ts         # DNS + proxy orchestration around routes
├── routes.ts          # Route records + file generation helpers
├── providers/         # Provider interfaces + implementations
├── pty/               # PTY runtime, buffers, permissions, web UI
├── mdns/              # mDNS port probing + publisher
├── dns/               # CoreDNS process and resolver wiring
├── proxy/             # Traefik process and file-provider wiring
└── tools/             # Tool handlers + co-located descriptions
```

# WHERE TO LOOK
- Provisioning flow, bootstrap versioning: `src/plugin/manager.ts`
- Provider contract and OrbStack behavior: `src/plugin/providers/interface.ts`, `src/plugin/providers/orbstack.ts`
- Config defaults + file locations: `src/plugin/config.ts`
- Persistent env/route state shape and storage: `src/plugin/state.ts`, `src/plugin/devenv.ts`
- Route resolution + gateway file generation: `src/plugin/routes.ts`, `src/plugin/gateway.ts`
- orbctl command construction rules: `src/plugin/commands.ts`
- PTY server + web dashboard static UI: `src/plugin/pty/web/server.ts`, `src/plugin/pty/web/static/index.ts`
- Tool entrypoints and output shaping: `src/plugin/tools/*.ts`

# CONVENTIONS
- State lives at `~/.config/opencode/devenv-state.json`; use `loadState`/`upsertState`/`removeState` instead of manual writes.
- Config merges project `.opencode/devenv.json` with `~/.config/opencode/devenv.json`, then defaults in `src/plugin/config.ts`.
- Project id "global" is normalized to a worktree-hash id; use `DevEnvManager` context helpers.

# ANTI-PATTERNS
- Writing state or routes directly to disk instead of going through `state.ts`/`routes.ts`.
- Starting DNS/proxy processes without `gateway.ts` (it handles file generation + restart logic).
- Bypassing `DevEnvManager` for provisioning or rename flows.
