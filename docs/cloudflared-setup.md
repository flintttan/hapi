# Cloudflared Tunnel Setup for HAPI

This guide explains how to expose your HAPI server using Cloudflare Tunnel.

## Quick Start (Temporary Tunnel)

For quick testing without authentication:

```bash
cloudflared tunnel --url http://localhost:3006
```

This will output a URL like `https://random-name.trycloudflare.com` that you can use immediately.

## Persistent Tunnel Setup

For production use with a custom domain:

### 1. Login to Cloudflare

```bash
cloudflared tunnel login
```

### 2. Create a Tunnel

```bash
cloudflared tunnel create hapi
```

This will create a tunnel and output the tunnel ID and credentials file location.

### 3. Configure DNS

```bash
# Replace TUNNEL_ID with your actual tunnel ID
cloudflared tunnel route dns hapi hapi.yourdomain.com
```

### 4. Create Configuration File

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: TUNNEL_ID
credentials-file: /Users/YOUR_USERNAME/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: hapi.yourdomain.com
    service: http://localhost:3006
  - service: http_status:404
```

### 5. Run the Tunnel

```bash
cloudflared tunnel run hapi
```

Or run as a service:

```bash
cloudflared service install
```

## Docker Compose Network Configuration

The HAPI server is configured with `network_mode: host` to allow cloudflared to access it at `localhost:3006`.

**Important:** This means:
- The container shares the host's network stack
- No port mapping is needed
- The service is directly accessible at `localhost:3006` from the host

## Environment Variables

Don't forget to set the `WEBAPP_URL` in your docker-compose configuration or `.env` file:

```env
WEBAPP_URL=https://hapi.yourdomain.com
```

This is required for Telegram Mini Apps to work correctly.

## Troubleshooting

### Check if server is accessible locally

```bash
curl http://localhost:3006/
```

### Check cloudflared tunnel status

```bash
cloudflared tunnel info hapi
```

### View cloudflared logs

```bash
cloudflared tunnel run hapi --loglevel debug
```

## Alternative: Using Docker Network (Not Recommended for Cloudflared)

If you need to use bridge network mode instead of host mode, you can:

1. Change `network_mode: host` to `ports: - "3006:3006"` in docker-compose.yml
2. Run cloudflared inside a container in the same network
3. Use `http://hapi-server:3006` as the service URL

This is more complex and not recommended for most use cases.
