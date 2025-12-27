# Task: IMPL-002 Implement user management system replacing ownerId mechanism

## Implementation Summary

### Files Modified
- `server/src/store/index.ts`: Added User type and 4 CRUD methods (createUser, getUserById, getUserByTelegramId, getAllUsers) + users table in initSchema
- `server/src/web/routes/auth.ts`: Created getOrCreateUser() and getUserByCliToken() helpers, replaced getOrCreateOwnerId calls
- `server/src/web/middleware/auth.ts`: Updated WebAppEnv to use string userId and JWT payload schema
- `server/src/web/server.ts`: Added Store parameter to createWebApp and startWebServer functions
- `server/src/index.ts`: Passed Store instance to startWebServer
- `server/src/web/ownerId.ts`: Added @deprecated JSDoc with migration guide
- `server/package.json`: Added nanoid@5.1.6 dependency
- `server/src/store/__tests__/user-management.test.ts`: **NEW** - Comprehensive test suite for user management (8 tests)

### Content Added

#### Store Class User Management (`server/src/store/index.ts`)

**User Type** (lines 9-14):
```typescript
export type User = {
    id: string
    telegram_id: string | null
    username: string
    created_at: number
}
```

**Database Schema** (lines 193-198):
- **users table**: Added to initSchema() with columns (id, telegram_id UNIQUE, username, created_at)

**CRUD Methods** (lines 563-597):
- **createUser(user)**: Creates new user with INSERT INTO users, supports optional created_at timestamp
- **getUserById(id)**: Retrieves user by id with SELECT query
- **getUserByTelegramId(telegramId)**: Retrieves user by telegram_id with SELECT query
- **getAllUsers()**: Retrieves all users ordered by created_at DESC

#### Authentication Helpers (`server/src/web/routes/auth.ts`)

**getOrCreateUser()** (lines 24-37):
- Checks if user exists via getUserByTelegramId
- Creates new user with nanoid-generated ID if not exists
- Uses username fallback pattern: `User-{telegram_id}` if username not provided
- Returns User object for Telegram authentication flow

**getUserByCliToken()** (lines 42-60):
- Creates/retrieves synthetic CLI user with fixed ID 'cli-user'
- Implements in-memory caching to avoid repeated DB queries
- Supports legacy shared token migration (single user for all CLI requests)
- Returns User object for CLI authentication flow

**Authentication Route Updates** (lines 63-127):
- Replaced `userId: number` with `user: User`
- Telegram auth: Calls `getOrCreateUser(store, String(telegramUserId), result.user.username)`
- CLI auth: Calls `getUserByCliToken(store)`
- JWT payload: Changed from `{ uid: number }` to `{ uid: string }` (user.id)
- Response: Returns user object with `{ id, username, firstName, lastName }`

#### Middleware Updates (`server/src/web/middleware/auth.ts`)

**WebAppEnv Type** (lines 5-9):
- Changed `userId: number` to `userId: string`

**JWT Payload Schema** (lines 11-13):
- Changed `uid: z.number()` to `uid: z.string()`

#### Deprecation Documentation (`server/src/web/ownerId.ts`)

**@deprecated JSDoc** (lines 23-38):
- Added deprecation notice with migration guide
- Documented replacement functions: getOrCreateUser(), getUserByCliToken()
- Explained admin-user migration strategy
- Provided cross-references to new authentication system

## Outputs for Dependent Tasks

### Available Components

**Store Methods**:
```typescript
// Import from server/src/store/index.ts
import { Store, User } from '../../store'

// User CRUD operations
store.createUser({ id: string, telegram_id: string | null, username: string, created_at?: number }): User
store.getUserById(id: string): User | null
store.getUserByTelegramId(telegramId: string): User | null
store.getAllUsers(): User[]
```

**Authentication Helpers**:
```typescript
// Internal functions in server/src/web/routes/auth.ts
getOrCreateUser(store: Store, telegramId: string, username?: string): User
getUserByCliToken(store: Store): User
```

**User Type**:
```typescript
export type User = {
    id: string                    // Generated with nanoid
    telegram_id: string | null    // Nullable for CLI users
    username: string              // Required, defaults to 'User-{telegram_id}'
    created_at: number            // Unix timestamp
}
```

### Integration Points

**For IMPL-003 (Store User-Scoped Queries)**:
- All Store methods need userId parameter for filtering
- User foreign keys exist on sessions, machines, messages tables
- Use `WHERE user_id = ?` pattern in all queries
- Example: `store.getSessions(userId)` instead of `store.getSessions()`

**For IMPL-004 (Route Guards)**:
- Middleware now provides `c.get('userId')` as string type
- Validate session/machine ownership: `session.user_id === c.get('userId')`
- User objects available via `store.getUserById(userId)`

