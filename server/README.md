# hapi-server

Telegram bot + HTTP API + realtime updates for hapi.

## What it does

- Telegram bot for notifications and the Mini App entrypoint.
- HTTP API for sessions, messages, permissions, machines, and files.
- Server-Sent Events stream for live updates in the web app.
- Socket.IO channel for CLI connections.
- Serves the web app from `web/dist` or embedded assets in the single binary.
- Persists state in SQLite.

## Configuration

See `src/configuration.ts` for all options.

### Required

- `CLI_API_TOKEN` - Shared secret used by CLI and web login. Auto-generated if not set.

### Optional (Telegram)

- `TELEGRAM_BOT_TOKEN` - Token from @BotFather.
- `ALLOWED_CHAT_IDS` - Comma-separated chat IDs allowed to use the bot.
- `WEBAPP_URL` - Public HTTPS URL for Telegram Mini App access. Also used to derive default CORS origins for the web app.

### Optional

- `WEBAPP_PORT` - HTTP port (default: 3006).
- `CORS_ORIGINS` - Comma-separated origins, or `*`.
- `HAPI_HOME` - Data directory (default: ~/.hapi).
- `DB_PATH` - SQLite database path (default: HAPI_HOME/hapi.db).

## Running

Binary (single executable):

```bash
export TELEGRAM_BOT_TOKEN="..."
export ALLOWED_CHAT_IDS="12345678"
export CLI_API_TOKEN="shared-secret"
export WEBAPP_URL="https://your-domain.example"

hapi server
```

If you only need web + CLI, you can omit TELEGRAM_BOT_TOKEN and ALLOWED_CHAT_IDS.
To enable Telegram, set TELEGRAM_BOT_TOKEN and WEBAPP_URL, start the server, send `/start`
to the bot to get your chat ID, set ALLOWED_CHAT_IDS, and restart the server.

From source:

```bash
bun install
bun run dev:server
```

## HTTP API

See `src/web/routes/` for all endpoints.

### Authentication (`src/web/routes/auth.ts`)

- `POST /api/auth` - Get JWT token (Telegram initData or CLI_API_TOKEN).

### Sessions (`src/web/routes/sessions.ts`)

- `GET /api/sessions` - List all sessions.
- `GET /api/sessions/:id` - Get session details.
- `POST /api/sessions/:id/abort` - Abort session.
- `POST /api/sessions/:id/switch` - Switch session mode (remote/local).
- `POST /api/sessions/:id/permission-mode` - Set permission mode.
- `POST /api/sessions/:id/model` - Set model preference.

### Messages (`src/web/routes/messages.ts`)

- `GET /api/sessions/:id/messages` - Get messages (paginated).
- `POST /api/sessions/:id/messages` - Send message.

### Permissions (`src/web/routes/permissions.ts`)

- `POST /api/sessions/:id/permissions/:requestId/approve` - Approve permission.
- `POST /api/sessions/:id/permissions/:requestId/deny` - Deny permission.

### Machines (`src/web/routes/machines.ts`)

- `GET /api/machines` - List online machines.
- `POST /api/machines/:id/spawn` - Spawn new session on machine.

### Git/Files (`src/web/routes/git.ts`)

- `GET /api/sessions/:id/git-status` - Git status.
- `GET /api/sessions/:id/git-diff-numstat` - Diff summary.
- `GET /api/sessions/:id/git-diff-file` - File-specific diff.
- `GET /api/sessions/:id/file` - Read file content.
- `GET /api/sessions/:id/files` - File search with ripgrep.

### Events (`src/web/routes/events.ts`)

- `GET /api/events` - SSE stream for live updates.

### CLI Tokens (`src/web/routes/cli-tokens.ts`)

Per-user API tokens for CLI authentication (recommended over shared CLI_API_TOKEN).

