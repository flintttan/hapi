import { describe, test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Store } from '../index'

describe('Store schema migration', () => {
    test('migrates pre-multi-user database (missing user_id)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-store-migrate-'))
        const dbPath = join(dir, 'hapi.db')

        const sessionId = randomUUID()
        const machineId = randomUUID()
        const messageId = randomUUID()
        const now = Date.now()

        const db = new Database(dbPath, { create: true })
        db.exec('PRAGMA foreign_keys = OFF')

        // Simulate an older schema (no user_id columns).
        db.exec(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT UNIQUE,
                username TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );

            CREATE TABLE machines (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                daemon_state TEXT,
                daemon_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );

            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL
            );
        `)

        db.prepare(
            `INSERT INTO users (id, telegram_id, username, created_at) VALUES (?, ?, ?, ?)`
        ).run('legacy-user', null, 'legacy', now)

        db.prepare(
            `INSERT INTO sessions (id, tag, machine_id, created_at, updated_at, metadata, metadata_version, agent_state, agent_state_version, active, active_at, seq)
             VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 1, 1, ?, 0)`
        ).run(sessionId, 'legacy-session', machineId, now, now, JSON.stringify({ path: '/tmp' }), now)

        db.prepare(
            `INSERT INTO machines (id, created_at, updated_at, metadata, metadata_version, daemon_state, daemon_state_version, active, active_at, seq)
             VALUES (?, ?, ?, ?, 1, NULL, 1, 1, ?, 0)`
        ).run(machineId, now, now, JSON.stringify({ hostname: 'legacy-machine' }), now)

        db.prepare(
            `INSERT INTO messages (id, session_id, content, created_at, seq)
             VALUES (?, ?, ?, ?, ?)`
        ).run(messageId, sessionId, JSON.stringify({ text: 'hello' }), now, 1)

        db.close()

        const store = new Store(dbPath)

        // Legacy rows should be accessible after migration via the default admin user.
        const sessions = store.getSessions('admin-user')
        expect(sessions).toHaveLength(1)
        expect(sessions[0].id).toBe(sessionId)

        const messages = store.getMessages(sessionId, 'admin-user')
        expect(messages).toHaveLength(1)
        expect(messages[0].id).toBe(messageId)

        rmSync(dir, { recursive: true, force: true })
    })
})

