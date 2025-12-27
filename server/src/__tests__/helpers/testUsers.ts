import { randomUUID } from 'crypto'
import type { Database } from 'bun:sqlite'

/**
 * Test user fixtures
 */
export type TestUser = {
    id: string
    telegramId: string | null
    username: string
    createdAt: number
}

/**
 * Create test user with Telegram authentication
 */
export function createTelegramUser(db: Database, username: string = 'telegram_user'): TestUser {
    const user: TestUser = {
        id: randomUUID(),
        telegramId: `telegram-${randomUUID()}`,
        username,
        createdAt: Date.now()
    }

    db.run(
        'INSERT INTO users (id, telegram_id, username, created_at) VALUES (?, ?, ?, ?)',
        [user.id, user.telegramId, user.username, user.createdAt]
    )

    return user
}

/**
 * Create CLI-only user (no Telegram ID)
 */
export function createCliUser(db: Database, username: string = 'cli_user'): TestUser {
    const user: TestUser = {
        id: randomUUID(),
        telegramId: null,
        username,
        createdAt: Date.now()
    }

    db.run(
        'INSERT INTO users (id, telegram_id, username, created_at) VALUES (?, ?, ?, ?)',
        [user.id, user.telegramId, user.username, user.createdAt]
    )

    return user
}

/**
 * Create multiple test users
 */
export function createTestUsers(db: Database, count: number): TestUser[] {
    const users: TestUser[] = []

    for (let i = 0; i < count; i++) {
        const user = i % 2 === 0
            ? createTelegramUser(db, `user_${i}`)
            : createCliUser(db, `user_${i}`)
        users.push(user)
    }

    return users
}

/**
 * Create test session for user
 */
export function createTestSession(
    db: Database,
    userId: string,
    sessionName: string = 'Test Session'
): string {
    const sessionId = randomUUID()
    const now = Date.now()
    const metadata = JSON.stringify({
        userId,
        path: `/test/path/${sessionId}`,
        name: sessionName
    })

    db.run(
        `INSERT INTO sessions (
            id, tag, machine_id, created_at, updated_at,
            metadata, metadata_version,
            agent_state, agent_state_version,
            todos, todos_updated_at,
            active, active_at, seq, user_id
        ) VALUES (?, NULL, NULL, ?, ?, ?, 1, NULL, 1, NULL, NULL, 1, ?, 0, ?)`,
        [sessionId, now, now, metadata, now, userId]
    )

    return sessionId
}

/**
 * Create test machine for user
 */
export function createTestMachine(
    db: Database,
    userId: string,
    hostname: string = 'test-machine'
): string {
    const machineId = randomUUID()
    const now = Date.now()
    const metadata = JSON.stringify({
        userId,
        hostname
    })

    db.run(
        `INSERT INTO machines (
            id, created_at, updated_at, metadata,
            metadata_version, daemon_state, daemon_state_version,
            active, active_at, seq, user_id
        ) VALUES (?, ?, ?, ?, 1, NULL, 1, 1, ?, 0, ?)`,
        [machineId, now, now, metadata, now, userId]
    )

    return machineId
}

/**
 * Create test message for session
 */
export function createTestMessage(
    db: Database,
    sessionId: string,
    userId: string,
    content: string = 'Test message'
): string {
    const messageId = randomUUID()
    const now = Date.now()
    const contentJson = JSON.stringify({ text: content })

    // Get next sequence number for this session
    const seqRow = db.query('SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM messages WHERE session_id = ?').get(sessionId) as { nextSeq: number } | null
    const seq = seqRow?.nextSeq || 1

    db.run(
        'INSERT INTO messages (id, session_id, content, created_at, seq, local_id) VALUES (?, ?, ?, ?, ?, NULL)',
        [messageId, sessionId, contentJson, now, seq]
    )

    return messageId
}