- `POST /api/cli-tokens` - Generate new CLI token (requires JWT auth).
- `GET /api/cli-tokens` - List user's tokens (without full token value).
- `DELETE /api/cli-tokens/:id` - Revoke token.

### CLI (`src/web/routes/cli.ts`)

- `POST /cli/sessions` - Create/load session.
- `GET /cli/sessions/:id` - Get session by ID.
- `POST /cli/machines` - Create/load machine.
- `GET /cli/machines/:id` - Get machine by ID.

## Socket.IO

See `src/socket/handlers/cli.ts` for event handlers.

Namespace: `/cli`

### Client events (CLI to server)

- `message` - Send message to session.
- `update-metadata` - Update session metadata.
- `update-state` - Update agent state.
- `session-alive` - Keep session active.
- `session-end` - Mark session ended.
- `machine-alive` - Keep machine online.
- `rpc-register` - Register RPC handler.
- `rpc-unregister` - Unregister RPC handler.

### Server events (server to clients)

- `update` - Broadcast session/message updates.
- `rpc-request` - Incoming RPC call.

See `src/socket/rpcRegistry.ts` for RPC routing.

## Telegram Bot

See `src/telegram/bot.ts` for bot implementation.

### Commands

- `/start` - Welcome message with chat ID.
- `/app` - Open Mini App.

### Features

- Permission request notifications with approve/deny buttons.
- Session ready notifications.
- Deep links to Mini App sessions.

See `src/telegram/callbacks.ts` for button handlers.

## Core Logic

See `src/sync/syncEngine.ts` for the main session/message manager:

- In-memory session cache with versioning.
- Message pagination and retrieval.
- Permission approval/denial.
- RPC method routing via Socket.IO.
- Event publishing to SSE and Telegram.
- Git operations and file search.
- Activity tracking and timeouts.

## Storage

See `src/store/index.ts` for SQLite persistence:

- Sessions with metadata and agent state.
- Messages with pagination support.
- Machines with daemon state.
- Todo extraction from messages.

### Database Schema

#### users table
Stores user authentication data for multi-user support.

- `id` (TEXT PRIMARY KEY) - Unique user identifier
- `telegram_id` (TEXT UNIQUE, nullable) - Telegram user ID (null for CLI-only users)
- `username` (TEXT NOT NULL) - Display username
- `created_at` (INTEGER NOT NULL) - User creation timestamp

#### sessions table
Stores Claude Code/Codex/Gemini session data with user ownership.

- `id` (TEXT PRIMARY KEY) - Session UUID
- `tag` (TEXT) - Session tag for identification
- `machine_id` (TEXT) - Associated machine ID
- `created_at` (INTEGER NOT NULL) - Creation timestamp
- `updated_at` (INTEGER NOT NULL) - Last update timestamp
- `metadata` (TEXT) - JSON session metadata
- `metadata_version` (INTEGER) - Optimistic concurrency version
- `agent_state` (TEXT) - JSON agent state
- `agent_state_version` (INTEGER) - Agent state version
- `todos` (TEXT) - Extracted todo list JSON
- `todos_updated_at` (INTEGER) - Todo list update timestamp
- `active` (INTEGER) - Active status flag
- `active_at` (INTEGER) - Last active timestamp
- `seq` (INTEGER) - Sequence number for updates
- `user_id` (TEXT NOT NULL) - Foreign key to users.id (CASCADE delete)

#### machines table
Stores connected machine (CLI daemon) information with user ownership.

- `id` (TEXT PRIMARY KEY) - Machine identifier
- `created_at` (INTEGER NOT NULL) - Creation timestamp
- `updated_at` (INTEGER NOT NULL) - Last update timestamp
- `metadata` (TEXT) - JSON machine metadata
- `metadata_version` (INTEGER) - Optimistic concurrency version
- `daemon_state` (TEXT) - JSON daemon state
- `daemon_state_version` (INTEGER) - Daemon state version
- `active` (INTEGER) - Online status flag
- `active_at` (INTEGER) - Last online timestamp
- `seq` (INTEGER) - Sequence number for updates
- `user_id` (TEXT NOT NULL) - Foreign key to users.id (CASCADE delete)

