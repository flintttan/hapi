# Why HAPI?

[Happy](https://github.com/slopus/happy) is an excellent project. So why build HAPI?

**The short answer**: Happy uses a centralized server that stores your encrypted data. HAPI is decentralized — each user runs their own hub, and the relay server only forwards encrypted traffic without storing anything. These different goals lead to fundamentally different architectures.

## TL;DR

| Aspect | Happy | HAPI |
|--------|-------|------|
| **Architecture** | Centralized (cloud server stores encrypted data) | Decentralized (each user runs own hub) |
| **Users** | Multi-user on shared server | Any number (each runs own hub) |
| **Data** | Encrypted on server (server cannot read) | Stays on your machine |
| **Encryption** | Application-layer E2EE (client encrypts before sending) | WireGuard + TLS via relay; or none needed if self-hosted |
| **Deployment** | Multiple services (PostgreSQL, Redis, app server) | Single binary |
| **Complexity** | High (E2EE, key management, scaling) | Low (one command) |

**Choose HAPI if**: You want data sovereignty, self-hosting, and minimal setup.

**Choose Happy if**: You need a managed cloud service with multi-user collaboration.

## Architecture Comparison

### Happy: Centralized Cloud

Happy's centralized design requires:

- **Application-layer E2EE** — Clients encrypt before sending; the server stores encrypted blobs it cannot read
- **Distributed database + cache** — PostgreSQL + Redis for multi-user scaling
- **Complex deployment** — Docker, multiple services, config files

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             PUBLIC INTERNET                             │
│                                                                         │
│   ┌─────────────┐                    ┌─────────────────────────────────┐│
│   │             │                    │        Cloud Server             ││
│   │  Mobile App │◄───── E2EE ───────►│                                 ││
│   │             │                    │  ┌─────────────────────────────┐││
│   └─────────────┘                    │  │   Encrypted Database        │││
│                                      │  │   (server cannot read)      │││
│                                      │  └─────────────────────────────┘││
│                                      └────────────────┬────────────────┘│
│                                                       │ E2EE            │
└───────────────────────────────────────────────────────┼─────────────────┘
                                                        ▼
                                             ┌───────────────────┐
                                             │       CLI         │
                                             │ (holds the keys)  │
                                             └───────────────────┘
```

The server stores encrypted data — it never sees plaintext, but it does hold your data.

### HAPI: Decentralized

Each user runs their own hub. HAPI offers two modes of remote access:

- **Self-hosted** (own server / Cloudflare Tunnel / Tailscale) — You control the full network path, no E2EE needed
- **Public relay** (`hapi hub --relay`) — E2E encrypted via tunwg (WireGuard + TLS); the relay only forwards opaque packets
- **Single embedded database** — SQLite, no external services
- **One-command deployment** — Single binary, zero config

#### Mode 1: Self-Hosted (own server or tunnel)

You control the entire path. No encryption beyond standard HTTPS is needed.

```
┌────────────────────────────────────────────────────────────────────────┐
│                       YOUR NETWORK / TUNNEL                            │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                   Single Process / Binary                      │   │
│   │                                                                │   │
│   │  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │   │
│   │  │   CLI    │◄──►│   Hub    │◄──►│ Web App  │                  │   │
│   │  └──────────┘    └────┬─────┘    └──────────┘                  │   │
│   │                       │                                        │   │
│   │                       ▼                                        │   │
│   │              ┌────────────────┐                                │   │
│   │              │ Local Database │                                │   │
│   │              │  (plaintext)   │                                │   │
│   │              └────────────────┘                                │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                            │                                           │
│                            ▼ HTTPS                                     │
│               ┌────────────────────────┐                               │
│               │ Cloudflare / Tailscale │                               │
│               │ / Public IP / etc.     │                               │
│               └────────────────────────┘                               │
└────────────────────────────────────────────────────────────────────────┘
```

#### Mode 2: Public Relay (E2E encrypted)

The relay server only forwards encrypted packets — it cannot read your data.

```
┌────────────────────────────────────────────────────────────────────────┐
│                       YOUR MACHINE                                     │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                   Single Process / Binary                      │   │
│   │                                                                │   │
│   │  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │   │
│   │  │   CLI    │◄──►│   Hub    │◄──►│ Web App  │                  │   │
│   │  └──────────┘    └────┬─────┘    └──────────┘                  │   │
│   │                       │                                        │   │
│   │                       ▼                                        │   │
│   │              ┌────────────────┐                                │   │
│   │              │ Local Database │                                │   │
│   │              │  (plaintext)   │                                │   │
│   │              └────────────────┘                                │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                            │                                           │
│                            ▼ tunwg (WireGuard + TLS)                   │
└────────────────────────────┼───────────────────────────────────────────┘
                             │ E2E encrypted
                    ┌────────▼────────┐
                    │  Relay Server   │
                    │  (forwards only,│
                    │  cannot read)   │
                    └────────┬────────┘
                             │ E2E encrypted
                    ┌────────▼────────┐
                    │  Your Phone /   │
                    │  Browser        │
                    └─────────────────┘
```

## Key Differences

### Data Location

| Aspect | Happy | HAPI |
|--------|-------|------|
| **Where data lives** | Cloud server (encrypted blobs) | Your own machine |
| **Who stores it** | Central server holds encrypted data | Only your hub, locally |
| **Data at rest** | Encrypted (server cannot read) | Plaintext (protected by OS) |
| **Server's role** | Stores encrypted data + syncs devices | Relay only forwards (or no server at all if self-hosted) |

### Deployment Model

**Happy** requires orchestrating multiple components:

```
┌───────────────────────────────────────────────────────────────────┐
│   Distributed Services (4+ components)                            │
│                                                                   │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│   │ Database │  │  Cache   │  │ Storage  │  │  Server  │          │
│   │(Postgres)│  │ (Redis)  │  │ (Files)  │  │(Node.js) │          │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                   │
│   Requires: Container orchestration, multiple config files        │
└───────────────────────────────────────────────────────────────────┘
```

**HAPI** bundles everything:

```
┌───────────────────────────────────────────────────────────────────┐
│   Single Binary (everything bundled)                              │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │  CLI + Hub + Web App + Database (SQLite, embedded)          │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│   Requires: One command to run                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Security Approach

| Aspect | Happy | HAPI (self-hosted) | HAPI (relay) |
|--------|-------|-------------------|--------------|
| **Problem** | Data on untrusted server | Remote access to local hub | Remote access via third-party relay |
| **Solution** | Application-layer E2EE | HTTPS (you control the path) | WireGuard + TLS (tunwg) |
| **Key management** | Client holds keys; server never sees plaintext | Not needed | Handled by tunwg automatically |
| **Data at rest** | Encrypted on server | Plaintext on your machine | Plaintext on your machine |

## Why Different Architectures?

### Happy: Centralized

```
Goal: Multi-user cloud platform
         │
         ├──► Server stores user data
         │         └──► Must encrypt everything (application-layer E2EE)
         │
         ├──► Many concurrent users on one server
         │         └──► Must scale horizontally (PostgreSQL, Redis)
         │
         └──► Multiple devices per user
                   └──► Must sync encrypted state across devices
```

**Result**: Sophisticated infrastructure with zero-knowledge server

### HAPI: Decentralized

```
Goal: Self-hosted tool — each user runs their own hub
         │
         ├──► Data never leaves your machine
         │         └──► No application-layer E2EE needed
         │
         ├──► Each user has their own hub
         │         └──► No horizontal scaling needed; unlimited users in aggregate
         │
         ├──► Self-hosted access (own server/tunnel)
         │         └──► You control the full path — HTTPS sufficient
         │
         └──► Public relay access
                   └──► WireGuard + TLS (tunwg) — relay forwards only
```

**Result**: Simple, portable, one-command deployment

## Summary

| Dimension | Happy | HAPI |
|-----------|-------|------|
| **Architecture** | Centralized cloud server | Decentralized (each user runs own hub) |
| **Server's role** | Stores encrypted data | Relay only forwards (or none if self-hosted) |
| **Data location** | Server (encrypted, zero-knowledge) | Local (plaintext, your machine) |
| **Deployment** | Multiple services (PostgreSQL, Redis, Node.js) | Single binary (embedded SQLite) |
| **Encryption** | Application-layer E2EE (client-side) | WireGuard + TLS (relay) or HTTPS (self-hosted) |
| **Scaling** | Horizontal (multi-user on shared server) | Per-user (each runs own hub) |
| **Target user** | Managed cloud service users | Self-hosters who want data sovereignty |

## Conclusion

The architectural differences stem from a centralized vs decentralized design:

- **Happy**: Centralized cloud server that stores your encrypted data. The server never sees plaintext (zero-knowledge), but it does hold your data. This requires application-layer E2EE, key management, and distributed infrastructure (PostgreSQL, Redis, scaling).

- **HAPI**: Decentralized — each user runs their own hub. Your data stays on your machine. For remote access, you can self-host (own server or tunnel — no E2EE needed since you control the path) or use the public relay (WireGuard + TLS via tunwg — the relay only forwards encrypted packets it cannot read). This achieves one-command deployment with zero external dependencies.

The core tradeoff: Happy solves the "untrusted server" problem with sophisticated encryption. HAPI avoids the problem entirely by keeping your data on your own machine.
