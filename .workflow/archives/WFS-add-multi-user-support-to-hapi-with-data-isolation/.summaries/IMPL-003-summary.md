# Task: IMPL-003 Add userId parameter to all Store methods and implement user-scoped queries

## Implementation Summary

### Files Modified
- `server/src/store/index.ts`: Added userId parameter to 15 Store methods and implemented user-scoped queries (lines 153-815)
- `server/src/store/__tests__/user-isolation.test.ts`: **NEW** - User isolation test suite (258 lines)

### Content Added

#### Validation Helper
**validateUserId** (`server/src/store/index.ts:153-157`):
- Validates userId is non-empty string
- Throws descriptive error for invalid input
- Called at start of all 15 modified methods

#### Session Methods (5 methods updated)
1. **getSession(id, userId)** (`line 401`): Added WHERE user_id = ? filter
2. **getSessions(userId)** (`line 407`): Added WHERE user_id = ? filter
3. **createSession(data, userId)** (`line 413`): Added user_id to INSERT statement
4. **updateSession(sessionId, updates, userId)** (`line 453`): Added WHERE user_id = ? filter
5. **deleteSession(sessionId, userId)** (`line 494`): Added WHERE user_id = ? filter

**Additional session methods updated**:
- **getOrCreateSession** (`line 267`): Added userId parameter and user_id filtering
- **updateSessionMetadata** (`line 308`): Added userId parameter and WHERE user_id = ? filter
- **updateSessionAgentState** (`line 342`): Added userId parameter and WHERE user_id = ? filter
- **setSessionTodos** (`line 376`): Added userId parameter and WHERE user_id = ? filter

#### Machine Methods (5 methods updated)
1. **getMachine(id, userId)** (`line 617`): Added WHERE user_id = ? filter
2. **getMachines(userId)** (`line 623`): Added WHERE user_id = ? filter
3. **createMachine(data, userId)** (`line 629`): Added user_id to INSERT statement
4. **updateMachine(machineId, updates, userId)** (`line 663`): Added WHERE user_id = ? filter
5. **deleteMachine(machineId, userId)** (`line 696`): Added WHERE user_id = ? filter

**Additional machine methods updated**:
- **getOrCreateMachine** (`line 508`): Added userId parameter and user_id filtering
- **updateMachineMetadata** (`line 547`): Added userId parameter and WHERE user_id = ? filter
- **updateMachineDaemonState** (`line 581`): Added userId parameter and WHERE user_id = ? filter

#### Message Methods (5 methods updated)
1. **getMessages(sessionId, userId)** (`line 759`): Added JOIN with sessions to verify user_id ownership
2. **createMessage(sessionId, content, userId)** (`line 710`): Added session ownership verification before INSERT
3. **updateMessage(messageId, updates, userId)** (`line 775`): Added subquery to verify session ownership
4. **deleteMessage(messageId, userId)** (`line 796`): Added subquery to verify session ownership
5. **getSessionMessages(sessionId, userId)** (`line 811`): Alias for getMessages with user validation

**Query Patterns**:
- **Messages via JOIN**: `SELECT m.* FROM messages m JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ?`
- **Messages via subquery**: `WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)`

#### Schema Updates
**Updated initSchema** (`line 197-265`):
- Added `user_id TEXT NOT NULL DEFAULT 'admin-user'` to sessions table
- Added `user_id TEXT NOT NULL DEFAULT 'admin-user'` to machines table
- Added `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` to both tables
- Added `idx_sessions_user_id` index
- Added `idx_machines_user_id` index

#### Test Suite
**user-isolation.test.ts** (258 lines, 15 test cases):

**Session Isolation Tests (4 tests)**:
1. User A cannot read User B's sessions
2. getSessions returns only owned sessions
3. User A cannot update User B's session
4. User A cannot delete User B's session

**Machine Isolation Tests (3 tests)**:
1. getMachines returns only owned machines
2. User A cannot access User B's machine
3. User A cannot delete User B's machine

**Message Isolation Tests (3 tests)**:
1. Messages inherit session ownership
2. User B cannot add message to User A's session
3. User A cannot delete User B's message

**Validation Tests (4 tests)**:
1. Empty userId throws error
2. Null userId throws error
3. Undefined userId throws error
4. Whitespace-only userId throws error

**Foreign Key Tests (1 test)**:
1. Schema verification for cascade delete

## Outputs for Dependent Tasks

### Available Store Methods
```typescript
// All methods now require userId parameter for data isolation

// Session methods
getSessions(userId: string): StoredSession[]
getSession(id: string, userId: string): StoredSession | null
createSession(data: SessionData, userId: string): StoredSession
updateSession(sessionId: string, updates: Partial<Session>, userId: string): boolean
deleteSession(sessionId: string, userId: string): boolean

// Machine methods
getMachines(userId: string): StoredMachine[]
getMachine(id: string, userId: string): StoredMachine | null
createMachine(data: MachineData, userId: string): StoredMachine
updateMachine(machineId: string, updates: Partial<Machine>, userId: string): boolean
deleteMachine(machineId: string, userId: string): boolean

// Message methods
getMessages(sessionId: string, userId: string, limit?: number, beforeSeq?: number): StoredMessage[]
createMessage(sessionId: string, content: unknown, userId: string, localId?: string): StoredMessage
updateMessage(messageId: string, updates: Partial<Message>, userId: string): boolean
deleteMessage(messageId: string, userId: string): boolean
getSessionMessages(sessionId: string, userId: string, limit?: number, beforeSeq?: number): StoredMessage[]
```

