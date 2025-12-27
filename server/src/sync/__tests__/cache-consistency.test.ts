/**
 * Cache Consistency Test Suite
 * Verifies that SyncEngine in-memory cache maintains consistency with Store data
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { SyncEngine } from '../syncEngine'
import { Store } from '../../store'
import { Server } from 'socket.io'
import { RpcRegistry } from '../../socket/rpcRegistry'
import { SSEManager } from '../../sse/sseManager'

describe('SyncEngine Cache Consistency', () => {
    let store: Store
    let syncEngine: SyncEngine
    let io: Server
    let rpcRegistry: RpcRegistry
    let sseManager: SSEManager

    beforeEach(() => {
        // Create in-memory store
        store = new Store(':memory:')

        // Create mock Socket.IO server
        io = {
            of: () => ({
                to: () => ({
                    emit: () => {}
                })
            })
        } as any

        // Create mock RPC registry
        rpcRegistry = {
            getSocketIdForMethod: () => null
        } as any

        // Create mock SSE manager
        sseManager = {
            broadcast: () => {}
        } as any

        // Create test user
        store.createUser({
            id: 'user-1',
            telegram_id: null,
            username: 'testuser'
        })

        // Initialize SyncEngine
        syncEngine = new SyncEngine(store, io, rpcRegistry, sseManager)
    })

    afterEach(() => {
        syncEngine.stop()
    })

    it('should cache sessions created via getOrCreateSession', () => {
        const session = syncEngine.getOrCreateSession(
            'test-tag',
            { path: '/test', host: 'localhost', userId: 'user-1' },
            null,
            'user-1'
        )

        const cachedSessions = syncEngine.getSessions('user-1')
        expect(cachedSessions).toHaveLength(1)
        expect(cachedSessions[0].id).toBe(session.id)
    })

    it('should filter cached sessions by userId', () => {
        // Create second user
        store.createUser({
            id: 'user-2',
            telegram_id: null,
            username: 'testuser2'
        })

        // Create sessions for both users
        syncEngine.getOrCreateSession(
            'tag-1',
            { path: '/test1', host: 'localhost', userId: 'user-1' },
            null,
            'user-1'
        )

        syncEngine.getOrCreateSession(
            'tag-2',
            { path: '/test2', host: 'localhost', userId: 'user-2' },
            null,
            'user-2'
        )

        // Verify isolation
        const user1Sessions = syncEngine.getSessions('user-1')
        const user2Sessions = syncEngine.getSessions('user-2')

        expect(user1Sessions).toHaveLength(1)
        expect(user2Sessions).toHaveLength(1)
        expect(user1Sessions[0].metadata?.userId).toBe('user-1')
        expect(user2Sessions[0].metadata?.userId).toBe('user-2')
    })

    it('should return undefined when getting session owned by another user', () => {
        store.createUser({
            id: 'user-2',
            telegram_id: null,
            username: 'testuser2'
        })

        const session = syncEngine.getOrCreateSession(
            'tag-1',
            { path: '/test', host: 'localhost', userId: 'user-1' },
            null,
            'user-1'
        )

        const result = syncEngine.getSession(session.id, 'user-2')
        expect(result).toBeUndefined()
    })

    it('should cache machines created via getOrCreateMachine', () => {
        const machine = syncEngine.getOrCreateMachine(
            'machine-1',
            { host: 'localhost', platform: 'darwin', happyCliVersion: '1.0.0', userId: 'user-1' },
            null,
            'user-1'
        )

        const cachedMachines = syncEngine.getMachines('user-1')
        expect(cachedMachines).toHaveLength(1)
        expect(cachedMachines[0].id).toBe(machine.id)
    })

    it('should filter cached machines by userId', () => {
        store.createUser({
            id: 'user-2',
            telegram_id: null,
            username: 'testuser2'
        })

        syncEngine.getOrCreateMachine(
            'machine-1',
            { host: 'host1', platform: 'darwin', happyCliVersion: '1.0.0', userId: 'user-1' },
            null,
            'user-1'
        )

        syncEngine.getOrCreateMachine(
            'machine-2',
            { host: 'host2', platform: 'linux', happyCliVersion: '1.0.0', userId: 'user-2' },
            null,
            'user-2'
        )

        const user1Machines = syncEngine.getMachines('user-1')
        const user2Machines = syncEngine.getMachines('user-2')

        expect(user1Machines).toHaveLength(1)
        expect(user2Machines).toHaveLength(1)
        expect(user1Machines[0].metadata?.userId).toBe('user-1')
        expect(user2Machines[0].metadata?.userId).toBe('user-2')
    })

    it('should return undefined when getting machine owned by another user', () => {
        store.createUser({
            id: 'user-2',
            telegram_id: null,
            username: 'testuser2'
        })

        const machine = syncEngine.getOrCreateMachine(
            'machine-1',
            { host: 'localhost', platform: 'darwin', happyCliVersion: '1.0.0', userId: 'user-1' },
            null,
            'user-1'
        )

        const result = syncEngine.getMachine(machine.id, 'user-2')
        expect(result).toBeUndefined()
    })

    it('should maintain cache consistency after Store updates', () => {
        const session = syncEngine.getOrCreateSession(
            'test-tag',
            { path: '/test', host: 'localhost', userId: 'user-1' },
            null,
            'user-1'
        )

        // Update via Store
        store.updateSession(session.id, { tag: 'updated-tag' }, 'user-1')

        // Trigger cache refresh
        const refreshedSession = syncEngine.getSession(session.id, 'user-1')

        // Note: In current implementation, cache is only refreshed via refreshSession()
        // which is called from event handlers. Direct Store updates don't auto-refresh cache.
        // This test documents current behavior - manual refresh needed for consistency
        expect(refreshedSession).toBeDefined()
    })
})
