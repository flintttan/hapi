# HAPI

> **Fork Notice**: This is a fork of [tiann/hapi](https://github.com/tiann/hapi) with additional features and improvements. The upstream project is based on [slopus/happy](https://github.com/slopus/happy). Great credit to both original projects!

HAPI means "哈皮," a Chinese transliteration of Happy. Run Claude Code / Codex / Gemini sessions locally and control them remotely through a Web / PWA / Telegram Mini App.

## Key Features of This Fork

- ✅ **Multi-user support** - Complete user authentication and session isolation
- ✅ **Enhanced security** - User-based access control and resource ownership validation
- ✅ **Improved Web UI** - Allow message sending during agent thinking (interrupt/continue conversations)
- ✅ **Slash commands** - Full autocomplete support for custom commands
- ✅ **Better documentation** - Comprehensive guides for deployment and features

> **Why HAPI?** HAPI is a local-first alternative to Happy. See [Why Not Happy?](docs/WHY_NOT_HAPPY.md) for the key differences.

## Core Features

- 🚀 Start AI coding sessions from any machine
- 📱 Monitor and control sessions from your phone or browser
- 🔐 Multi-user authentication with session isolation
- ✅ Approve or deny tool permissions remotely
- 📁 Browse files and view git diffs
- 📝 Track session progress with todo lists
- 🤖 Multiple AI backends: Claude Code, Codex, and Gemini
- 💬 Slash commands with autocomplete
- 🔄 Real-time permission and model mode synchronization

## Installation

### From Source (Recommended for this fork)

```bash
git clone https://github.com/flintttan/hapi.git
cd hapi
bun install
bun run build:single-exe
```

The compiled binary will be in `cli/dist/`.

### Prebuilt Binary

Download from [GitHub Releases](https://github.com/flintttan/hapi/releases).

**macOS users**: Remove the quarantine attribute before running:

```bash
xattr -d com.apple.quarantine ./hapi
```

### Docker

Pull the pre-built image from GitHub Container Registry:

```bash
docker pull ghcr.io/flintttan/hapi-server:latest
```

Run the server:

```bash
docker run -d --name hapi -p 3006:3006 -v hapi-data:/data ghcr.io/flintttan/hapi-server:latest
```

<details>
<summary>More options (Telegram + environment variables)</summary>

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBAPP_PORT` | `3006` | Server listening port |
| `CLI_API_TOKEN` | (auto-generated) | Access token for CLI and web UI |
| `TELEGRAM_BOT_TOKEN` | - | Telegram bot token (optional) |
| `WEBAPP_URL` | - | Public URL for Telegram Mini App |
| `ALLOWED_CHAT_IDS` | - | Comma-separated Telegram chat IDs |

#### With Telegram Support

```bash
docker run -d \
  --name hapi \
  -p 3006:3006 \
  -v hapi-data:/data \
  -e WEBAPP_URL="https://your-domain.example" \
  -e TELEGRAM_BOT_TOKEN="your-bot-token" \
  -e ALLOWED_CHAT_IDS="12345678" \
  ghcr.io/flintttan/hapi-server:latest
```

#### Build from Source

```bash
docker build -t hapi-server -f server/Dockerfile .
```

</details>

## Quick Start

### Single-User Setup (Default)

1. **Start the server** on a machine you control:

```bash
./hapi server
```

The server will start on `http://localhost:3006` with an auto-generated access token.

2. **Find your access token**:

```bash
cat ~/.hapi/settings.json | grep cliApiToken
```

3. **Run the CLI** on the machine where you want sessions:

```bash
# If server is not on localhost:3006
export HAPI_SERVER_URL="https://your-domain.example"

./hapi
```

4. **Open the Web UI** at the server URL and log in with your `CLI_API_TOKEN`.

### Multi-User Setup

For production deployment with multiple users, see [Multi-User Quick Start](docs/quickstart-multi-user.md).

### Expose Server Over HTTPS

If your server has no public IP:
- **Cloudflare Tunnel**: [Setup Guide](docs/cloudflared-setup.md)
- **Tailscale**: https://tailscale.com/kb/

### Custom Access Token

You can set your own token via environment variable (takes priority over auto-generated token):

```bash
export CLI_API_TOKEN="your-secret-token"
```

## Telegram Mini App (optional)

To use Telegram for notifications and the Mini App:

1. Create a bot with @BotFather and get the token.

2. Expose your server over HTTPS (Cloudflare Tunnel, Tailscale, etc.).

3. Add environment variables:

```
WEBAPP_URL="https://your-domain.example"
TELEGRAM_BOT_TOKEN="..."
```

4. Start the server and send `/start` to the bot to get your chat ID.

5. Add your chat ID and restart:

```
ALLOWED_CHAT_IDS="12345678"
```

6. Run `/app` in the bot chat to open the Mini App.

## Multi-agent support

- `hapi` - Start a Claude Code session.
- `hapi codex` - Start an OpenAI Codex session.
- `hapi gemini` - Start a Google Gemini session.

## CLI config file

You can store the token in `~/.hapi/settings.json` instead of an env var.
Environment variables take priority over the file.

## Requirements

- Claude CLI installed and logged in (`claude` on PATH) for Claude Code sessions.
- Bun if building from source.

## Build from Source

```bash
bun install
bun run build:single-exe
```

The compiled binary will be in `cli/dist/hapi`.

## Project Links

- 🏠 **This Fork**: [flintttan/hapi](https://github.com/flintttan/hapi)
- ⬆️ **Upstream**: [tiann/hapi](https://github.com/tiann/hapi)
- 🎯 **Original Project**: [slopus/happy](https://github.com/slopus/happy)
- 📦 **Docker Images**: [ghcr.io/flintttan/hapi-server](https://github.com/flintttan/hapi/pkgs/container/hapi-server)
- 📝 **Releases**: [GitHub Releases](https://github.com/flintttan/hapi/releases)

## Documentation

### 📚 Main Documentation
- **[docs/](docs/)** - Complete documentation index
- **[docs/WHY_NOT_HAPPY.md](docs/WHY_NOT_HAPPY.md)** - Why HAPI exists: architectural differences from Happy

### 🚀 Quick Start Guides
- **[docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md)** - MCP DevTools quick start
- **[docs/quickstart-multi-user.md](docs/quickstart-multi-user.md)** - Multi-user deployment quick start

### 🔧 Features & Setup
- **[docs/AUTO_LOGIN.md](docs/AUTO_LOGIN.md)** - Automatic authentication
- **[docs/AGENTS.md](docs/AGENTS.md)** - Agent types (Claude, Codex, Gemini)
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment guide
- **[docs/multi-user-guide.md](docs/multi-user-guide.md)** - Multi-user setup

### 💻 Component Documentation
- **[cli/README.md](cli/README.md)** - CLI usage and config
- **[server/README.md](server/README.md)** - Server setup and architecture
- **[web/README.md](web/README.md)** - Web app behavior and dev workflow

## License

- cli: MIT
- others: LGPLv2
