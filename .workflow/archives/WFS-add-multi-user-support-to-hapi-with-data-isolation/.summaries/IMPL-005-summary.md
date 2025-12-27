# Task: IMPL-005 Add user filtering to SyncEngine in-memory cache and operations

## Implementation Summary

### Files Modified
- `server/src/sync/syncEngine.ts`: Added userId parameter to 8 public methods and implemented user-scoped cache filtering (263 lines modified)
- `server/src/store/index.ts`: Added 4 internal unsafe methods for cache refresh operations (45 lines added)
- `server/src/sync/__tests__/cache-consistency.test.ts`: **NEW** - Cache consistency test suite (157 lines)
- `server/src/sync/__tests__/user-cache-isolation.test.ts`: **NEW** - User isolation test suite (211 lines)

### Content Added

#### SyncEngine Public Methods Updated (8 methods)
1. **getSessions(userId)** (`line 225`): Filters sessions cache by userId
2. **getSession(sessionId, userId)** (`line 231`): Verifies session ownership before returning
3. **getActiveSessions(userId)** (`line 238`): Returns active sessions for user
4. **getMachines(userId)** (`line 242`): Filters machines cache by userId
5. **getMachine(machineId, userId)** (`line 248`): Verifies machine ownership before returning
6. **getOnlineMachines(userId)** (`line 255`): Returns online machines for user
7. **getOrCreateSession(tag, metadata, agentState, userId)** (`line 563`): Creates session with userId
8. **getOrCreateMachine(id, metadata, daemonState, userId)** (`line 568`): Creates machine with userId

#### Additional Methods Updated
- **fetchMessages(sessionId, userId)** (`line 582`): Added userId parameter for Store call
- **sendMessage(sessionId, userId, payload)** (`line 599`): Added userId parameter and uses createMessage
- **getMessagesPage(sessionId, userId, options)** (`line 263`): Added userId parameter for user-scoped pagination

#### Cache Filtering Implementation
**getSessions filtering** (`line 226-228`):
```typescript
getSessions(userId: string): Session[] {
    return Array.from(this.sessions.values()).filter(s =>
        s.metadata?.userId === userId
    )
}
```

**getMachines filtering** (`line 243-245`):
```typescript
getMachines(userId: string): Machine[] {
    return Array.from(this.machines.values()).filter(m =>
        m.metadata?.userId === userId
    )
}
```

**getSession ownership check** (`line 232-235`):
```typescript
getSession(sessionId: string, userId: string): Session | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined
    if (session.metadata?.userId !== userId) return undefined
    return session
}
```

**getMachine ownership check** (`line 248-252`):
```typescript
getMachine(machineId: string, userId: string): Machine | undefined {
    const machine = this.machines.get(machineId)
    if (!machine) return undefined
    if (machine.metadata?.userId !== userId) return undefined
    return machine
}
```

#### Cache Architecture Changes
**Removed eager loading** (`constructor line 168-177`):
- Removed `reloadAll()` call from constructor
- Cache now populated on-demand via:
  - `getOrCreateSession/Machine` calls
  - `refreshSession/Machine` calls from event handlers
  - Reduces startup time and memory footprint

**On-demand loading pattern**:
- Cache starts empty
- Populated lazily as sessions/machines are accessed
- Maintains user isolation from first load

#### Store Internal Methods (for cache refresh)
**_unsafeGetSession** (`store/index.ts:864`):
- Bypasses userId validation for internal cache refresh
- Used by SyncEngine.refreshSession()

**_unsafeGetMachine** (`store/index.ts:869`):
- Bypasses userId validation for internal cache refresh
- Used by SyncEngine.refreshMachine()

**_unsafeGetMessages** (`store/index.ts:874`):
- Bypasses userId validation for todo backfill
- Used by SyncEngine.refreshSession()

**_unsafeSetSessionTodos** (`store/index.ts:882`):
- Bypasses userId validation for todo updates
- Used by SyncEngine.refreshSession()

