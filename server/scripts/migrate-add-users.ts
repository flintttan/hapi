#!/usr/bin/env bun
/**
 * Database migration script to add multi-user support.
 *
 * This script performs the following operations:
 * 1. Creates an app_users table with support for CLI token and Telegram authentication
 * 2. Adds user_id columns to sessions, machines, and messages tables
 * 3. Establishes foreign key constraints with CASCADE delete
 * 4. Creates a default admin user and assigns existing data to it
 * 5. Implements schema version tracking via schema_migrations table
 *
 * Database Engine Support:
 * - SQLite (primary): Uses ALTER TABLE for schema modifications
 * - MySQL/PostgreSQL (future): Standard DDL with AUTO_INCREMENT/SERIAL
 *
 * Usage:
 *   bun run server/scripts/migrate-add-users.ts [options]
 *
 * Options:
 *   --dry-run      Show migration plan without executing
 *   --rollback     Revert migration (remove user_id columns and app_users table)
 *   --force        Skip confirmation prompts
 *   --help         Show this help message
 *
 * Examples:
 *   bun run server/scripts/migrate-add-users.ts
 *   bun run server/scripts/migrate-add-users.ts --dry-run
 *   bun run server/scripts/migrate-add-users.ts --rollback
 *   bun run server/scripts/migrate-add-users.ts --force
 */

import { Database } from 'bun:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const MIGRATION_VERSION = 2
const ADMIN_USER_ID = 'admin-user'
const ADMIN_USERNAME = 'admin'

interface MigrationOptions {
    dryRun: boolean
    rollback: boolean
    force: boolean
    help: boolean
}

interface SchemaVersion {
    version: number
    applied_at: number
}

function parseArgs(): MigrationOptions {
    const args = process.argv.slice(2)
    let dryRun = false
    let rollback = false
    let force = false
    let help = false

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            help = true
        } else if (arg === '--dry-run') {
            dryRun = true
        } else if (arg === '--rollback') {
            rollback = true
        } else if (arg === '--force' || arg === '-f') {
            force = true
        } else {
            console.error(`Unknown argument: ${arg}`)
            console.error('Use --help for usage information')
            process.exit(1)
        }
    }

    return { dryRun, rollback, force, help }
}

function getDbPath(): string {
    if (process.env.DB_PATH) {
        return process.env.DB_PATH.replace(/^~/, homedir())
    }
    const dataDir = process.env.HAPI_HOME
        ? process.env.HAPI_HOME.replace(/^~/, homedir())
        : join(homedir(), '.hapi')
    return join(dataDir, 'hapi.db')
}

async function confirm(message: string): Promise<boolean> {
    process.stdout.write(`${message} [y/N]: `)
    for await (const line of console) {
        const answer = line.trim().toLowerCase()
        return answer === 'y' || answer === 'yes'
    }
    return false
}

function getCurrentVersion(db: Database): number {
    try {
        const tables = db.query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ).all()

        if (tables.length === 0) {
            return 1 // Initial version before migration system
        }

        const version = db.query<SchemaVersion, []>(
            'SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1'
        ).get()

        return version?.version ?? 1
    } catch {
        return 1
    }
}

