## OVERVIEW
PTY subsystem and web dashboard wiring for interactive terminal sessions.

## WHERE TO LOOK
- `src/plugin/pty/manager.ts` owns session lifecycle, spawn, read/search, and cleanup.
- `src/plugin/pty/buffer.ts` is the ring buffer backing history and search.
- `src/plugin/pty/emitter.ts` fans out output/state events to subscribers.
- `src/plugin/pty/web/server.ts` serves the dashboard and WS API for streaming.
- `src/plugin/pty/permissions.ts` enforces bash/workdir policy from config.
- `src/plugin/pty/wildcard.ts` implements wildcard matching for permission rules.
- `src/plugin/pty/types.ts` holds shared PTY session and API types.

## CONVENTIONS
- Session IDs are `pty_` + 8 hex chars (see `generateId()` in `src/plugin/pty/manager.ts`).
- History is line-oriented; reads/searches work on split lines, not raw bytes.
- Buffer size defaults to `PTY_MAX_BUFFER_LINES` env var, fallback 50000.
- WebSocket messages use `{ type: "input" | "resize" | "history" }` payloads (see `src/plugin/pty/web/server.ts`).
- Permission config uses `permission.bash` and `permission.external_directory` from config API.

## ANTI-PATTERNS
- Bypassing `ptyManager` and mutating `sessions`/`buffer` directly.
- Emitting output/state manually instead of via `emitter` hooks.
- Treating `ask` permission as allowed; this module treats it as denied for commands.
- Returning raw errors to callers; wrap with user-facing context like existing errors do.
