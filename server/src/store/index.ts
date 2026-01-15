import { Database } from 'bun:sqlite'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { PushStore } from './pushStore'
import { SessionStore } from './sessionStore'
import { UserStore } from './userStore'

export type {
    StoredMachine,
    StoredMessage,
    StoredPushSubscription,
    StoredSession,
    StoredUser,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { PushStore } from './pushStore'
export { SessionStore } from './sessionStore'
export { UserStore } from './userStore'

export type AppUser = {
    id: string
    telegram_id: string | null
    username: string
    email: string | null
    password_hash: string | null
    created_at: number
}

type DbCliTokenLookup = {
    id: string
    user_id: string
}

const SCHEMA_VERSION = 3
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'users',
    'push_subscriptions',
    'app_users',
    'cli_tokens'
] as const

function validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Invalid userId: userId must be a non-empty string')
    }
}

export class Store {
    private db: Database
    private readonly dbPath: string

    readonly sessions: SessionStore
    readonly machines: MachineStore
    readonly messages: MessageStore
    readonly users: UserStore
    readonly push: PushStore

    constructor(dbPath: string) {
        this.dbPath = dbPath
        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            const dir = dirname(dbPath)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            try {
                chmodSync(dir, 0o700)
            } catch {
            }

            if (!existsSync(dbPath)) {
                try {
                    const fd = openSync(dbPath, 'a', 0o600)
                    closeSync(fd)
                } catch {
                }
            }
        }

