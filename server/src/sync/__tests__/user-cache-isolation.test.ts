/**
 * User Cache Isolation Test Suite
 * Verifies that SyncEngine enforces user isolation in cache operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { SyncEngine } from '../syncEngine'
import { Store } from '../../store'
import { Server } from 'socket.io'
import { RpcRegistry } from '../../socket/rpcRegistry'
import { SSEManager } from '../../sse/sseManager'

describe('SyncEngine User Cache Isolation', () => {
    let store: Store
    let syncEngine: SyncEngine
    let io: Server
    let rpcRegistry: RpcRegistry
    let sseManager: SSEManager

    beforeEach(() => {
        store = new Store(':memory:')

        io = {
            of: () => ({
                to: () => ({
                    emit: () => {}
                }),
                sockets: new Map()
            })
        } as any

        rpcRegistry = {
            getSocketIdForMethod: () => null
        } as any

        sseManager = {
            broadcast: () => {}
        } as any

        // Create two test users
        store.createUser({
            id: 'user-a',
            telegram_id: null,
            username: 'usera'
        })

        store.createUser({
            id: 'user-b',
            telegram_id: null,
            username: 'userb'
        })

        syncEngine = new SyncEngine(store, io, rpcRegistry, sseManager)
    })

    afterEach(() => {
        syncEngine.stop()
    })

    it('should isolate sessions between users', () => {
        const sessionA = syncEngine.getOrCreateSession(
            'tag-a',
            { path: '/a', host: 'localhost', userId: 'user-a' },
            null,
            'user-a'
        )

        const sessionB = syncEngine.getOrCreateSession(
            'tag-b',
            { path: '/b', host: 'localhost', userId: 'user-b' },
            null,
            'user-b'
        )

        // User A should only see their session
        const userASessions = syncEngine.getSessions('user-a')
        expect(userASessions).toHaveLength(1)
        expect(userASessions[0].id).toBe(sessionA.id)

        // User B should only see their session
        const userBSessions = syncEngine.getSessions('user-b')
        expect(userBSessions).toHaveLength(1)
        expect(userBSessions[0].id).toBe(sessionB.id)
    })

    it('should prevent cross-user session access', () => {
        const sessionA = syncEngine.getOrCreateSession(
            'tag-a',
            { path: '/a', host: 'localhost', userId: 'user-a' },
            null,
            'user-a'
        )

        // User B should not be able to access User A's session
        const result = syncEngine.getSession(sessionA.id, 'user-b')
        expect(result).toBeUndefined()

        // User A should still be able to access their session
        const resultA = syncEngine.getSession(sessionA.id, 'user-a')
        expect(resultA).toBeDefined()
        expect(resultA?.id).toBe(sessionA.id)
    })

    it('should isolate machines between users', () => {
        const machineA = syncEngine.getOrCreateMachine(
            'machine-a',
            { host: 'host-a', platform: 'darwin', happyCliVersion: '1.0.0', userId: 'user-a' },
            null,
            'user-a'
        )

        const machineB = syncEngine.getOrCreateMachine(
            'machine-b',
            { host: 'host-b', platform: 'linux', happyCliVersion: '1.0.0', userId: 'user-b' },
            null,
            'user-b'
        )

        const userAMachines = syncEngine.getMachines('user-a')
        expect(userAMachines).toHaveLength(1)
        expect(userAMachines[0].id).toBe(machineA.id)

        const userBMachines = syncEngine.getMachines('user-b')
        expect(userBMachines).toHaveLength(1)
        expect(userBMachines[0].id).toBe(machineB.id)
    })

    it('should prevent cross-user machine access', () => {
        const machineA = syncEngine.getOrCreateMachine(
            'machine-a',
            { host: 'localhost', platform: 'darwin', happyCliVersion: '1.0.0', userId: 'user-a' },
            null,
            'user-a'
        )

        const result = syncEngine.getMachine(machineA.id, 'user-b')
        expect(result).toBeUndefined()

        const resultA = syncEngine.getMachine(machineA.id, 'user-a')
        expect(resultA).toBeDefined()
        expect(resultA?.id).toBe(machineA.id)
    })

    it('should isolate messages between users via session ownership', async () => {
        const sessionA = syncEngine.getOrCreateSession(
            'tag-a',
            { path: '/a', host: 'localhost', userId: 'user-a' },
            null,
            'user-a'
        )

        const sessionB = syncEngine.getOrCreateSession(
            'tag-b',
            { path: '/b', host: 'localhost', userId: 'user-b' },
            null,
            'user-b'
        )

        await syncEngine.sendMessage(sessionA.id, 'user-a', {
            text: 'User A message',
            sentFrom: 'webapp'
        })

        await syncEngine.sendMessage(sessionB.id, 'user-b', {
            text: 'User B message',
            sentFrom: 'webapp'
        })

        // User A should only see their messages
        const messagesA = await syncEngine.fetchMessages(sessionA.id, 'user-a')
        expect(messagesA.ok).toBe(true)
        if (messagesA.ok) {
            expect(messagesA.messages).toHaveLength(1)
        }

        // User B should only see their messages
        const messagesB = await syncEngine.fetchMessages(sessionB.id, 'user-b')
        expect(messagesB.ok).toBe(true)
        if (messagesB.ok) {
            expect(messagesB.messages).toHaveLength(1)
        }

        // User A should not see User B's messages
        const crossAccess = await syncEngine.fetchMessages(sessionB.id, 'user-a')
        expect(crossAccess.ok).toBe(true)
        if (crossAccess.ok) {
            expect(crossAccess.messages).toHaveLength(0)
        }
    })

    it('should prevent adding messages to another user\'s session', async () => {
        const sessionA = syncEngine.getOrCreateSession(
            'tag-a',
            { path: '/a', host: 'localhost', userId: 'user-a' },
            null,
            'user-a'
        )

        // User B tries to add message to User A's session - should fail at Store level
        await expect(async () => {
            await syncEngine.sendMessage(sessionA.id, 'user-b', {
                text: 'Unauthorized message',
                sentFrom: 'webapp'
            })
        }).toThrow()
    })

    it('should handle empty results for non-existent user data', () => {
        const sessions = syncEngine.getSessions('non-existent-user')
        expect(sessions).toHaveLength(0)

        const machines = syncEngine.getMachines('non-existent-user')
        expect(machines).toHaveLength(0)
    })

    it('should maintain isolation when cache contains mixed user data', () => {
        // Create multiple sessions for both users
        syncEngine.getOrCreateSession('a1', { path: '/a1', host: 'localhost', userId: 'user-a' }, null, 'user-a')
        syncEngine.getOrCreateSession('a2', { path: '/a2', host: 'localhost', userId: 'user-a' }, null, 'user-a')
        syncEngine.getOrCreateSession('b1', { path: '/b1', host: 'localhost', userId: 'user-b' }, null, 'user-b')
        syncEngine.getOrCreateSession('b2', { path: '/b2', host: 'localhost', userId: 'user-b' }, null, 'user-b')

        const userASessions = syncEngine.getSessions('user-a')
        const userBSessions = syncEngine.getSessions('user-b')

        expect(userASessions).toHaveLength(2)
        expect(userBSessions).toHaveLength(2)

        // Verify all user A sessions belong to user A
        userASessions.forEach(session => {
            expect(session.metadata?.userId).toBe('user-a')
        })

        // Verify all user B sessions belong to user B
        userBSessions.forEach(session => {
            expect(session.metadata?.userId).toBe('user-b')
        })
    })
})