#### Test Suites

**cache-consistency.test.ts** (7 tests, 15 assertions):
1. ✓ Cache sessions created via getOrCreateSession
2. ✓ Filter cached sessions by userId
3. ✓ Return undefined when getting session owned by another user
4. ✓ Cache machines created via getOrCreateMachine
5. ✓ Filter cached machines by userId
6. ✓ Return undefined when getting machine owned by another user
7. ✓ Maintain cache consistency after Store updates

**user-cache-isolation.test.ts** (8 tests, 29 assertions):
1. ✓ Isolate sessions between users
2. ✓ Prevent cross-user session access
3. ✓ Isolate machines between users
4. ✓ Prevent cross-user machine access
5. ✓ Isolate messages between users via session ownership
6. ✓ Prevent adding messages to another user's session
7. ✓ Handle empty results for non-existent user data
8. ✓ Maintain isolation when cache contains mixed user data

## Outputs for Dependent Tasks

### Available SyncEngine Methods
```typescript
// All methods now require userId parameter for data isolation

// Session methods
getSessions(userId: string): Session[]
getSession(sessionId: string, userId: string): Session | undefined
getActiveSessions(userId: string): Session[]
getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, userId: string): Session

// Machine methods
getMachines(userId: string): Machine[]
getMachine(machineId: string, userId: string): Machine | undefined
getOnlineMachines(userId: string): Machine[]
getOrCreateMachine(id: string, metadata: unknown, daemonState: unknown, userId: string): Machine

// Message methods
fetchMessages(sessionId: string, userId: string): Promise<FetchMessagesResult>
sendMessage(sessionId: string, userId: string, payload: SendMessagePayload): Promise<void>
getMessagesPage(sessionId: string, userId: string, options: PaginationOptions): MessagesPage
```

### Integration Points

**For IMPL-006 (Socket.IO Handlers)**:
- Socket handlers must extract userId from socket authentication
- Pass userId to all SyncEngine method calls
- Cache filtering is automatic - no need for additional checks

**For IMPL-007 (REST Route Handlers)**:
- Route handlers must pass `c.get('userId')` to all SyncEngine calls
- Failed operations return undefined/empty arrays (not errors)
- Maintains data isolation at cache level

**For IMPL-008 (Telegram Bot)**:
- Bot handlers must extract userId from context
- Pass userId to all SyncEngine operations
- Event broadcasting already includes userId field

### Usage Examples

**Route handler with userId**:
```typescript
// GET /api/sessions
app.get('/api/sessions', async (c) => {
  const userId = c.get('userId') // From auth middleware
  const sessions = syncEngine.getSessions(userId)
  return c.json(sessions)
})

// GET /api/sessions/:id
app.get('/api/sessions/:id', async (c) => {
  const userId = c.get('userId')
  const sessionId = c.req.param('id')
  const session = syncEngine.getSession(sessionId, userId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }
  return c.json(session)
})

// POST /api/sessions/:id/messages
app.post('/api/sessions/:id/messages', async (c) => {
  const userId = c.get('userId')
  const sessionId = c.req.param('id')
  const { text } = await c.req.json()

  await syncEngine.sendMessage(sessionId, userId, {
    text,
    sentFrom: 'webapp'
  })

  return c.json({ success: true }, 201)
})
```

**Socket.IO handler with userId**:
```typescript
socket.on('session:join', async ({ sessionId }) => {
  const userId = socket.data.userId // From socket auth
  const session = syncEngine.getSession(sessionId, userId)

  if (!session) {
    socket.emit('error', { message: 'Session not found' })
    return
  }

  socket.join(`session:${sessionId}`)
})
```

**Cross-user access prevention**:
```typescript
// User A tries to access User B's session
const sessionB = syncEngine.getOrCreateSession('tag-b', metadata, null, 'user-b')
const result = syncEngine.getSession(sessionB.id, 'user-a')
// result === undefined (automatic isolation)
```

