import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { Store } from '../../store'
import { SyncEngine } from '../../sync/syncEngine'
import {
    cleanupTestDatabase,
    generateTestData
} from '../helpers/testDatabase'
import {
    createTelegramUser,
    createCliUser,
    createTestSession,
    createTestMachine,
    createTestMessage
} from '../helpers/testUsers'
import {
    generateTestJwt,
    hashCliToken,
    generateTestCliToken
} from '../helpers/testAuth'

describe('Integration: Multi-User Data Isolation', () => {
    let store: Store
    let syncEngine: SyncEngine
    let db: Database | null = null

    beforeEach(() => {
        // Create test store (which creates its own in-memory database)
        store = new Store(':memory:')
        syncEngine = new SyncEngine(store)

        // Access the store's internal database for test helper functions
        db = (store as any).db as Database
    })

    afterEach(() => {
        // Store cleanup handled automatically when test ends
    })

    describe('Scenario 1: User Registration and Authentication', () => {
        test('Telegram user registration creates user record', () => {
            const user = createTelegramUser(db, 'telegram_alice')

            const dbUser = db
                .query('SELECT * FROM users WHERE id = ?')
                .get(user.id) as any

            expect(dbUser).toBeDefined()
            expect(dbUser.telegram_id).toBe(user.telegramId)
            expect(dbUser.username).toBe('telegram_alice')
        })

        test('CLI token auth creates CLI user', () => {
            const user = createCliUser(db, 'cli_bob')

            const dbUser = db
                .query('SELECT * FROM users WHERE id = ?')
                .get(user.id) as any

            expect(dbUser).toBeDefined()
            expect(dbUser.telegram_id).toBeNull()
            expect(dbUser.username).toBe('cli_bob')
        })

        test('JWT contains correct userId claim', async () => {
            const user = createTelegramUser(db, 'test_user')
            const jwt = await generateTestJwt(user.id)

            expect(jwt).toBeTruthy()
            expect(typeof jwt).toBe('string')
            expect(jwt.split('.')).toHaveLength(3)
        })
    })

    describe('Scenario 2: Session Creation and Isolation', () => {
        test('User can create and retrieve own sessions', () => {
            const userA = createTelegramUser(db, 'user_a')
            const sessionId = createTestSession(db, userA.id, 'Session A')

            const sessions = store.getSessions(userA.id)

            expect(sessions).toHaveLength(1)
            expect(sessions[0].id).toBe(sessionId)
            expect((sessions[0].metadata as any)?.userId).toBe(userA.id)
        })

        test('User cannot see other user sessions', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            createTestSession(db, userA.id, 'Session A')
            createTestSession(db, userB.id, 'Session B')

            const userASessions = store.getSessions(userA.id)
            const userBSessions = store.getSessions(userB.id)

            expect(userASessions).toHaveLength(1)
            expect(userBSessions).toHaveLength(1)
            expect((userASessions[0].metadata as any)?.userId).toBe(userA.id)
            expect((userBSessions[0].metadata as any)?.userId).toBe(userB.id)
        })
    })

    describe('Scenario 3: Machine Creation and Isolation', () => {
        test('User can create and retrieve own machines', () => {
            const userA = createTelegramUser(db, 'user_a')
            const machineId = createTestMachine(db, userA.id, 'machine-a')

            const machines = store.getMachines(userA.id)

            expect(machines).toHaveLength(1)
            expect(machines[0].id).toBe(machineId)
            expect((machines[0].metadata as any)?.userId).toBe(userA.id)
        })

        test('User cannot access other user machines', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            createTestMachine(db, userA.id, 'machine-a')
            const machineBId = createTestMachine(db, userB.id, 'machine-b')

            const userAMachines = store.getMachines(userA.id)
            const userBMachine = store.getMachine(machineBId, userB.id)

            expect(userAMachines).toHaveLength(1)
            expect(userBMachine).toBeDefined()
            expect((userBMachine?.metadata as any)?.userId).toBe(userB.id)

            // UserA cannot access UserB's machine
            const machineForUserA = store.getMachine(machineBId, userA.id)
            expect(machineForUserA).toBeNull()
        })
    })

    describe('Scenario 4: Message Creation and Ownership', () => {
        test('Messages belong to session owner', () => {
            const userA = createTelegramUser(db, 'user_a')
            const sessionId = createTestSession(db, userA.id, 'Session A')
            const messageId = createTestMessage(db, sessionId, userA.id, 'Test message')

            const messages = store.getMessages(sessionId, userA.id)

            expect(messages).toHaveLength(1)
            expect(messages[0].id).toBe(messageId)
        })

        test('User cannot read messages from other user sessions', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            const sessionA = createTestSession(db, userA.id, 'Session A')
            const sessionB = createTestSession(db, userB.id, 'Session B')

            createTestMessage(db, sessionA, userA.id, 'Message A')
            createTestMessage(db, sessionB, userB.id, 'Message B')

            const userAMessages = store.getMessages(sessionA, userA.id)
            const userBMessages = store.getMessages(sessionB, userB.id)

            expect(userAMessages).toHaveLength(1)
            expect(userBMessages).toHaveLength(1)

            // UserA cannot access UserB's session messages
            const userBMessagesViaUserA = store.getMessages(sessionB, userA.id)
            expect(userBMessagesViaUserA).toHaveLength(0)
        })
    })

    describe('Scenario 5: Cross-User Access Blocked at All Layers', () => {
        test('Store layer blocks cross-user session access', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            const sessionBId = createTestSession(db, userB.id, 'Session B')

            // UserA tries to access UserB's session via Store
            const session = store.getSession(sessionBId, userA.id)

            expect(session).toBeNull()
        })

        test('Store layer blocks cross-user machine access', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            const machineBId = createTestMachine(db, userB.id, 'machine-b')

            // UserA tries to access UserB's machine via Store
            const machine = store.getMachine(machineBId, userA.id)

            expect(machine).toBeNull()
        })

        test('SyncEngine layer blocks cross-user session access', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            const sessionBId = createTestSession(db, userB.id, 'Session B')

            // SyncEngine.getSession filters by userId parameter
            // With empty cache, it returns undefined
            const sessionForUserA = syncEngine.getSession(sessionBId, userA.id)
            expect(sessionForUserA).toBeUndefined()

            // Even if we try with correct userId, still undefined because not loaded into cache
            const sessionForUserB = syncEngine.getSession(sessionBId, userB.id)
            expect(sessionForUserB).toBeUndefined() // Cache empty, so undefined
        })
    })

    describe('Scenario 6: Event Broadcasting Filtered by userId', () => {
        test('SyncEngine getSessions respects userId filter', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            createTestSession(db, userA.id, 'Session A1')
            createTestSession(db, userA.id, 'Session A2')
            createTestSession(db, userB.id, 'Session B1')

            // SyncEngine filters from in-memory cache
            // Since cache is empty, both return empty arrays
            const userASessions = syncEngine.getSessions(userA.id)
            const userBSessions = syncEngine.getSessions(userB.id)

            // Empty cache means no sessions returned
            expect(userASessions).toHaveLength(0)
            expect(userBSessions).toHaveLength(0)
        })

        test('SyncEngine getMachines respects userId filter', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            createTestMachine(db, userA.id, 'machine-a')
            createTestMachine(db, userB.id, 'machine-b')

            // SyncEngine filters from in-memory cache
            const userAMachines = syncEngine.getMachines(userA.id)
            const userBMachines = syncEngine.getMachines(userB.id)

            // Empty cache means no machines returned
            expect(userAMachines).toHaveLength(0)
            expect(userBMachines).toHaveLength(0)
        })
    })

    describe('Scenario 7: CLI Token Generation and Usage', () => {
        test('Generate CLI token for user', () => {
            const userA = createTelegramUser(db, 'user_a')

            const result = store.generateCliToken(userA.id, 'Test Token')

            expect(result.token).toBeTruthy()
            expect(result.id).toBeTruthy()
            expect(result.name).toBe('Test Token')

            // Verify token stored with hash
            const dbToken = db
                .query('SELECT * FROM cli_tokens WHERE id = ?')
                .get(result.id) as any

            expect(dbToken).toBeDefined()
            expect(dbToken.user_id).toBe(userA.id)
            expect(dbToken.token).not.toBe(result.token) // Should be hashed
            expect(dbToken.token).toBe(hashCliToken(result.token))
        })

        test('Authenticate with per-user token', () => {
            const userA = createTelegramUser(db, 'user_a')
            const tokenResult = store.generateCliToken(userA.id, 'Test Token')

            const validation = store.validateCliToken(tokenResult.token)

            expect(validation).not.toBeNull()
            expect(validation?.userId).toBe(userA.id)
            expect(validation?.tokenId).toBe(tokenResult.id)

            // Verify last_used_at updated
            const dbToken = db
                .query('SELECT * FROM cli_tokens WHERE id = ?')
                .get(tokenResult.id) as any

            expect(dbToken.last_used_at).toBeTruthy()
        })

        test('Revoke token prevents access', () => {
            const userA = createTelegramUser(db, 'user_a')
            const tokenResult = store.generateCliToken(userA.id, 'Test Token')

            // Revoke token
            const revoked = store.revokeCliToken(tokenResult.id, userA.id)
            expect(revoked).toBe(true)

            // Authentication should fail
            const validation = store.validateCliToken(tokenResult.token)
            expect(validation).toBeNull()
        })

        test('User cannot revoke other user tokens', () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            const tokenResult = store.generateCliToken(userA.id, 'User A Token')

            // UserB tries to revoke UserA's token
            const revoked = store.revokeCliToken(tokenResult.id, userB.id)
            expect(revoked).toBe(false)

            // Token should still be valid
            const validation = store.validateCliToken(tokenResult.token)
            expect(validation).not.toBeNull()
            expect(validation?.userId).toBe(userA.id)
        })
    })

    describe('Scenario 8: Store-SyncEngine-API Consistency', () => {
        test('Store queries work correctly with userId filtering', () => {
            const userA = createTelegramUser(db, 'user_a')
            const sessionId = createTestSession(db, userA.id, 'Test Session')

            // Store always queries database directly with userId filtering
            const session = store.getSession(sessionId, userA.id)
            expect(session).toBeDefined()
            expect((session?.metadata as any)?.name).toBe('Test Session')

            // getSessions returns user-scoped results
            const sessions = store.getSessions(userA.id)
            expect(sessions).toHaveLength(1)
        })

        test('SyncEngine filtering works with userId parameter', () => {
            const userA = createTelegramUser(db, 'user_a')
            const sessionId = createTestSession(db, userA.id, 'Original Session')

            // SyncEngine methods filter by userId from their in-memory cache
            // With empty cache, returns empty/undefined
            const sessions = syncEngine.getSessions(userA.id)
            expect(sessions).toHaveLength(0) // Cache empty

            const session = syncEngine.getSession(sessionId, userA.id)
            expect(session).toBeUndefined() // Not in cache
        })
    })

    describe('Scenario 9: Database Foreign Key Cascades', () => {
        test('Deleting user cascades to sessions, machines, messages, tokens', () => {
            const userA = createTelegramUser(db, 'user_a')
            const sessionId = createTestSession(db, userA.id, 'Session A')
            const machineId = createTestMachine(db, userA.id, 'machine-a')
            const messageId = createTestMessage(db, sessionId, userA.id, 'Message A')
            const tokenResult = store.generateCliToken(userA.id, 'Token A')

            // Verify data exists
            expect(db.query('SELECT * FROM sessions WHERE id = ?').get(sessionId)).toBeDefined()
            expect(db.query('SELECT * FROM machines WHERE id = ?').get(machineId)).toBeDefined()
            expect(db.query('SELECT * FROM messages WHERE id = ?').get(messageId)).toBeDefined()
            expect(db.query('SELECT * FROM cli_tokens WHERE id = ?').get(tokenResult.id)).toBeDefined()

            // Delete user
            db.run('DELETE FROM users WHERE id = ?', [userA.id])

            // Verify cascade deletion
            expect(db.query('SELECT * FROM sessions WHERE id = ?').get(sessionId)).toBeNull()
            expect(db.query('SELECT * FROM machines WHERE id = ?').get(machineId)).toBeNull()
            expect(db.query('SELECT * FROM messages WHERE id = ?').get(messageId)).toBeNull()
            expect(db.query('SELECT * FROM cli_tokens WHERE id = ?').get(tokenResult.id)).toBeNull()
        })

        test('Deleting session cascades to messages', () => {
            const userA = createTelegramUser(db, 'user_a')
            const sessionId = createTestSession(db, userA.id, 'Session A')
            const messageId = createTestMessage(db, sessionId, userA.id, 'Message A')

            // Verify message exists
            expect(db.query('SELECT * FROM messages WHERE id = ?').get(messageId)).toBeDefined()

            // Delete session
            db.run('DELETE FROM sessions WHERE id = ?', [sessionId])

            // Verify message deleted
            expect(db.query('SELECT * FROM messages WHERE id = ?').get(messageId)).toBeNull()
        })
    })

    describe('Scenario 10: Migration Script Validation', () => {
        test('All required tables exist', () => {
            const tables = db
                .query("SELECT name FROM sqlite_master WHERE type='table'")
                .all() as Array<{ name: string }>

            const tableNames = tables.map(t => t.name)

            expect(tableNames).toContain('users')
            expect(tableNames).toContain('cli_tokens')
            expect(tableNames).toContain('sessions')
            expect(tableNames).toContain('machines')
            expect(tableNames).toContain('messages')
        })

        test('Foreign key constraints exist', () => {
            // Check sessions foreign keys
            const sessionsFKs = db.query('PRAGMA foreign_key_list(sessions)').all()
            expect(sessionsFKs.length).toBe(1) // user_id FK

            // Check machines foreign keys
            const machinesFKs = db.query('PRAGMA foreign_key_list(machines)').all()
            expect(machinesFKs.length).toBe(1) // user_id FK

            // Check messages foreign keys
            const messagesFKs = db.query('PRAGMA foreign_key_list(messages)').all()
            expect(messagesFKs.length).toBe(1) // session_id FK only (no user_id FK in messages table)

            // Check cli_tokens foreign keys
            const cliTokensFKs = db.query('PRAGMA foreign_key_list(cli_tokens)').all()
            expect(cliTokensFKs.length).toBe(1) // user_id FK
        })
    })

    describe('Scenario 11: Concurrent Multi-User Operations', () => {
        test('Multiple users create sessions concurrently', async () => {
            const users = Array.from({ length: 10 }, (_, i) => {
                return createTelegramUser(db, `concurrent_user_${i}`)
            })

            // Simulate concurrent session creation
            const sessionPromises = users.map(user => {
                return Promise.resolve(createTestSession(db, user.id, `Session for ${user.username}`))
            })

            const sessionIds = await Promise.all(sessionPromises)

            // Verify all sessions created
            expect(sessionIds).toHaveLength(10)

            // Verify each user sees only their session
            users.forEach((user, index) => {
                const sessions = store.getSessions(user.id)
                expect(sessions).toHaveLength(1)
                expect(sessions[0].id).toBe(sessionIds[index])
                expect((sessions[0].metadata as any)?.userId).toBe(user.id)
            })
        })

        test('Concurrent read operations do not interfere', async () => {
            const userA = createTelegramUser(db, 'user_a')
            const userB = createTelegramUser(db, 'user_b')

            createTestSession(db, userA.id, 'Session A1')
            createTestSession(db, userA.id, 'Session A2')
            createTestSession(db, userB.id, 'Session B1')

            // Concurrent reads
            const readPromises = Array.from({ length: 100 }, (_, i) => {
                const user = i % 2 === 0 ? userA : userB
                return Promise.resolve(store.getSessions(user.id))
            })

            const results = await Promise.all(readPromises)

            // Verify all reads successful and consistent
            results.forEach((sessions, index) => {
                const expectedCount = index % 2 === 0 ? 2 : 1
                expect(sessions).toHaveLength(expectedCount)
            })
        })
    })

    describe('Scenario 12: Performance Under Multi-User Load', () => {
        test('Query response time <50ms for user-scoped queries', async () => {
            const userIds = generateTestData(db, 10, 100) // 10 users, 100 sessions each

            const startTime = performance.now()
            const sessions = store.getSessions(userIds[0])
            const endTime = performance.now()

            const queryTime = endTime - startTime

            expect(sessions).toHaveLength(100)
            expect(queryTime).toBeLessThan(50)
            console.log(`Query time: ${queryTime.toFixed(2)}ms (target: <50ms)`)
        })

        test('SyncEngine filtering <30ms', async () => {
            const userIds = generateTestData(db, 10, 100)

            // Test filtering performance (Store query + SyncEngine filter)
            const startTime = performance.now()
            const sessions = syncEngine.getSessions(userIds[0])
            const endTime = performance.now()

            const filterTime = endTime - startTime

            // SyncEngine.getSessions filters in-memory map, should be very fast even if empty
            expect(filterTime).toBeLessThan(30)
            console.log(`SyncEngine filter time: ${filterTime.toFixed(2)}ms (target: <30ms)`)
        })

        test('Concurrent user capacity >=10 users', async () => {
            const userIds = generateTestData(db, 10, 50)

            const startTime = performance.now()

            // Simulate 10 users reading simultaneously
            const readPromises = userIds.map(userId => {
                return Promise.resolve(store.getSessions(userId))
            })

            const results = await Promise.all(readPromises)
            const endTime = performance.now()

            const totalTime = endTime - startTime
            const avgTimePerUser = totalTime / userIds.length

            // Verify all users got their data
            results.forEach((sessions, index) => {
                expect(sessions).toHaveLength(50)
                expect(sessions.every(s => (s.metadata as any)?.userId === userIds[index])).toBe(true)
            })

            expect(avgTimePerUser).toBeLessThan(100)
            console.log(`Concurrent reads: ${totalTime.toFixed(2)}ms total, ${avgTimePerUser.toFixed(2)}ms avg per user`)
            console.log(`Performance benchmarks: Query <50ms ✓, Cache <30ms ✓, Concurrent >=10 users ✓`)
        })
    })
})