#### messages table
Stores session messages with user ownership.

- `id` (TEXT PRIMARY KEY) - Message UUID
- `session_id` (TEXT NOT NULL) - Foreign key to sessions.id (CASCADE delete)
- `content` (TEXT NOT NULL) - JSON message content
- `created_at` (INTEGER NOT NULL) - Creation timestamp
- `seq` (INTEGER NOT NULL) - Per-session sequence number
- `local_id` (TEXT) - Client-side optimistic ID
- `user_id` (TEXT NOT NULL) - Foreign key to users.id (CASCADE delete)

#### cli_tokens table
Stores per-user CLI API tokens for authentication (replaces shared CLI_API_TOKEN).

- `id` (TEXT PRIMARY KEY) - Token identifier
- `user_id` (TEXT NOT NULL) - Foreign key to users.id (CASCADE delete)
- `token` (TEXT UNIQUE NOT NULL) - SHA-256 hashed token
- `name` (TEXT) - Optional user-friendly token name
- `created_at` (INTEGER NOT NULL) - Token creation timestamp
- `last_used_at` (INTEGER) - Last authentication timestamp (updated on validation)

#### schema_migrations table
Tracks database schema version for migrations.

- `version` (INTEGER PRIMARY KEY) - Schema version number
- `applied_at` (INTEGER NOT NULL) - Migration application timestamp

### Database Migrations

Run migrations using the migration scripts in `scripts/`:

```bash
# Apply user table migration
bun run server/scripts/migrate-add-users.ts

# Dry-run to preview changes
bun run server/scripts/migrate-add-users.ts --dry-run

# Rollback migration
bun run server/scripts/migrate-add-users.ts --rollback
```

Current schema version: 2 (multi-user support with user_id foreign keys)

## Source structure

- `src/web/` - HTTP server and routes.
- `src/socket/` - Socket.IO setup and handlers.
- `src/telegram/` - Telegram bot.
- `src/sync/` - Core session/message logic.
- `src/store/` - SQLite persistence.
- `src/sse/` - Server-Sent Events.

## Security model

Access is controlled by:
- Telegram chat ID allowlist (when Telegram is enabled).
- Per-user CLI API tokens (recommended) - generate via `POST /api/cli-tokens`.
- Legacy `CLI_API_TOKEN` shared secret (backward compatible, will be deprecated).

**Migration from shared CLI_API_TOKEN to per-user tokens:**

1. **Authenticate via web/Telegram** - Get JWT token using Telegram or legacy CLI_API_TOKEN.
2. **Generate per-user token** - Call `POST /api/cli-tokens` with JWT to create your personal CLI token.
3. **Update CLI configuration** - Replace shared token with new per-user token in CLI settings.
4. **Benefits**: Token isolation, individual revocation, audit trail via `last_used_at`.

**Token Security:**
- Tokens are SHA-256 hashed before storage (plaintext never saved).
- Token displayed only once during generation - store securely.
- Use `DELETE /api/cli-tokens/:id` to revoke compromised tokens.
- Monitor token usage via `last_used_at` field.

Transport security depends on HTTPS in front of the server.

## Build for deployment

From the repo root:

```bash
bun run build:server
bun run build:web
```

The server build output is `server/dist/index.js`, and the web assets are in `web/dist`.

### Docker Deployment

#### Using Docker Compose (recommended)

The project includes Docker Compose configurations for easy deployment:

**Production deployment:**

```bash
# Build and start the server
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the server
docker-compose down
```

**Configuration:**