        this.db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        this.db.exec('PRAGMA journal_mode = WAL')
        this.db.exec('PRAGMA synchronous = NORMAL')
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 5000')
        this.initSchema()

        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
                try {
                    chmodSync(path, 0o600)
                } catch {
                }
            }
        }

        this.sessions = new SessionStore(this.db)
        this.machines = new MachineStore(this.db)
        this.messages = new MessageStore(this.db)
        this.users = new UserStore(this.db)
        this.push = new PushStore(this.db)
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0 && !this.hasAnyUserTables()) {
            this.createSchema()
            this.ensureSystemUsers()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion > SCHEMA_VERSION) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        if (currentVersion < SCHEMA_VERSION) {
            this.migrateSchema(currentVersion)
            this.setUserVersion(SCHEMA_VERSION)
        }

        this.assertRequiredTablesPresent()
    }

    private migrateSchema(_currentVersion: number): void {
        this.normalizeUserTables()
        this.createSchema()
        this.ensureSessionsSchema()
        this.ensureMachinesSchema()
        this.ensureMessagesSchema()
        this.ensureAppUsersSchema()
        this.ensureSystemUsers()
    }

    private normalizeUserTables(): void {
        if (this.hasTable('users')) {
            const columns = this.getColumnNames('users')
            const looksLikePlatformUsers = columns.has('platform') && columns.has('platform_user_id') && !columns.has('username')
            const looksLikeAppUsers = columns.has('username')

            if (looksLikeAppUsers && !this.hasTable('app_users')) {
                this.db.exec('ALTER TABLE users RENAME TO app_users')
            } else if (!looksLikePlatformUsers && !looksLikeAppUsers && !this.hasTable('app_users')) {
                this.db.exec('ALTER TABLE users RENAME TO app_users')
            }
        }

        if (!this.hasTable('users') && this.hasTable('platform_users')) {
            this.db.exec('ALTER TABLE platform_users RENAME TO users')
        }
    }

    private createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                namespace TEXT NOT NULL DEFAULT 'default',
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
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
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
            CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace);

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                UNIQUE(platform, platform_user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
            CREATE INDEX IF NOT EXISTS idx_users_platform_namespace ON users(platform, namespace);

            CREATE TABLE IF NOT EXISTS app_users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT,
                username TEXT NOT NULL,
                email TEXT,
                password_hash TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
            CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
            CREATE INDEX IF NOT EXISTS idx_app_users_telegram_id ON app_users(telegram_id);

            CREATE TABLE IF NOT EXISTS cli_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT NOT NULL,
                name TEXT,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_cli_tokens_user_id ON cli_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_cli_tokens_token ON cli_tokens(token);

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, endpoint)
            );
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_namespace ON push_subscriptions(namespace);
        `)
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private hasTable(table: string): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
        ).get(table) as { name?: string } | undefined
        return row?.name === table
    }

    private getColumnNames(table: string): Set<string> {
        const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private ensureSystemUsers(): void {
        if (!this.hasTable('app_users')) {
            return
        }

        const now = Date.now()
        const insertSystemUser = this.db.prepare(`
            INSERT OR IGNORE INTO app_users (id, telegram_id, username, email, password_hash, created_at)
            VALUES (@id, NULL, @username, NULL, NULL, @created_at)
        `)

        insertSystemUser.run({ id: 'admin-user', username: 'Admin', created_at: now })
        insertSystemUser.run({ id: 'cli-user', username: 'CLI User', created_at: now })
    }

    private ensureAppUsersSchema(): void {
        if (!this.hasTable('app_users')) {
            return
        }

        const columns = this.getColumnNames('app_users')
        if (!columns.has('password_hash')) {
            this.db.exec('ALTER TABLE app_users ADD COLUMN password_hash TEXT')
        }
        if (!columns.has('email')) {
            this.db.exec('ALTER TABLE app_users ADD COLUMN email TEXT')
        }
        if (!columns.has('telegram_id')) {
            this.db.exec('ALTER TABLE app_users ADD COLUMN telegram_id TEXT')
        }
    }

    private ensureSessionsSchema(): void {
        if (!this.hasTable('sessions')) {
            return
        }

        const columns = this.getColumnNames('sessions')
        if (!columns.has('namespace')) {
            this.db.exec(`ALTER TABLE sessions ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default'`)
        }
        if (!columns.has('todos')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN todos TEXT')
        }
        if (!columns.has('todos_updated_at')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN todos_updated_at INTEGER')
        }
        if (!columns.has('metadata_version')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 1')
        }
        if (!columns.has('agent_state_version')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN agent_state_version INTEGER NOT NULL DEFAULT 1')
        }
        if (!columns.has('active')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN active INTEGER NOT NULL DEFAULT 0')
        }
        if (!columns.has('active_at')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN active_at INTEGER')
        }
        if (!columns.has('seq')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN seq INTEGER NOT NULL DEFAULT 0')
        }

        // If legacy tables have user_id, map it into namespace for isolation.
        if (columns.has('user_id')) {
            try {
                this.db.exec("UPDATE sessions SET namespace = user_id WHERE namespace = 'default' AND user_id IS NOT NULL")
            } catch {
            }
        }
    }

    private ensureMachinesSchema(): void {
        if (!this.hasTable('machines')) {
            return
        }

        const columns = this.getColumnNames('machines')
        if (!columns.has('namespace')) {
            this.db.exec(`ALTER TABLE machines ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default'`)
        }
        if (!columns.has('metadata_version')) {
            this.db.exec('ALTER TABLE machines ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 1')
        }
        if (!columns.has('daemon_state')) {
            this.db.exec('ALTER TABLE machines ADD COLUMN daemon_state TEXT')
        }
        if (!columns.has('daemon_state_version')) {
            this.db.exec('ALTER TABLE machines ADD COLUMN daemon_state_version INTEGER NOT NULL DEFAULT 1')
        }
        if (!columns.has('active')) {
            this.db.exec('ALTER TABLE machines ADD COLUMN active INTEGER NOT NULL DEFAULT 0')
        }
        if (!columns.has('active_at')) {
            this.db.exec('ALTER TABLE machines ADD COLUMN active_at INTEGER')
        }
        if (!columns.has('seq')) {
            this.db.exec('ALTER TABLE machines ADD COLUMN seq INTEGER NOT NULL DEFAULT 0')
        }

        if (columns.has('user_id')) {
            try {
                this.db.exec("UPDATE machines SET namespace = user_id WHERE namespace = 'default' AND user_id IS NOT NULL")
            } catch {
            }

            const duplicate = this.db.prepare(
                'SELECT id, COUNT(*) AS c FROM machines GROUP BY id HAVING c > 1 LIMIT 1'
            ).get() as { id: string; c: number } | undefined
            if (duplicate) {
                throw new Error(
                    `Cannot migrate machines table: machine id ${duplicate.id} exists in multiple namespaces. ` +
                    'Clear machineId (or use separate HAPI_HOME) for each namespace and retry.'
                )
            }

            this.db.exec(`
                DROP TABLE IF EXISTS machines_new;
                CREATE TABLE machines_new (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
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

                INSERT INTO machines_new (
                    id, namespace, created_at, updated_at,
                    metadata, metadata_version,
                    daemon_state, daemon_state_version,
                    active, active_at, seq
                )
                SELECT
                    id,
                    COALESCE(namespace, 'default'),
                    created_at,
                    updated_at,
                    metadata,
                    COALESCE(metadata_version, 1),
                    daemon_state,
                    COALESCE(daemon_state_version, 1),
                    COALESCE(active, 0),
                    active_at,
                    COALESCE(seq, 0)
                FROM machines;

                DROP TABLE machines;
                ALTER TABLE machines_new RENAME TO machines;
            `)
        }
    }

    private ensureMessagesSchema(): void {
        if (!this.hasTable('messages')) {
            return
        }

        const columns = this.getColumnNames('messages')
        if (!columns.has('local_id')) {
            this.db.exec('ALTER TABLE messages ADD COLUMN local_id TEXT')
        }
    }

    private assertRequiredTablesPresent(): void {
        const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...REQUIRED_TABLES) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

        if (missing.length > 0) {
            throw new Error(
                `SQLite schema is missing required tables (${missing.join(', ')}). ` +
                'Back up and rebuild the database, or run an offline migration to the expected schema version.'
            )
        }
    }

    private buildSchemaMismatchError(currentVersion: number): Error {
        const location = (this.dbPath === ':memory:' || this.dbPath.startsWith('file::memory:'))
            ? 'in-memory database'
            : this.dbPath
        return new Error(
            `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            'This build only supports migrating legacy schemas up to the expected version. ' +
            'Back up and rebuild the database, or run an offline migration to the expected schema version.'
        )
    }

    getDefaultCliUserId(): string {
        if (!this.hasTable('app_users')) {
            return 'cli-user'
        }

        const row = this.db.prepare(`
            SELECT id
            FROM app_users
            WHERE id NOT IN ('admin-user', 'cli-user')
            AND (
                password_hash IS NOT NULL
                OR telegram_id IS NOT NULL
            )
            ORDER BY created_at ASC
            LIMIT 1
        `).get() as { id: string } | undefined

        return row?.id ?? 'cli-user'
    }

    createUser(user: {
        id: string
        telegram_id: string | null
        username: string
        email?: string | null
        password_hash?: string | null
        created_at?: number
    }): AppUser {
        const now = user.created_at ?? Date.now()

        this.db.prepare(`
            INSERT INTO app_users (id, telegram_id, username, email, password_hash, created_at)
            VALUES (@id, @telegram_id, @username, @email, @password_hash, @created_at)
        `).run({
            id: user.id,
            telegram_id: user.telegram_id,
            username: user.username,
            email: user.email ?? null,
            password_hash: user.password_hash ?? null,
            created_at: now
        })

        return {
            id: user.id,
            telegram_id: user.telegram_id,
            username: user.username,
            email: user.email ?? null,
            password_hash: user.password_hash ?? null,
            created_at: now
        }
    }

    getUserById(id: string): AppUser | null {
        if (!this.hasTable('app_users')) {
            return null
        }
        const row = this.db.prepare('SELECT * FROM app_users WHERE id = ?').get(id) as AppUser | undefined
        return row ?? null
    }

    getUserByTelegramId(telegramId: string): AppUser | null {
        if (!this.hasTable('app_users')) {
            return null
        }
        const row = this.db.prepare('SELECT * FROM app_users WHERE telegram_id = ?').get(telegramId) as AppUser | undefined
        return row ?? null
    }

    getUserByUsername(username: string): AppUser | null {
        if (!this.hasTable('app_users')) {
            return null
        }
        const row = this.db.prepare('SELECT * FROM app_users WHERE username = ?').get(username) as AppUser | undefined
        return row ?? null
    }

    getUserByEmail(email: string): AppUser | null {
        if (!this.hasTable('app_users')) {
            return null
        }
        const row = this.db.prepare('SELECT * FROM app_users WHERE email = ?').get(email) as AppUser | undefined
        return row ?? null
    }

    getAllUsers(): AppUser[] {
        if (!this.hasTable('app_users')) {
            return []
        }
        const rows = this.db.prepare('SELECT * FROM app_users ORDER BY created_at DESC').all() as AppUser[]
        return rows
    }

    generateCliToken(userId: string, name?: string): { id: string; token: string; name: string | null; created_at: number } {
        validateUserId(userId)
        const now = Date.now()
        const id = randomUUID()

        const plainToken = randomBytes(32).toString('base64url')
        const hashedToken = createHash('sha256').update(plainToken).digest('hex')

        this.db.prepare(`
            INSERT INTO cli_tokens (id, user_id, token, name, created_at, last_used_at)
            VALUES (@id, @user_id, @token, @name, @created_at, NULL)
        `).run({
            id,
            user_id: userId,
            token: hashedToken,
            name: name ?? null,
            created_at: now
        })

        return {
            id,
            token: plainToken,
            name: name ?? null,
            created_at: now
        }
    }

    validateCliToken(token: string): { userId: string; tokenId: string } | null {
        const hashedToken = createHash('sha256').update(token).digest('hex')
        const row = this.db.prepare(
            'SELECT id, user_id FROM cli_tokens WHERE token = ?'
        ).get(hashedToken) as DbCliTokenLookup | undefined

        if (!row) {
            return null
        }

        const now = Date.now()
        this.db.prepare(
            'UPDATE cli_tokens SET last_used_at = ? WHERE id = ?'
        ).run(now, row.id)

        return {
            userId: row.user_id,
            tokenId: row.id
        }
    }

    revokeCliToken(tokenId: string, userId: string): boolean {
        validateUserId(userId)
        try {
            const result = this.db.prepare(
                'DELETE FROM cli_tokens WHERE id = ? AND user_id = ?'
            ).run(tokenId, userId)
            return result.changes === 1
        } catch {
            return false
        }
    }

    getCliTokens(userId: string): Array<{ id: string; name: string | null; created_at: number; last_used_at: number | null }> {
        validateUserId(userId)
        const rows = this.db.prepare(
            'SELECT id, name, created_at, last_used_at FROM cli_tokens WHERE user_id = ? ORDER BY created_at DESC'
        ).all(userId) as Array<{ id: string; name: string | null; created_at: number; last_used_at: number | null }>
        return rows
    }
}
