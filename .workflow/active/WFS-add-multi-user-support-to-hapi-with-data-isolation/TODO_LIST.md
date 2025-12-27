# Tasks: Add multi-user support to HAPI with data isolation

## Phase 1: Database Foundation (Days 1-3)
- [ ] **IMPL-001**: Create users table and database schema migration → [📋](./.task/IMPL-001.json)
- [ ] **IMPL-002**: Implement user management system replacing ownerId mechanism → [📋](./.task/IMPL-002.json)

## Phase 2: Data Access Layer (Days 4-6)
- [ ] **IMPL-003**: Add userId parameter to all Store methods and implement user-scoped queries → [📋](./.task/IMPL-003.json)

## Phase 3: Application Layer (Days 7-11) - PARALLEL EXECUTION
- [ ] **IMPL-004**: Extend route guards with user ownership validation → [📋](./.task/IMPL-004.json)
- [ ] **IMPL-005**: Add user filtering to SyncEngine in-memory cache and operations → [📋](./.task/IMPL-005.json)
- [ ] **IMPL-006**: Implement user-scoped event broadcasting for Socket.IO and SSE → [📋](./.task/IMPL-006.json)
- [ ] **IMPL-007**: Implement per-user CLI API token generation system → [📋](./.task/IMPL-007.json)

## Phase 4: Integration Testing (Days 12-14)
- [ ] **IMPL-008**: Integration testing and end-to-end multi-user workflow validation → [📋](./.task/IMPL-008.json)

## Parallelization Strategy

**Window 1** (After IMPL-003):
- Execute in parallel: IMPL-004 + IMPL-005 + IMPL-006

**Window 2** (Overlapping):
- IMPL-007 can start after IMPL-002, overlaps with IMPL-005/IMPL-006

## Critical Path
IMPL-001 → IMPL-002 → IMPL-003 → IMPL-008

## Task Dependencies
```
IMPL-001 (Database Schema)
    ↓
IMPL-002 (User Management)
    ↓
IMPL-003 (Store Methods)
    ├──→ IMPL-004 (Route Guards)
    ├──→ IMPL-005 (SyncEngine)
    ├──→ IMPL-006 (Event Broadcasting)
    └──→ IMPL-007 (CLI Tokens)
         ↓
    IMPL-008 (Integration Testing)
```

## Status Legend
- `- [ ]` = Pending task
- `- [x]` = Completed task

## Quick Links
- [Implementation Plan](./IMPL_PLAN.md)
- [Context Package](./.process/context-package.json)
- [Exploration Results](./.process/explorations-manifest.json)
