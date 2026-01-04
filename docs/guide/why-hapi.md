# Why HAPI?

[Happy](https://github.com/slopus/happy) is an excellent project. So why build HAPI?

**The short answer**: Happy is designed for cloud hosting with multiple users. HAPI is designed for self-hosting with a single user or small team. These different goals lead to fundamentally different architectures.

## TL;DR

| Aspect | Happy | HAPI |
|--------|-------|------|
| **Design** | Cloud-first | Local-first |
| **Users** | Multi-user | Single user / small teams |
| **Data** | Encrypted on server | Never leaves your machine |
| **Deployment** | Multiple services | Single binary |
| **Complexity** | High (E2EE, scaling) | Low (one command) |

**Choose HAPI if**: You want personal or small team use, data sovereignty, and minimal setup.

**Choose Happy if**: You need large-scale multi-user collaboration or enterprise features.

## Architecture Comparison

### Happy: Cloud-First

Happy's cloud design requires:

- **End-to-end encryption** - Because you don't trust the server
- **Distributed database + cache** - Because you need to scale
- **Complex deployment** - Docker, multiple services, config files

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             PUBLIC INTERNET                             │
│                                                                         │
│   ┌─────────────┐                    ┌─────────────────────────────────┐│
│   │             │                    │                                 ││
│   │  Mobile App │◄───── E2EE ───────►│        Cloud Server             ││
│   │             │                    │                                 ││
│   └─────────────┘                    │  ┌─────────────────────────────┐││
│                                      │  │   Encrypted Database        │││
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

### HAPI: Local-First

HAPI's local design simplifies everything:

- **No E2EE needed** - Your data never leaves your machine
- **Single embedded database** - No scaling required
- **One-command deployment** - Single binary, zero config

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRIVATE NETWORK                               │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                   Single Process / Binary                      │   │
│   │                                                                │   │
│   │  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │   │
│   │  │   CLI    │◄──►│  Server  │◄──►│ Web App  │                  │   │
│   │  └──────────┘    └────┬─────┘    └──────────┘                  │   │
│   │                       │                                        │   │
│   │                       ▼                                        │   │
│   │              ┌────────────────┐                                │   │
│   │              │ Local Database │                                │   │
│   │              │  (plaintext)   │                                │   │
│   │              └────────────────┘                                │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                            │                                           │
│                            ▼ localhost                                 │
└────────────────────────────┼───────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Tunnel (Optional)│
                    │ for remote access│
                    └─────────────────┘
```

## Key Differences

### Data Location

| Aspect | Happy | HAPI |
|--------|-------|------|
| **Where data lives** | Cloud server | Your local machine |
| **Who can access** | Server stores encrypted blobs | Only you |
| **Trust model** | Don't trust server → E2EE | Trust local → TLS sufficient |

### Deployment Model

**Happy** requires orchestrating multiple components:

```
┌───────────────────────────────────────────────────────────────────┐
│   Distributed Services (4+ components)                            │
│                                                                   │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│   │ Database │  │  Cache   │  │ Storage  │  │  Server  │          │
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
│   │  CLI + Server + Web App + Database (embedded)               │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│   Requires: One command to run                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Security Approach

| Aspect | Happy | HAPI |
|--------|-------|------|
| **Problem** | Data on untrusted server | External access to local data |
| **Solution** | End-to-end encryption | Tunnel with TLS |
| **Complexity** | High (key management) | Low (tunnel setup) |
| **Data at rest** | Encrypted | Plaintext (protected by OS) |

## Why Different Architectures?

### Happy's Constraints

```
Goal: Multi-user cloud platform
         │
         ├──► Users don't trust your server
         │         └──► Must encrypt everything (E2EE)
         │
         ├──► Many concurrent users
         │         └──► Must scale horizontally
         │
         └──► Multiple devices per user
                   └──► Must sync state across devices
```

**Result**: Sophisticated but complex architecture

### HAPI's Simplifications

```
Goal: Self-hosted tool for individuals or small teams
         │
         ├──► Data stays on your machine
         │         └──► No E2EE needed
         │
         ├──► Limited users (via namespaces)
         │         └──► No horizontal scaling needed
         │
         └──► One primary device
                   └──► Minimal sync logic
```

**Result**: Simple and portable architecture

## Summary

| Dimension | Happy | HAPI |
|-----------|-------|------|
| **Philosophy** | Cloud-first | Local-first |
| **Data location** | Server (encrypted) | Local (plaintext) |
| **Deployment** | Multiple services | Single binary |
| **Scaling** | Horizontal | None needed |
| **Encryption** | Application-layer E2EE | Transport-layer TLS |
| **Target user** | Teams, cloud users | Individuals, small teams, self-hosters |

## Conclusion

The architectural differences stem from fundamentally different goals:

- **Happy**: Built for multi-user cloud scenarios. Solves the "untrusted server" problem with E2EE, at the cost of deployment complexity.

- **HAPI**: Built for individuals or small teams who self-host. Solves the "remote access" problem with simple networking, achieving one-command deployment.

If you want to self-host for personal or small team use, HAPI removes all the complexity that Happy needs for its cloud service.
