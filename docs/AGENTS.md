# AGENTS.md

Work style: telegraph; noun-phrases ok; drop grammar;

Short guide for AI agents in this repo. Prefer progressive loading: start with the root README, then package READMEs as needed.

## Repo layout
- `cli/` - hapi CLI, daemon, Codex/MCP tooling
- `server/` - Telegram bot + HTTP API + Socket.IO + SSE
- `web/` - React Mini App / PWA

## Reference docs
- `README.md` (user overview)
- `cli/README.md` (CLI behavior and config)
- `server/README.md` (server setup and architecture)
- `web/README.md` (web app behavior and dev workflow)
- `localdocs/` (optional deep dives)

## Shared rules
- No backward compatibility: breaking old format freely.
- TypeScript strict; no untyped code.
- Bun workspaces; run `bun` commands from repo root.
- Path alias `@/*` maps to `./src/*` per package.
- Prefer 4-space indentation.

## Common commands (repo root)

- `bun typecheck`
- `bun run test`

## Key source dirs
- `cli/src/api/`, `cli/src/claude/`, `cli/src/commands/`, `cli/src/codex/`
- `server/src/web/`, `server/src/socket/`, `server/src/telegram/`, `server/src/sync/`
- `web/src/components/`, `web/src/api/`, `web/src/hooks/`

## Critical Thinking

1. Fix root cause (not band-aid).
2. Unsure: read more code; if still stuck, ask w/ short options.
3. Conflicts: call out; pick safer path.
4. Unrecognized changes: assume other agent; keep going; focus your changes. If it causes issues, stop + ask user.