function createSchemaMigrationsTable(db: Database): void {
    db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )
    `)

    const hasV1 = db.query<{ count: number }, []>(
        'SELECT COUNT(*) as count FROM schema_migrations WHERE version = 1'
    ).get()

    if (hasV1?.count === 0) {
        db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [Date.now()])
    }
}

function checkUsersTableExists(db: Database): boolean {
    const tables = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='app_users'"
    ).all()
    return tables.length > 0
}

function checkColumnExists(db: Database, tableName: string, columnName: string): boolean {
    const columns = db.query<{ name: string }, []>(
        `PRAGMA table_info(${tableName})`
    ).all()
    return columns.some((col) => col.name === columnName)
}

function migrateUp(db: Database, dryRun: boolean): void {
    console.log('\n=== Migration Plan (Version 1 → 2) ===\n')

    const steps = [
        '1. Create app_users table (id, telegram_id, username, created_at)',
        '2. Create schema_migrations table for version tracking',
        '3. Create default admin user',
        '4. Recreate sessions table with user_id column and foreign key',
        '5. Recreate machines table with user_id column and foreign key',
        '6. Recreate messages table with user_id column and foreign key',
        '7. Update schema version to 2',
    ]

    steps.forEach((step) => console.log(step))
    console.log()

    if (dryRun) {
        console.log('[DRY RUN] Migration plan displayed above.')
        return
    }

    console.log('Executing migration...\n')

    try {
        db.run('BEGIN TRANSACTION')

        // Step 1: Create app_users table
        console.log('[1/7] Creating app_users table...')
        db.run(`
            CREATE TABLE IF NOT EXISTS app_users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT UNIQUE,
                username TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `)
        console.log('  ✓ app_users table created')

        // Step 2: Create schema_migrations table
        console.log('[2/7] Creating schema_migrations table...')
        createSchemaMigrationsTable(db)
        console.log('  ✓ schema_migrations table created')

        // Step 3: Create default admin user
        console.log('[3/7] Creating default admin user...')
        const adminExists = db.query<{ id: string }, [string]>(
            'SELECT id FROM app_users WHERE id = ?'
        ).get(ADMIN_USER_ID)

        if (!adminExists) {
            db.run(
                'INSERT INTO app_users (id, telegram_id, username, created_at) VALUES (?, NULL, ?, ?)',
                [ADMIN_USER_ID, ADMIN_USERNAME, Date.now()]
            )
            console.log(`  ✓ Admin user created (id: ${ADMIN_USER_ID}, username: ${ADMIN_USERNAME})`)
        } else {
            console.log('  ℹ Admin user already exists')
        }

        // Step 4: Recreate sessions table with user_id and foreign key
        console.log('[4/7] Recreating sessions table with user_id and foreign key...')
        db.run(`
            CREATE TABLE sessions_new (
                id TEXT PRIMARY KEY,
                tag TEXT,
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                todos TEXT,
                todos_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0,
                user_id TEXT NOT NULL DEFAULT '${ADMIN_USER_ID}',
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
        `)
        db.run(`
            INSERT INTO sessions_new
            SELECT id, tag, machine_id, created_at, updated_at, metadata, metadata_version,
                   agent_state, agent_state_version, todos, todos_updated_at, active, active_at, seq,
                   '${ADMIN_USER_ID}'
            FROM sessions
        `)
        db.run('DROP TABLE sessions')
        db.run('ALTER TABLE sessions_new RENAME TO sessions')
        db.run('CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag)')
        db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)')
        console.log('  ✓ sessions table recreated with foreign key')

        // Step 5: Recreate machines table with user_id and foreign key
        console.log('[5/7] Recreating machines table with user_id and foreign key...')
        db.run(`
            CREATE TABLE machines_new (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                daemon_state TEXT,
                daemon_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0,
                user_id TEXT NOT NULL DEFAULT '${ADMIN_USER_ID}',
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
        `)
        db.run(`
            INSERT INTO machines_new
            SELECT id, created_at, updated_at, metadata, metadata_version,
                   daemon_state, daemon_state_version, active, active_at, seq,
                   '${ADMIN_USER_ID}'
            FROM machines
        `)
        db.run('DROP TABLE machines')
        db.run('ALTER TABLE machines_new RENAME TO machines')
        db.run('CREATE INDEX IF NOT EXISTS idx_machines_user_id ON machines(user_id)')
        console.log('  ✓ machines table recreated with foreign key')

        // Step 6: Recreate messages table with user_id and foreign key
        console.log('[6/7] Recreating messages table with user_id and foreign key...')
        db.run(`
            CREATE TABLE messages_new (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                user_id TEXT NOT NULL DEFAULT '${ADMIN_USER_ID}',
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
        `)
        db.run(`
            INSERT INTO messages_new
            SELECT id, session_id, content, created_at, seq, local_id, '${ADMIN_USER_ID}'
            FROM messages
        `)
        db.run('DROP TABLE messages')
        db.run('ALTER TABLE messages_new RENAME TO messages')
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq)')
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL')
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)')
        console.log('  ✓ messages table recreated with foreign key')

        // Step 7: Update schema version
        console.log('[7/7] Updating schema version...')
        db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
            MIGRATION_VERSION,
            Date.now(),
        ])
        console.log(`  ✓ Schema version updated to ${MIGRATION_VERSION}`)

        db.run('COMMIT')
        console.log('\n✅ Migration completed successfully!\n')
    } catch (error) {
        db.run('ROLLBACK')
        console.error('\n❌ Migration failed, rolled back changes.')
        throw error
    }
}

function migrateDown(db: Database, dryRun: boolean): void {
    console.log('\n=== Rollback Plan (Version 2 → 1) ===\n')

    const steps = [
        '1. Remove user_id column from messages table',
        '2. Remove user_id column from machines table',
        '3. Remove user_id column from sessions table',
        '4. Drop app_users table',
        '5. Update schema version to 1',
    ]

    steps.forEach((step) => console.log(step))
    console.log()

    if (dryRun) {
        console.log('[DRY RUN] Rollback plan displayed above.')
        return
    }

    console.log('Executing rollback...\n')

    try {
        db.run('BEGIN TRANSACTION')

        // SQLite does not support DROP COLUMN directly, need to recreate tables
        console.log('[1/5] Recreating messages table without user_id...')
        db.run(`
            CREATE TABLE messages_new (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        `)
        db.run('INSERT INTO messages_new SELECT id, session_id, content, created_at, seq, local_id FROM messages')
        db.run('DROP TABLE messages')
        db.run('ALTER TABLE messages_new RENAME TO messages')
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq)')
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL')
        console.log('  ✓ messages table recreated')

        console.log('[2/5] Recreating machines table without user_id...')
        db.run(`
            CREATE TABLE machines_new (
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
            )
        `)
        db.run(`
            INSERT INTO machines_new
            SELECT id, created_at, updated_at, metadata, metadata_version,
                   daemon_state, daemon_state_version, active, active_at, seq
            FROM machines
        `)
        db.run('DROP TABLE machines')
        db.run('ALTER TABLE machines_new RENAME TO machines')
        console.log('  ✓ machines table recreated')

        console.log('[3/5] Recreating sessions table without user_id...')
        db.run(`
            CREATE TABLE sessions_new (
                id TEXT PRIMARY KEY,
                tag TEXT,
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                todos TEXT,
                todos_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            )
        `)
        db.run(`
            INSERT INTO sessions_new
            SELECT id, tag, machine_id, created_at, updated_at, metadata, metadata_version,
                   agent_state, agent_state_version, todos, todos_updated_at, active, active_at, seq
            FROM sessions
        `)
        db.run('DROP TABLE sessions')
        db.run('ALTER TABLE sessions_new RENAME TO sessions')
        db.run('CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag)')
        console.log('  ✓ sessions table recreated')

        console.log('[4/5] Dropping app_users table...')
        db.run('DROP TABLE IF EXISTS app_users')
        console.log('  ✓ app_users table dropped')

        console.log('[5/5] Updating schema version...')
        db.run('DELETE FROM schema_migrations WHERE version = ?', [MIGRATION_VERSION])
        console.log(`  ✓ Schema version reverted to 1`)

        db.run('COMMIT')
        console.log('\n✅ Rollback completed successfully!\n')
    } catch (error) {
        db.run('ROLLBACK')
        console.error('\n❌ Rollback failed, rolled back changes.')
        throw error
    }
}

async function main(): Promise<void> {
    const options = parseArgs()

    if (options.help) {
        console.log(`
Usage: bun run server/scripts/migrate-add-users.ts [options]

Options:
  --dry-run      Show migration plan without executing
  --rollback     Revert migration (remove user_id columns and app_users table)
  --force        Skip confirmation prompts
  --help         Show this help message

Description:
  This script adds multi-user support to the HAPI database by:
  - Creating an app_users table for authentication
  - Adding user_id foreign key columns to sessions, machines, and messages
  - Creating a default admin user and assigning existing data to it
  - Tracking schema version via schema_migrations table

Examples:
  bun run server/scripts/migrate-add-users.ts
  bun run server/scripts/migrate-add-users.ts --dry-run
  bun run server/scripts/migrate-add-users.ts --rollback
  bun run server/scripts/migrate-add-users.ts --force
`)
        process.exit(0)
    }

    const dbPath = getDbPath()
    if (!existsSync(dbPath)) {
        console.error(`Database not found: ${dbPath}`)
        console.error('Please start the server at least once to create the database.')
        process.exit(1)
    }

    console.log(`Database: ${dbPath}`)

    const db = new Database(dbPath)
    db.run('PRAGMA foreign_keys = ON')

    try {
        const currentVersion = getCurrentVersion(db)
        console.log(`Current schema version: ${currentVersion}`)

        if (options.rollback) {
            if (currentVersion < MIGRATION_VERSION) {
                console.log('Migration has not been applied yet. Nothing to rollback.')
                process.exit(0)
            }

            if (!options.force && !options.dryRun) {
                const confirmed = await confirm('⚠️  WARNING: Rollback will DELETE the app_users table and all user associations. Continue?')
                if (!confirmed) {
                    console.log('Rollback aborted.')
                    process.exit(0)
                }
            }

            migrateDown(db, options.dryRun)
        } else {
            if (currentVersion >= MIGRATION_VERSION) {
                console.log('Migration has already been applied.')
                process.exit(0)
            }

            if (!options.force && !options.dryRun) {
                const confirmed = await confirm('Apply migration to add multi-user support?')
                if (!confirmed) {
                    console.log('Migration aborted.')
                    process.exit(0)
                }
            }

            migrateUp(db, options.dryRun)
        }
    } finally {
        db.close()
    }
}

main().catch((err) => {
    console.error('Error:', err.message)
    process.exit(1)
})
