# Task: IMPL-006 User-scoped event broadcasting for Socket.IO and SSE

## Implementation Summary

### Files Modified
- `server/src/sync/syncEngine.ts`: Added userId to SyncEvent interface and all event emissions
- `server/src/socket/handlers/cli.ts`: Implemented Socket.IO user room join/leave
- `server/src/sse/sseManager.ts`: Added userId filtering for SSE connections
- `server/src/web/routes/events.ts`: Extract and pass userId to SSE subscriptions

### Content Added

#### 1. SyncEvent Interface Enhancement (`server/src/sync/syncEngine.ts:137-144`)
```typescript
export interface SyncEvent {
    type: SyncEventType
    sessionId?: string
    machineId?: string
    userId?: string  // NEW: User ID for event filtering
    data?: unknown
    message?: DecryptedMessage
}
```

#### 2. Event Emission Updates (12 instances in `syncEngine.ts`)
All `this.emit()` calls now include userId:
- **handleSessionAlive** (line 335-340): `userId: session.metadata?.userId`
- **handleSessionEnd** (line 358-363): `userId: session.metadata?.userId`
- **handleMachineAlive** (line 382-387): `userId: machine.metadata?.userId`
- **expireInactive** (lines 401-406, 413-418): Session and machine timeout events
- **refreshSession** (lines 428-432, 490-495): Session add/update/remove events
- **refreshMachine** (lines 505-510, 546-551): Machine update events
- **sendMessage** (lines 636-647): Message received events
- **setPermissionMode** (lines 695-700): Permission mode change events
- **setModelMode** (lines 708-713): Model mode change events

#### 3. Socket.IO User Rooms (`server/src/socket/handlers/cli.ts:115-120, 138-143`)
```typescript
// Join user room on connection
const userId = typeof auth?.userId === 'string' ? auth.userId : null
if (userId) {
    socket.join(`user:${userId}`)
    console.log(`[Socket.IO] User ${userId} joined room user:${userId}`)
}

// Leave user room on disconnect
socket.on('disconnect', () => {
    if (userId) {
        socket.leave(`user:${userId}`)
        console.log(`[Socket.IO] User ${userId} left room user:${userId}`)
    }
    // ... existing disconnect logic
})
```

#### 4. SSE Listener Filtering (`server/src/sse/sseManager.ts`)
```typescript
// Enhanced SSESubscription interface (lines 3-9)
export type SSESubscription = {
    id: string
    all: boolean
    sessionId: string | null
    machineId: string | null
    userId: string | null  // NEW
}

// User-level filtering in shouldSend (lines 102-106)
private shouldSend(connection: SSEConnection, event: SyncEvent): boolean {
    // User-level isolation: Only send events matching the connection's userId
    if (connection.userId && event.userId && connection.userId !== event.userId) {
        return false
    }
    // ... rest of filtering logic
}
```

#### 5. SSE Route userId Extraction (`server/src/web/routes/events.ts:36-45`)
```typescript
// Extract userId from authenticated context
const userId = c.get('userId') ?? null

manager.subscribe({
    id: subscriptionId,
    all,
    sessionId,
    machineId,
    userId,  // Pass userId to subscription
    send: (event) => stream.writeSSE({ data: JSON.stringify(event) }),
    sendHeartbeat: async () => { await stream.write(': heartbeat\n\n') }
})
```

## Outputs for Dependent Tasks

### Event Broadcasting Components

#### Socket.IO User Rooms
- **Room naming convention**: `user:{userId}`
- **Lifecycle**: Join on connection, leave on disconnect
- **Usage**: Target events to specific users via `io.to('user:{userId}').emit()`

#### SSE Filtering
- **Subscription interface**: `SSESubscription` includes `userId` field
- **Filtering logic**: `shouldSend()` checks `connection.userId === event.userId`
- **Route integration**: Authenticated userId automatically extracted from `c.get('userId')`

#### SyncEvent Interface
```typescript
import { SyncEvent } from '../sync/syncEngine'

// All events now include optional userId
const event: SyncEvent = {
    type: 'session-updated',
    sessionId: 'abc123',
    userId: 'user-uuid',  // Required for user-scoped filtering
    data: { /* ... */ }
}
```

### Integration Points

**For Socket.IO broadcasting** (use in future tasks):
```typescript
// Emit to specific user room
io.to(`user:${userId}`).emit('event-name', payload)
```

**For SSE subscriptions** (already integrated in events route):
```typescript
// userId automatically passed from authenticated context
const userId = c.get('userId')
manager.subscribe({ id, all, sessionId, machineId, userId, send, sendHeartbeat })
```

**For event emissions** (pattern to follow):
```typescript
// Always include userId from session/machine metadata
this.emit({
    type: 'session-updated',
    sessionId: session.id,
    userId: session.metadata?.userId as string | undefined,
    data: session
})
```

## Known Issues

TypeScript compilation errors exist in the codebase from previous IMPL-005 modifications:
1. `getSessions()` and `getActiveSessions()` signature mismatches (require userId parameter)
2. Store methods signature changes (added userId parameter in IMPL-005)
3. These are pre-existing issues not introduced by this task

## Verification Status

✅ **Completed**:
- userId added to SyncEvent interface
- 12 event emissions updated with userId
- Socket.IO user rooms implemented (join/leave)
- SSE filtering implemented
- SSE route extracts userId from auth context

⚠️ **Pending** (due to pre-existing TypeScript errors):
- Full typecheck compilation
- Event isolation test suite creation

## Status: ⚠️ Implementation Complete (TypeScript errors from IMPL-005 need fixing)

**Next Steps**:
1. Fix IMPL-005 TypeScript errors (getSessions/getActiveSessions signatures)
2. Run full typecheck to verify no new errors from IMPL-006
3. Create event isolation test suite (IMPL-006 Step 6)
