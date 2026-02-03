## OVERVIEW
Tool handlers and description stubs for dev-env PTY and management commands.

## WHERE TO LOOK
Start here when changing tool args or output text; each handler builds its response near the end.
- `manage.ts` is the multi-scope control surface for env, PTY, web, DNS, proxy, and routes.
- `spawn.ts` provisions an env, spawns PTY sessions, and derives gateway URLs/ports.
- `read.ts` handles buffer pagination/regex filtering; `write.ts` parses input, kill/cleanup, and permission checks.

| Need | Location | Notes |
|------|----------|-------|
| Env/PTY/web/dns/proxy/routes actions | `src/plugin/tools/manage.ts` | Switches on scope/action and formats status blocks |
| Manage tool description | `src/plugin/tools/manage.txt` | Human-readable description used by tool metadata |
| Spawn PTY + gateway hints | `src/plugin/tools/spawn.ts` | Sets up PTY, port detection, and URL output |
| Spawn tool description | `src/plugin/tools/spawn.txt` | Keep text aligned with args and output |
| Read PTY output | `src/plugin/tools/read.ts` | Offset/limit, regex filtering, line truncation |
| Read tool description | `src/plugin/tools/read.txt` | Update when read behavior changes |
| Write/kill PTY | `src/plugin/tools/write.ts` | Escape parsing, permission checks, cleanup behavior |
| Write tool description | `src/plugin/tools/write.txt` | Keep examples in sync with behavior |

## ANTI-PATTERNS
- Updating output strings without checking downstream consumers.
- Editing a `.txt` description without matching changes in the handler args/behavior.
- Skipping permission checks in `spawn.ts` or `write.ts`.
- Returning non-deterministic output (timestamps/random IDs) unless required.
- Expanding read output beyond truncation limits or line-numbered formatting.
- Hardcoding ports instead of using args or port detection.
- Assuming PTY sessions exist; always validate via `ptyManager` and surface clear errors.
- Adding a new tool here without adding its matching description file.