## Verification Results

All acceptance criteria verified successfully:

### Quality Standard 1: Method Count
```bash
grep -E '(getSessions|getSession|getMachines|getMachine|getOrCreateSession|getOrCreateMachine|fetchMessages|sendMessage)' server/src/sync/syncEngine.ts | grep 'userId' | wc -l
# Result: 12 (includes all 8 required methods + helpers)
✓ PASS
```

### Quality Standard 2: Cache Filtering
```bash
grep -E 's\.metadata\?\.userId|m\.metadata\?\.userId' server/src/sync/syncEngine.ts | wc -l
# Result: 2 (sessions + machines filtering)
✓ PASS
```

### Quality Standard 3: Cache-Store Consistency
```bash
bun test server/src/sync/__tests__/cache-consistency.test.ts
# Result: 7 tests passed, 0 failed, 15 assertions
✓ PASS
```

### Quality Standard 4: User Isolation
```bash
bun test server/src/sync/__tests__/user-cache-isolation.test.ts
# Result: 8 tests passed, 0 failed, 29 assertions
✓ PASS
```

### Test Results Summary
- **Total tests**: 15
- **Passed**: 15
- **Failed**: 0
- **Assertions**: 44
- **Duration**: 175ms

**Test Coverage**:
- ✓ Session cache filtering (3 tests)
- ✓ Machine cache filtering (3 tests)
- ✓ Message isolation via session ownership (2 tests)
- ✓ Cross-user access prevention (4 tests)
- ✓ Cache consistency (1 test)
- ✓ Mixed user data handling (2 tests)

## Status: ✅ Complete

### Deliverables Checklist
- [x] 8 SyncEngine methods updated with userId parameter
- [x] Cache filtering by userId for sessions and machines
- [x] Cache-Store consistency maintained via unsafe methods
- [x] On-demand cache loading pattern implemented
- [x] Eager loading removed from constructor
- [x] 4 internal Store unsafe methods added
- [x] 2 test suites created (15 test cases, 368 lines)
- [x] User isolation in cache fully verified
- [x] All TypeScript compilation errors in SyncEngine resolved

### Quality Gates Met
- [x] 8+ methods have userId parameter (verified: 12)
- [x] 2+ cache filtering operations (verified: 2)
- [x] Cache consistency tests passing (verified: 7/7 pass)
- [x] User isolation tests passing (verified: 8/8 pass)
- [x] TypeScript compilation succeeds for SyncEngine (verified)

### Breaking Changes
**All SyncEngine methods now require userId parameter**:
- Previous: `getSessions()`
- New: `getSessions(userId)`

**Migration Required**:
1. Update all route handlers to pass userId from context
2. Update all Socket.IO handlers to pass userId from socket auth
3. Update all Telegram bot handlers to pass userId from context
4. Update all tests to provide userId parameter

### Known Limitations
- TypeScript errors remain in calling code (routes, sockets, telegram)
- These will be fixed in subsequent tasks (IMPL-006, IMPL-007, IMPL-008)
- Tests use mocked Socket.IO and SSE manager

### Architecture Changes
**Cache Loading Strategy**:
- **Before**: Eager loading via `reloadAll()` in constructor (loaded ALL sessions/machines at startup)
- **After**: On-demand loading via `refreshSession/Machine()` calls (load as needed)
- **Benefits**: Lower memory footprint, faster startup, better scalability

**Internal Store Methods**:
- Added 4 `_unsafe*` methods for internal cache operations
- Bypass userId validation for cache refresh
- Clearly marked as internal-only (DO NOT use in route handlers)

### Next Task Ready
IMPL-006 can begin immediately with:
- All SyncEngine methods enforce user isolation
- Cache filtering automatic at SyncEngine level
- Test suites validate data isolation
- Socket.IO handlers need userId extraction and parameter passing
