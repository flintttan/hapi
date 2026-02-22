import { Database } from 'bun:sqlite'
import { randomUUID } from 'crypto'

/**
 * Test Database Factory
 * Note: Store class creates its own schema, so we don't need schema initialization here
 */

/**
 * Clean all test data from database
 * Preserves schema, removes all data
 */
export function cleanupTestDatabase(db: Database): void {
    db.exec('DELETE FROM messages')
    db.exec('DELETE FROM sessions')
    db.exec('DELETE FROM machines')
    db.exec('DELETE FROM cli_tokens')
    db.exec('DELETE FROM users')
    db.exec("DELETE FROM app_users WHERE id NOT IN ('admin-user', 'cli-user')")
}

/**
 * Generate realistic test data for multi-user scenarios
 * @param userCount Number of users to create
 * @param sessionsPerUser Number of sessions per user
 * @returns Array of user IDs
 */
export function generateTestData(
    db: Database,
    userCount: number,
    sessionsPerUser: number
): string[] {
    const userIds: string[] = []

    for (let i = 0; i < userCount; i++) {
        const userId = randomUUID()
        const telegramId = `telegram-${i}`
        const username = `testuser${i}`

        db.run(
            'INSERT INTO app_users (id, telegram_id, username, created_at) VALUES (?, ?, ?, ?)',
            [userId, telegramId, username, Date.now()]
        )

        userIds.push(userId)

        // Create sessions for this user
        for (let j = 0; j < sessionsPerUser; j++) {
            const sessionId = randomUUID()
            const now = Date.now()
            const metadata = JSON.stringify({
                userId,
                path: `/test/path/${i}/${j}`,
                name: `Session ${j} for User ${i}`
            })

            db.run(
                `INSERT INTO sessions (
                    id, tag, namespace, machine_id, created_at, updated_at,
                    metadata, metadata_version,
                    agent_state, agent_state_version,
                    todos, todos_updated_at,
                    active, active_at, seq
                ) VALUES (?, NULL, ?, NULL, ?, ?, ?, 1, NULL, 1, NULL, NULL, 1, ?, 0)`,
                [sessionId, userId, now, now, metadata, now]
            )
        }

        // Create machines for this user
        const machineId = randomUUID()
        const now2 = Date.now()
        const machineMetadata = JSON.stringify({
            userId,
            hostname: `machine-${i}`
        })

        db.run(
            `INSERT INTO machines (
                id, namespace, created_at, updated_at, metadata,
                metadata_version, daemon_state, daemon_state_version,
                active, active_at, seq
            ) VALUES (?, ?, ?, ?, ?, 1, NULL, 1, 1, ?, 0)`,
            [machineId, userId, now2, now2, machineMetadata, now2]
        )
    }

    return userIds
}