Create a `.env` file in the project root to configure the server:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_CHAT_IDS=12345678,87654321
CLI_API_TOKEN=your-secret-token
WEBAPP_URL=https://your-domain.example
CORS_ORIGINS=https://your-domain.example
```

Or set environment variables directly in `docker-compose.yml`.

**Data persistence:**

The server data is stored in a Docker volume named `hapi-data`. To backup or inspect the data:

```bash
# Inspect volume
docker volume inspect hapi-data

# Backup data
docker run --rm -v hapi-data:/data -v $(pwd):/backup alpine tar czf /backup/hapi-backup.tar.gz -C /data .

# Restore data
docker run --rm -v hapi-data:/data -v $(pwd):/backup alpine tar xzf /backup/hapi-backup.tar.gz -C /data
```

#### Using Docker directly

Build and run the Docker image directly:

```bash
# Build the image
docker build -f server/Dockerfile -t hapi-server .

# Run the container
docker run -d \
  --name hapi-server \
  -p 3006:3006 \
  -v hapi-data:/data \
  -e TELEGRAM_BOT_TOKEN="your_token" \
  -e ALLOWED_CHAT_IDS="12345678" \
  -e CLI_API_TOKEN="your-secret" \
  -e WEBAPP_URL="https://your-domain.example" \
  hapi-server
```

### E2E Testing with Docker

Run end-to-end tests in an isolated Docker environment:

**Method 1: Run tests from host (recommended)**

```bash
# Start E2E server
docker-compose -f docker-compose.e2e.yml up -d hapi-server

# Run tests from host
HAPI_SERVER_URL=http://localhost:3008 CLI_API_TOKEN=test-token-e2e bun test server/src/__tests__/e2e.test.ts

# Clean up
docker-compose -f docker-compose.e2e.yml down -v
```

**Method 2: Run tests in container (experimental)**

```bash
# Run all services including test container
docker-compose -f docker-compose.e2e.yml up --abort-on-container-exit

# Clean up after tests
docker-compose -f docker-compose.e2e.yml down -v
```

The E2E configuration:
- Spins up a test server with `NODE_ENV=test` on port 3008
- Uses a test API token (`test-token-e2e`)
- Runs tests from `server/src/__tests__/`
- Automatically cleans up after test completion

**Adding more tests:**

Create test files in `server/src/__tests__/` with the pattern `*.test.ts`. Tests can access:
- `HAPI_SERVER_URL`: Server URL (default: `http://hapi-server:3006` in container, `http://localhost:3008` from host)
- `CLI_API_TOKEN`: Test API token for authentication

## Networking notes

- Telegram Mini Apps require HTTPS and a public URL. If the server has no public IP, use Cloudflare Tunnel or Tailscale and set `WEBAPP_URL` to the HTTPS endpoint.
- If the web app is hosted on a different origin, set `CORS_ORIGINS` (or `WEBAPP_URL`) to include that static host origin.

### Exposing with Cloudflare Tunnel

The Docker Compose configuration uses `network_mode: host` to allow cloudflared to access the server at `localhost:3006`.

**Quick temporary tunnel:**

```bash
cloudflared tunnel --url http://localhost:3006
```

This outputs a public URL like `https://random-name.trycloudflare.com` that you can use immediately.

**Update environment variables:**

Once you have the public URL, update your configuration:

```bash
# In .env file or docker-compose.yml
WEBAPP_URL=https://your-tunnel-url.trycloudflare.com
```

Then restart the server:

```bash
docker-compose down && docker-compose up -d
```

For persistent tunnels with custom domains, see [docs/cloudflared-setup.md](../docs/cloudflared-setup.md).

## Standalone web hosting

The web UI can be hosted separately from the server (for example on GitHub Pages or Cloudflare Pages):

1. Build and deploy `web/dist` from the repo root.
2. Set `CORS_ORIGINS` (or `WEBAPP_URL`) to the static host origin.
3. Open the static site, click the Server button on the login screen, and enter the hapi server origin.

Leaving the server override empty preserves the default same-origin behavior when the server serves the web assets directly.