**For IMPL-007 (Per-User CLI Tokens)**:
- Current implementation uses single 'cli-user' for legacy migration
- Replace getUserByCliToken() logic to create separate users per token
- Pattern: Map token → userId → User object

**For Testing**:
- Test suite location: `server/src/store/__tests__/user-management.test.ts`
- 8 tests covering all CRUD operations and edge cases
- In-memory database pattern: `new Store(':memory:')`

### Usage Examples

**Create Telegram User**:
```typescript
// In auth route handler
const store = options.store
const user = getOrCreateUser(store, '123456789', 'john_doe')
// Returns: { id: 'nanoid-generated', telegram_id: '123456789', username: 'john_doe', created_at: timestamp }
```

**Create CLI User**:
```typescript
// In auth route handler
const store = options.store
const user = getUserByCliToken(store)
// Returns: { id: 'cli-user', telegram_id: null, username: 'CLI User', created_at: timestamp }
// Subsequent calls return cached result
```

**Query Users**:
```typescript
// Get user by ID
const user = store.getUserById('cli-user')

// Get user by Telegram ID
const telegramUser = store.getUserByTelegramId('123456789')

// List all users
const allUsers = store.getAllUsers()
```

**JWT Token Generation**:
```typescript
// New JWT payload uses string userId
const token = await new SignJWT({ uid: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(jwtSecret)
```

## Verification Results

All acceptance criteria verified successfully:

### Test Results (2025-12-27)

**Acceptance Criteria**:
```bash
# Test 1: 2 user creation functions implemented
$ grep -E 'getOrCreateUser|getUserByCliToken' server/src/web/routes/auth.ts
function getOrCreateUser(store: Store, telegramId: string, username?: string): User {
function getUserByCliToken(store: Store): User {
            user = getUserByCliToken(store)
            user = getOrCreateUser(store, String(telegramUserId), result.user.username)
✓ PASS - Both functions exist

# Test 2: 4 Store methods added
$ grep -E 'createUser|getUserById|getUserByTelegramId|getAllUsers' server/src/store/index.ts | wc -l
4
✓ PASS - All 4 methods present

# Test 3: ownerId.ts deprecated
$ grep '@deprecated' server/src/web/ownerId.ts
 * @deprecated This function is deprecated and will be removed in a future version.
✓ PASS - Deprecation notice added

# Test 4: User creation tested
$ bun test server/src/store/__tests__/user-management.test.ts
bun test v1.3.2 (b131639c)
 8 pass
 0 fail
✓ PASS - All tests passing
```

### Type Safety Verification

```bash
$ cd server && bun run typecheck
$ tsc --noEmit
(no output - success)
✓ PASS - TypeScript compilation successful
```

### Functionality Verification

**Test Suite Coverage**:
1. ✓ createUser creates new user with correct fields
2. ✓ getUserById retrieves user by id
3. ✓ getUserById returns null for non-existent user
4. ✓ getUserByTelegramId retrieves user by telegram_id
5. ✓ getUserByTelegramId returns null for non-existent telegram_id
6. ✓ getAllUsers returns all users
7. ✓ createUser supports CLI users with null telegram_id
8. ✓ createUser uses provided created_at or defaults to Date.now()

## Status: ✅ Complete

### Deliverables Checklist
- [x] 2 user creation functions implemented: getOrCreateUser(), getUserByCliToken()
- [x] 4 Store methods for user CRUD operations
- [x] Updated auth routes using new user management functions
- [x] Deprecated ownerId.ts with migration documentation
- [x] User type interface exported from Store
- [x] WebAppEnv updated to use string userId
- [x] JWT payload schema updated to use string uid
- [x] Store passed to auth routes via server.ts and index.ts
- [x] Users table added to Store.initSchema()
- [x] Comprehensive test suite with 8 passing tests
- [x] nanoid dependency added for user ID generation

### Quality Gates Met
- [x] 2 user creation functions implemented (verified via grep)
- [x] 4 Store methods added (verified via grep | wc -l = 4)
- [x] ownerId.ts deprecated (verified via grep '@deprecated')
- [x] User creation tested (verified via bun test exit code 0)
- [x] TypeScript compilation successful
- [x] All acceptance criteria met

### Architecture Changes
- **Authentication Flow**: Replaced single ownerId with per-user ID system
- **JWT Payload**: Changed from numeric ID to string-based user.id
- **CLI Users**: Synthetic 'cli-user' for legacy shared token migration
- **Type Safety**: Updated WebAppEnv and JWT schemas to use string IDs
- **Database Access**: Store now requires explicit injection into auth routes

### Next Task Ready
IMPL-003 can begin immediately with:
- User CRUD methods available in Store class
- User type exported and available for import
- Authentication flow returns proper user.id for JWT claims
- Middleware provides string userId in context
- Pattern established for user-scoped operations
