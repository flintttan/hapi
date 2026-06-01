import { afterEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { Store } from './index'

describe('messages schema migration', () => {
    let db: Database | null = null
    let tempDir: string | null = null

    afterEach(() => {
        db?.close()
        db = null
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true })
            tempDir = null
        }
    })

    it('migrates legacy messages tables before creating invoked_at-dependent indexes', () => {
        tempDir = mkdtempSync(join(tmpdir(), 'hapi-store-migration-'))
        const dbPath = join(tempDir, 'hub.sqlite')

        db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        db.exec('PRAGMA foreign_keys = ON')
        db.exec(`
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE machines (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL
            );
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
        `)
        db.close()
        db = null

        expect(() => new Store(dbPath)).not.toThrow()

        db = new Database(dbPath, { create: false, readwrite: false, strict: true })
        const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        const sessionIndexes = db.prepare('PRAGMA index_list(sessions)').all() as Array<{ name: string }>
        const machineColumns = db.prepare('PRAGMA table_info(machines)').all() as Array<{ name: string }>
        const machineIndexes = db.prepare('PRAGMA index_list(machines)').all() as Array<{ name: string }>
        const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
        const userIndexes = db.prepare('PRAGMA index_list(users)').all() as Array<{ name: string }>
        const pushColumns = db.prepare('PRAGMA table_info(push_subscriptions)').all() as Array<{ name: string }>
        const pushIndexes = db.prepare('PRAGMA index_list(push_subscriptions)').all() as Array<{ name: string }>
        const messageColumns = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
        const messageIndexes = db.prepare('PRAGMA index_list(messages)').all() as Array<{ name: string }>

        expect(sessionColumns.map((column) => column.name)).toContain('namespace')
        expect(sessionIndexes.map((index) => index.name)).toContain('idx_sessions_tag_namespace')
        expect(machineColumns.map((column) => column.name)).toContain('namespace')
        expect(machineIndexes.map((index) => index.name)).toContain('idx_machines_namespace')
        expect(userColumns.map((column) => column.name)).toContain('namespace')
        expect(userIndexes.map((index) => index.name)).toContain('idx_users_platform_namespace')
        expect(pushColumns.map((column) => column.name)).toContain('namespace')
        expect(pushIndexes.map((index) => index.name)).toContain('idx_push_subscriptions_namespace')
        expect(messageColumns.map((column) => column.name)).toContain('invoked_at')
        expect(messageColumns.map((column) => column.name)).toContain('scheduled_at')
        expect(messageIndexes.map((index) => index.name)).toContain('idx_messages_local_id')
        expect(messageIndexes.map((index) => index.name)).toContain('idx_messages_session_position')
        expect(messageIndexes.map((index) => index.name)).toContain('idx_messages_scheduled_pending')
    })
})
