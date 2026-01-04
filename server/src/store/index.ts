import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

export type User = {
    id: string
    telegram_id: string | null
    username: string
    email: string | null
    password_hash: string | null
    created_at: number
}

export type CliToken = {
    id: string
    user_id: string
    token: string
    name: string | null
    created_at: number
    last_used_at: number | null
}

type DbCliTokenRow = {
    id: string
    user_id: string
    token: string
    name: string | null
    created_at: number
    last_used_at: number | null
}

export type StoredSession = {
    id: string
    tag: string | null
    namespace: string
    machineId: string | null
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    agentState: unknown | null
    agentStateVersion: number
    todos: unknown | null
    todosUpdatedAt: number | null
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMachine = {
    id: string
    namespace: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    daemonState: unknown | null
    daemonStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
}

export type StoredPlatformUser = {
    id: number
    platform: string
    platformUserId: string
    namespace: string
    createdAt: number
}

export type StoredPushSubscription = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    createdAt: number
}

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }

const SCHEMA_VERSION = 2
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'users',
    'cli_tokens',
    'platform_users',
    'push_subscriptions'
] as const

type DbSessionRow = {
    id: string
    tag: string | null
    namespace: string
    machine_id: string | null
    created_at: number
    updated_at: number
    metadata: string | null
    metadata_version: number
    agent_state: string | null
    agent_state_version: number
    todos: string | null
    todos_updated_at: number | null
    active: number
    active_at: number | null
    seq: number
}

type DbMachineRow = {
    id: string
    namespace: string
    created_at: number
    updated_at: number
    metadata: string | null
    metadata_version: number
    daemon_state: string | null
    daemon_state_version: number
    active: number
    active_at: number | null
    seq: number
}

type DbMessageRow = {
    id: string
    session_id: string
    content: string
    created_at: number
    seq: number
    local_id: string | null
}

type DbPlatformUserRow = {
    id: number
    platform: string
    platform_user_id: string
    namespace: string
    created_at: number
}

type DbPushSubscriptionRow = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    created_at: number
}

function safeJsonParse(value: string | null): unknown | null {
    if (value === null) return null
    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

function toStoredSession(row: DbSessionRow): StoredSession {
    return {
        id: row.id,
        tag: row.tag,
        namespace: row.namespace,
        machineId: row.machine_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata),
        metadataVersion: row.metadata_version,
        agentState: safeJsonParse(row.agent_state),
        agentStateVersion: row.agent_state_version,
        todos: safeJsonParse(row.todos),
        todosUpdatedAt: row.todos_updated_at,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq
    }
}

function toStoredMachine(row: DbMachineRow): StoredMachine {
    return {
        id: row.id,
        namespace: row.namespace,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata),
        metadataVersion: row.metadata_version,
        daemonState: safeJsonParse(row.daemon_state),
        daemonStateVersion: row.daemon_state_version,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq
    }
}

function toStoredMessage(row: DbMessageRow): StoredMessage {
    return {
        id: row.id,
        sessionId: row.session_id,
        content: safeJsonParse(row.content),
        createdAt: row.created_at,
        seq: row.seq,
        localId: row.local_id
    }
}

function validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Invalid userId: userId must be a non-empty string')
    }
}

function toStoredPlatformUser(row: DbPlatformUserRow): StoredPlatformUser {
    return {
        id: row.id,
        platform: row.platform,
        platformUserId: row.platform_user_id,
        namespace: row.namespace,
        createdAt: row.created_at
    }
}

function toStoredPushSubscription(row: DbPushSubscriptionRow): StoredPushSubscription {
    return {
        id: row.id,
        namespace: row.namespace,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        createdAt: row.created_at
    }
}