### Integration Points

**For IMPL-004 (Route Guards)**:
- All Store methods now enforce user isolation at database level
- Route handlers must pass `c.get('userId')` to all Store method calls
- Failed operations return null/false (not found) instead of throwing errors (prevents data leak)

**For IMPL-005 (SyncEngine)**:
- SyncEngine must add userId parameter to all Store method calls
- In-memory cache needs user-scoped filtering to match database behavior
- Event broadcasting must filter listeners by userId

**For IMPL-006 (Socket.IO Handlers)**:
- Socket handlers must extract userId from socket.data.userId
- Pass userId to all Store operations
- Validate userId before any database operation

### Usage Examples

**Route handler with userId**:
```typescript
// GET /api/sessions
app.get('/api/sessions', async (c) => {
  const userId = c.get('userId') // From auth middleware
  const sessions = store.getSessions(userId)
  return c.json(sessions)
})

// GET /api/sessions/:id
app.get('/api/sessions/:id', async (c) => {
  const userId = c.get('userId')
  const sessionId = c.req.param('id')
  const session = store.getSession(sessionId, userId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }
  return c.json(session)
})

// POST /api/sessions
app.post('/api/sessions', async (c) => {
  const userId = c.get('userId')
  const data = await c.req.json()
  const session = store.createSession(data, userId)
  return c.json(session, 201)
})
```

**Cross-user access blocked**:
```typescript
// User A tries to access User B's session
const sessionB = store.createSession({ tag: 'b1', metadata: {} }, 'user-b')
const result = store.getSession(sessionB.id, 'user-a')
// result === null (not found, no error thrown)
```

**Validation example**:
```typescript
// Invalid userId throws error
try {
  store.getSessions('') // Empty string
} catch (error) {
  // Error: Invalid userId: userId must be a non-empty string
}

try {
  store.getSessions('   ') // Whitespace only
} catch (error) {
  // Error: Invalid userId: userId must be a non-empty string
}
```

**Message ownership verification**:
```typescript
// Messages inherit session ownership
const sessionA = store.createSession({ tag: 'a', metadata: {} }, 'user-a')
const message = store.createMessage(sessionA.id, { text: 'hello' }, 'user-a')

// User B cannot access User A's messages
const messages = store.getMessages(sessionA.id, 'user-b')
// messages.length === 0 (empty array, not error)

// User B cannot add message to User A's session
try {
  store.createMessage(sessionA.id, { text: 'hacked' }, 'user-b')
} catch (error) {
  // Error: Session not found or access denied
}
```

## Verification Results

All acceptance criteria verified successfully:

### Quality Standard 1: Method Count
```bash
grep -E '(getSessions|getSession|createSession|updateSession|deleteSession|getMachines|getMachine|createMachine|updateMachine|deleteMachine|getMessages|createMessage|updateMessage|deleteMessage|getSessionMessages)\(' server/src/store/index.ts | grep userId | wc -l
# Result: 21 (all 15 required methods + 6 additional helper methods)
✓ PASS
```

### Quality Standard 2: Query Filtering
```bash
grep -E 'WHERE.*user_id = (\?|@)' server/src/store/index.ts | wc -l
# Result: 24 (exceeds minimum of 15)
✓ PASS
```

### Quality Standard 3: INSERT Statements
```bash
grep -A5 'INSERT INTO sessions' server/src/store/index.ts | grep user_id | wc -l
# Result: 2 (getOrCreateSession + createSession)

grep -A5 'INSERT INTO machines' server/src/store/index.ts | grep user_id | wc -l
# Result: 2 (getOrCreateMachine + createMachine)

# Total: 4 INSERT statements with user_id (messages table inherits via session FK)
✓ PASS
```

### Quality Standard 4: Data Isolation
```bash
bun test server/src/store/__tests__/user-isolation.test.ts
# Result: 15 pass, 0 fail
✓ PASS
```

### Test Results Summary
- **Total tests**: 15
- **Passed**: 15
- **Failed**: 0
- **Expect calls**: 30
- **Duration**: 151ms

**Test Coverage**:
- ✓ Session isolation (4 tests)
- ✓ Machine isolation (3 tests)
- ✓ Message isolation (3 tests)
- ✓ UserId validation (4 tests)
- ✓ Foreign key cascade (1 test)

## Status: ✅ Complete

### Deliverables Checklist
- [x] 15 Store methods updated with userId parameter
- [x] 24 SQL queries with user_id filtering
- [x] 4 INSERT statements including user_id
- [x] validateUserId helper function
- [x] User isolation test suite (15 test cases, 258 lines)
- [x] Data isolation between users fully enforced
- [x] Schema updated with user_id columns and foreign keys

### Quality Gates Met
- [x] 15+ methods have userId parameter (verified: 21)
- [x] 15+ queries use user_id filter (verified: 24)
- [x] 4+ INSERT statements include user_id (verified: 4)
- [x] All tests passing (verified: 15/15 pass, 0 fail)

### Breaking Changes
**All Store methods now require userId parameter**:
- Previous: `store.getSessions()`
- New: `store.getSessions(userId)`

**Migration Required**:
1. Update all SyncEngine calls to pass userId
2. Update all route handlers to extract userId from context
3. Update all Socket.IO handlers to pass socket userId
4. Update all tests to provide userId parameter

### Next Task Ready
IMPL-004 can begin immediately with:
- All Store methods enforce user isolation
- Database schema includes user_id columns with foreign keys
- Test suite validates data isolation
- Validation helper prevents invalid userId values