export class Store {
    private db: Database
    private readonly dbPath: string

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
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                this.migrateLegacySchema()
                this.setUserVersion(SCHEMA_VERSION)
                return
            }

            this.createSchema()
            this.ensureSystemUsers()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion === 1) {
            this.migrateV1ToV2()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion !== SCHEMA_VERSION) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        this.assertRequiredTablesPresent()
        this.ensureSystemUsers()
    }

    private createSchema(): void {
        this.createTables()
        this.createIndexes()
    }

    private createTables(): void {
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

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT UNIQUE,
                username TEXT NOT NULL,
                email TEXT,
                password_hash TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cli_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                name TEXT,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS platform_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                UNIQUE(platform, platform_user_id)
            );

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, endpoint)
            );
        `)
    }

    private createIndexes(): void {
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);
            CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace);
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_cli_tokens_user_id ON cli_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_platform_users_platform ON platform_users(platform);
            CREATE INDEX IF NOT EXISTS idx_platform_users_platform_namespace ON platform_users(platform, namespace);
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
        if (!this.hasTable('users')) {
            return
        }

        const now = Date.now()
        const insertSystemUser = this.db.prepare(`
            INSERT OR IGNORE INTO users (id, telegram_id, username, email, password_hash, created_at)
            VALUES (@id, NULL, @username, NULL, NULL, @created_at)
        `)

        insertSystemUser.run({ id: 'admin-user', username: 'Admin', created_at: now })
        insertSystemUser.run({ id: 'cli-user', username: 'CLI User', created_at: now })
    }

    private ensureUserAccountColumns(): void {
        if (!this.hasTable('users')) {
            return
        }

        const columns = this.getColumnNames('users')
        if (!columns.has('password_hash')) {
            this.db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT')
        }
        if (!columns.has('email')) {
            this.db.exec('ALTER TABLE users ADD COLUMN email TEXT')
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
                this.db.exec("UPDATE sessions SET namespace = user_id WHERE namespace = 'default'")
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
                this.db.exec("UPDATE machines SET namespace = user_id WHERE namespace = 'default'")
            } catch {
            }
        }

        if (columns.has('user_id')) {
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

    private migrateV1ToV2(): void {
        if (this.hasTable('users')) {
            const columns = this.getColumnNames('users')
            const looksLikePlatformUsers = columns.has('platform') && columns.has('platform_user_id') && !columns.has('username')
            if (looksLikePlatformUsers && !this.hasTable('platform_users')) {
                this.db.exec('ALTER TABLE users RENAME TO platform_users')
            }
        }

        this.createTables()
        this.ensureUserAccountColumns()
        this.ensureSessionsSchema()
        this.ensureMachinesSchema()
        this.ensureMessagesSchema()
        this.ensureSystemUsers()
        this.createIndexes()
        this.assertRequiredTablesPresent()
    }

    private migrateLegacySchema(): void {
        if (this.hasTable('users')) {
            const columns = this.getColumnNames('users')
            const looksLikePlatformUsers = columns.has('platform') && columns.has('platform_user_id') && !columns.has('username')
            if (looksLikePlatformUsers && !this.hasTable('platform_users')) {
                this.db.exec('ALTER TABLE users RENAME TO platform_users')
            }
        }

        this.createTables()
        this.ensureUserAccountColumns()
        this.ensureSessionsSchema()
        this.ensureMachinesSchema()
        this.ensureMessagesSchema()
        this.ensureSystemUsers()
        this.createIndexes()
        this.assertRequiredTablesPresent()
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

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, namespace: string): StoredSession {
        const existing = this.db.prepare(
            'SELECT * FROM sessions WHERE tag = ? AND namespace = ? ORDER BY created_at DESC LIMIT 1'
        ).get(tag, namespace) as DbSessionRow | undefined

        if (existing) {
            return toStoredSession(existing)
        }

        const now = Date.now()
        const id = randomUUID()

        const metadataJson = JSON.stringify(metadata)
        const agentStateJson = agentState === null || agentState === undefined ? null : JSON.stringify(agentState)

        this.db.prepare(`
            INSERT INTO sessions (
                id, tag, namespace, machine_id, created_at, updated_at,
                metadata, metadata_version,
                agent_state, agent_state_version,
                todos, todos_updated_at,
                active, active_at, seq
            ) VALUES (
                @id, @tag, @namespace, NULL, @created_at, @updated_at,
                @metadata, 1,
                @agent_state, 1,
                NULL, NULL,
                0, NULL, 0
            )
        `).run({
            id,
            tag,
            namespace,
            created_at: now,
            updated_at: now,
            metadata: metadataJson,
            agent_state: agentStateJson
        })

        const row = this.getSession(id)
        if (!row) {
            throw new Error('Failed to create session')
        }
        return row
    }

    updateSessionMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number,
        namespace: string,
        options?: { touchUpdatedAt?: boolean }
    ): VersionedUpdateResult<unknown | null> {
        try {
            const now = Date.now()
            const json = JSON.stringify(metadata)
            const touchUpdatedAt = options?.touchUpdatedAt !== false
            const result = this.db.prepare(`
                UPDATE sessions
                SET metadata = @metadata,
                    metadata_version = metadata_version + 1,
                    updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END,
                    seq = seq + 1
                WHERE id = @id AND namespace = @namespace AND metadata_version = @expectedVersion
            `).run({
                id,
                metadata: json,
                updated_at: now,
                expectedVersion,
                namespace,
                touch_updated_at: touchUpdatedAt ? 1 : 0
            })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: metadata }
            }

            const current = this.db.prepare(
                'SELECT metadata, metadata_version FROM sessions WHERE id = ? AND namespace = ?'
            ).get(id, namespace) as
                | { metadata: string | null; metadata_version: number }
                | undefined
            if (!current) {
                return { result: 'error' }
            }
            return {
                result: 'version-mismatch',
                version: current.metadata_version,
                value: safeJsonParse(current.metadata)
            }
        } catch {
            return { result: 'error' }
        }
    }

    updateSessionAgentState(
        id: string,
        agentState: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        try {
            const now = Date.now()
            const json = agentState === null || agentState === undefined ? null : JSON.stringify(agentState)
            const result = this.db.prepare(`
                UPDATE sessions
                SET agent_state = @agent_state,
                    agent_state_version = agent_state_version + 1,
                    updated_at = @updated_at,
                    seq = seq + 1
                WHERE id = @id AND namespace = @namespace AND agent_state_version = @expectedVersion
            `).run({ id, agent_state: json, updated_at: now, expectedVersion, namespace })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: agentState === undefined ? null : agentState }
            }

            const current = this.db.prepare(
                'SELECT agent_state, agent_state_version FROM sessions WHERE id = ? AND namespace = ?'
            ).get(id, namespace) as
                | { agent_state: string | null; agent_state_version: number }
                | undefined
            if (!current) {
                return { result: 'error' }
            }
            return {
                result: 'version-mismatch',
                version: current.agent_state_version,
                value: safeJsonParse(current.agent_state)
            }
        } catch {
            return { result: 'error' }
        }
    }

    setSessionTodos(id: string, todos: unknown, todosUpdatedAt: number, namespace: string): boolean {
        try {
            const json = todos === null || todos === undefined ? null : JSON.stringify(todos)
            const result = this.db.prepare(`
                UPDATE sessions
                SET todos = @todos,
                    todos_updated_at = @todos_updated_at,
                    updated_at = CASE WHEN updated_at > @updated_at THEN updated_at ELSE @updated_at END,
                    seq = seq + 1
                WHERE id = @id
                  AND namespace = @namespace
                  AND (todos_updated_at IS NULL OR todos_updated_at < @todos_updated_at)
            `).run({
                id,
                todos: json,
                todos_updated_at: todosUpdatedAt,
                updated_at: todosUpdatedAt,
                namespace
            })

            return result.changes === 1
        } catch {
            return false
        }
    }

    getSession(id: string): StoredSession | null {
        const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as DbSessionRow | undefined
        return row ? toStoredSession(row) : null
    }

    getSessionByNamespace(id: string, namespace: string): StoredSession | null {
        const row = this.db.prepare(
            'SELECT * FROM sessions WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbSessionRow | undefined
        return row ? toStoredSession(row) : null
    }

    getSessions(): StoredSession[] {
        const rows = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as DbSessionRow[]
        return rows.map(toStoredSession)
    }

    getSessionsByNamespace(namespace: string): StoredSession[] {
        const rows = this.db.prepare(
            'SELECT * FROM sessions WHERE namespace = ? ORDER BY updated_at DESC'
        ).all(namespace) as DbSessionRow[]
        return rows.map(toStoredSession)
    }

    getOrCreateMachine(id: string, metadata: unknown, daemonState: unknown, namespace: string): StoredMachine {
        const existing = this.db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
        if (existing) {
            const stored = toStoredMachine(existing)
            if (stored.namespace !== namespace) {
                throw new Error('Machine namespace mismatch')
            }
            return stored
        }

        const now = Date.now()
        const metadataJson = JSON.stringify(metadata)
        const daemonStateJson = daemonState === null || daemonState === undefined ? null : JSON.stringify(daemonState)

        this.db.prepare(`
            INSERT INTO machines (
                id, namespace, created_at, updated_at,
                metadata, metadata_version,
                daemon_state, daemon_state_version,
                active, active_at, seq
            ) VALUES (
                @id, @namespace, @created_at, @updated_at,
                @metadata, 1,
                @daemon_state, 1,
                0, NULL, 0
            )
        `).run({
            id,
            namespace,
            created_at: now,
            updated_at: now,
            metadata: metadataJson,
            daemon_state: daemonStateJson
        })

        const row = this.getMachine(id)
        if (!row) {
            throw new Error('Failed to create machine')
        }
        return row
    }

    updateMachineMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        try {
            const now = Date.now()
            const json = JSON.stringify(metadata)
            const result = this.db.prepare(`
                UPDATE machines
                SET metadata = @metadata,
                    metadata_version = metadata_version + 1,
                    updated_at = @updated_at,
                    seq = seq + 1
                WHERE id = @id AND namespace = @namespace AND metadata_version = @expectedVersion
            `).run({ id, metadata: json, updated_at: now, expectedVersion, namespace })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: metadata }
            }

            const current = this.db.prepare(
                'SELECT metadata, metadata_version FROM machines WHERE id = ? AND namespace = ?'
            ).get(id, namespace) as
                | { metadata: string | null; metadata_version: number }
                | undefined
            if (!current) {
                return { result: 'error' }
            }
            return {
                result: 'version-mismatch',
                version: current.metadata_version,
                value: safeJsonParse(current.metadata)
            }
        } catch {
            return { result: 'error' }
        }
    }

    updateMachineDaemonState(
        id: string,
        daemonState: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        try {
            const now = Date.now()
            const json = daemonState === null || daemonState === undefined ? null : JSON.stringify(daemonState)
            const result = this.db.prepare(`
                UPDATE machines
                SET daemon_state = @daemon_state,
                    daemon_state_version = daemon_state_version + 1,
                    updated_at = @updated_at,
                    active = 1,
                    active_at = @active_at,
                    seq = seq + 1
                WHERE id = @id AND namespace = @namespace AND daemon_state_version = @expectedVersion
            `).run({ id, daemon_state: json, updated_at: now, active_at: now, expectedVersion, namespace })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: daemonState === undefined ? null : daemonState }
            }

            const current = this.db.prepare(
                'SELECT daemon_state, daemon_state_version FROM machines WHERE id = ? AND namespace = ?'
            ).get(id, namespace) as
                | { daemon_state: string | null; daemon_state_version: number }
                | undefined
            if (!current) {
                return { result: 'error' }
            }
            return {
                result: 'version-mismatch',
                version: current.daemon_state_version,
                value: safeJsonParse(current.daemon_state)
            }
        } catch {
            return { result: 'error' }
        }
    }

    getMachine(id: string): StoredMachine | null {
        const row = this.db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
        return row ? toStoredMachine(row) : null
    }

    getMachineByNamespace(id: string, namespace: string): StoredMachine | null {
        const row = this.db.prepare(
            'SELECT * FROM machines WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbMachineRow | undefined
        return row ? toStoredMachine(row) : null
    }

    getMachines(): StoredMachine[] {
        const rows = this.db.prepare('SELECT * FROM machines ORDER BY updated_at DESC').all() as DbMachineRow[]
        return rows.map(toStoredMachine)
    }

    getMachinesByNamespace(namespace: string): StoredMachine[] {
        const rows = this.db.prepare(
            'SELECT * FROM machines WHERE namespace = ? ORDER BY updated_at DESC'
        ).all(namespace) as DbMachineRow[]
        return rows.map(toStoredMachine)
    }

    addMessage(sessionId: string, content: unknown, localId?: string): StoredMessage {
        const now = Date.now()

        if (localId) {
            const existing = this.db.prepare(
                'SELECT * FROM messages WHERE session_id = ? AND local_id = ? LIMIT 1'
            ).get(sessionId, localId) as DbMessageRow | undefined
            if (existing) {
                return toStoredMessage(existing)
            }
        }

        const msgSeqRow = this.db.prepare(
            'SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM messages WHERE session_id = ?'
        ).get(sessionId) as { nextSeq: number }
        const msgSeq = msgSeqRow.nextSeq

        const id = randomUUID()
        const json = JSON.stringify(content)

        this.db.prepare(`
            INSERT INTO messages (
                id, session_id, content, created_at, seq, local_id
            ) VALUES (
                @id, @session_id, @content, @created_at, @seq, @local_id
            )
        `).run({
            id,
            session_id: sessionId,
            content: json,
            created_at: now,
            seq: msgSeq,
            local_id: localId ?? null
        })

        const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as DbMessageRow | undefined
        if (!row) {
            throw new Error('Failed to create message')
        }
        return toStoredMessage(row)
    }

    getMessages(sessionId: string, limit: number = 200, beforeSeq?: number): StoredMessage[] {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200

        const rows = (beforeSeq !== undefined && beforeSeq !== null && Number.isFinite(beforeSeq))
            ? this.db.prepare(
                'SELECT * FROM messages WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?'
            ).all(sessionId, beforeSeq, safeLimit) as DbMessageRow[]
            : this.db.prepare(
                'SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?'
            ).all(sessionId, safeLimit) as DbMessageRow[]

        return rows.reverse().map(toStoredMessage)
    }

    getMessagesAfter(sessionId: string, afterSeq: number, limit: number = 200): StoredMessage[] {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
        const safeAfterSeq = Number.isFinite(afterSeq) ? afterSeq : 0

        const rows = this.db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?'
        ).all(sessionId, safeAfterSeq, safeLimit) as DbMessageRow[]

        return rows.map(toStoredMessage)
    }

    getDefaultCliUserId(): string {
        const row = this.db.prepare(`
            SELECT id
            FROM users
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
    }): User {
        const now = user.created_at ?? Date.now()

        this.db.prepare(`
            INSERT INTO users (id, telegram_id, username, email, password_hash, created_at)
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

    getUserById(id: string): User | null {
        const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
        return row ?? null
    }

    getUserByTelegramId(telegramId: string): User | null {
        const row = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined
        return row ?? null
    }

    getUserByUsername(username: string): User | null {
        const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined
        return row ?? null
    }

    getUserByEmail(email: string): User | null {
        const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined
        return row ?? null
    }

    getAllUsers(): User[] {
        const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[]
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
        ).get(hashedToken) as { id: string; user_id: string } | undefined

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

    getPlatformUser(platform: string, platformUserId: string): StoredPlatformUser | null {
        const row = this.db.prepare(
            'SELECT * FROM platform_users WHERE platform = ? AND platform_user_id = ? LIMIT 1'
        ).get(platform, platformUserId) as DbPlatformUserRow | undefined
        return row ? toStoredPlatformUser(row) : null
    }

    getPlatformUsersByPlatform(platform: string): StoredPlatformUser[] {
        const rows = this.db.prepare(
            'SELECT * FROM platform_users WHERE platform = ? ORDER BY created_at ASC'
        ).all(platform) as DbPlatformUserRow[]
        return rows.map(toStoredPlatformUser)
    }

    getPlatformUsersByPlatformAndNamespace(platform: string, namespace: string): StoredPlatformUser[] {
        const rows = this.db.prepare(
            'SELECT * FROM platform_users WHERE platform = ? AND namespace = ? ORDER BY created_at ASC'
        ).all(platform, namespace) as DbPlatformUserRow[]
        return rows.map(toStoredPlatformUser)
    }

    addPlatformUser(platform: string, platformUserId: string, namespace: string): StoredPlatformUser {
        const now = Date.now()
        this.db.prepare(`
            INSERT OR IGNORE INTO platform_users (
                platform, platform_user_id, namespace, created_at
            ) VALUES (
                @platform, @platform_user_id, @namespace, @created_at
            )
        `).run({
            platform,
            platform_user_id: platformUserId,
            namespace,
            created_at: now
        })

        const row = this.getPlatformUser(platform, platformUserId)
        if (!row) {
            throw new Error('Failed to create user')
        }
        return row
    }

    removePlatformUser(platform: string, platformUserId: string): boolean {
        const result = this.db.prepare(
            'DELETE FROM platform_users WHERE platform = ? AND platform_user_id = ?'
        ).run(platform, platformUserId)
        return result.changes > 0
    }

    /**
     * Delete a session and all associated data.
     * Messages are automatically cascade-deleted via foreign key constraint.
     * Todos are stored in the sessions.todos column and deleted with the row.
     */
    deleteSession(id: string, namespace: string): boolean {
        const result = this.db.prepare(
            'DELETE FROM sessions WHERE id = ? AND namespace = ?'
        ).run(id, namespace)
        return result.changes > 0
    }

    addPushSubscription(
        namespace: string,
        subscription: { endpoint: string; p256dh: string; auth: string }
    ): void {
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO push_subscriptions (
                namespace, endpoint, p256dh, auth, created_at
            ) VALUES (
                @namespace, @endpoint, @p256dh, @auth, @created_at
            )
            ON CONFLICT(namespace, endpoint)
            DO UPDATE SET
                p256dh = excluded.p256dh,
                auth = excluded.auth,
                created_at = excluded.created_at
        `).run({
            namespace,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            created_at: now
        })
    }

    removePushSubscription(namespace: string, endpoint: string): void {
        this.db.prepare(
            'DELETE FROM push_subscriptions WHERE namespace = ? AND endpoint = ?'
        ).run(namespace, endpoint)
    }

    getPushSubscriptionsByNamespace(namespace: string): StoredPushSubscription[] {
        const rows = this.db.prepare(
            'SELECT * FROM push_subscriptions WHERE namespace = ? ORDER BY created_at DESC'
        ).all(namespace) as DbPushSubscriptionRow[]
        return rows.map(toStoredPushSubscription)
    }
}
