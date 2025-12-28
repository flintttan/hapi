import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21)

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
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    daemonState: unknown | null
    daemonStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
    userId: string
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
}

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }

type DbSessionRow = {
    id: string
    tag: string | null
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata),
        metadataVersion: row.metadata_version,
        daemonState: safeJsonParse(row.daemon_state),
        daemonStateVersion: row.daemon_state_version,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq,
        userId: row.user_id
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

export class Store {
    private db: Database

    constructor(dbPath: string) {
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
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT UNIQUE,
                username TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
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
                user_id TEXT NOT NULL DEFAULT 'admin-user',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'admin-user',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                daemon_state TEXT,
                daemon_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0,
                PRIMARY KEY (id, user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_machines_user_id ON machines(user_id);

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

            CREATE TABLE IF NOT EXISTS cli_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                name TEXT,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_cli_tokens_user_id ON cli_tokens(user_id);
        `)

        const sessionColumns = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        const sessionColumnNames = new Set(sessionColumns.map((c) => c.name))

        if (!sessionColumnNames.has('todos')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN todos TEXT')
        }
        if (!sessionColumnNames.has('todos_updated_at')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN todos_updated_at INTEGER')
        }

        // Add password_hash and email columns to users table if they don't exist
        const userColumns = this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
        const userColumnNames = new Set(userColumns.map((c) => c.name))

        if (!userColumnNames.has('password_hash')) {
            this.db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT')
        }
        if (!userColumnNames.has('email')) {
            // SQLite doesn't allow adding UNIQUE columns via ALTER TABLE
            // Add without UNIQUE first
            this.db.exec('ALTER TABLE users ADD COLUMN email TEXT')
            // Then create a unique index for existing databases
            try {
                this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL')
            } catch {
                // Index might already exist, ignore error
            }
        }

        // Migrate machines table to composite primary key (id, user_id) for multi-user support
        // Check if machines table needs migration
        const machinesTableInfo = this.db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'machines') as { sql: string } | undefined
        if (machinesTableInfo && machinesTableInfo.sql.includes('id TEXT PRIMARY KEY')) {
            // Old schema detected - needs migration
            this.db.exec(`
                -- Create new machines table with composite primary key
                CREATE TABLE machines_new (
                    id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata TEXT,
                    metadata_version INTEGER DEFAULT 1,
                    daemon_state TEXT,
                    daemon_state_version INTEGER DEFAULT 1,
                    active INTEGER DEFAULT 0,
                    active_at INTEGER,
                    seq INTEGER DEFAULT 0,
                    PRIMARY KEY (id, user_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                -- Copy data from old table to new table
                INSERT INTO machines_new SELECT * FROM machines;

                -- Drop old table
                DROP TABLE machines;

                -- Rename new table to original name
                ALTER TABLE machines_new RENAME TO machines;

                -- Recreate index
                CREATE INDEX idx_machines_user_id ON machines(user_id);
            `)
        }
    }

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, userId: string): StoredSession {
        validateUserId(userId)
        const existing = this.db.prepare(
            'SELECT * FROM sessions WHERE tag = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
        ).get(tag, userId) as DbSessionRow | undefined

        if (existing) {
            return toStoredSession(existing)
        }

        const now = Date.now()
        const id = randomUUID()

        const metadataJson = JSON.stringify(metadata)
        const agentStateJson = agentState === null || agentState === undefined ? null : JSON.stringify(agentState)

        this.db.prepare(`
            INSERT INTO sessions (
                id, tag, machine_id, created_at, updated_at,
                metadata, metadata_version,
                agent_state, agent_state_version,
                todos, todos_updated_at,
                active, active_at, seq, user_id
            ) VALUES (
                @id, @tag, NULL, @created_at, @updated_at,
                @metadata, 1,
                @agent_state, 1,
                NULL, NULL,
                0, NULL, 0, @user_id
            )
        `).run({
            id,
            tag,
            created_at: now,
            updated_at: now,
            metadata: metadataJson,
            agent_state: agentStateJson,
            user_id: userId
        })

        const row = this.getSession(id, userId)
        if (!row) {
            throw new Error('Failed to create session')
        }
        return row
    }

    updateSessionMetadata(id: string, metadata: unknown, expectedVersion: number, userId: string): VersionedUpdateResult<unknown | null> {
        validateUserId(userId)
        try {
            const now = Date.now()
            const json = JSON.stringify(metadata)
            const result = this.db.prepare(`
                UPDATE sessions
                SET metadata = @metadata,
                    metadata_version = metadata_version + 1,
                    updated_at = @updated_at,
                    seq = seq + 1
                WHERE id = @id AND metadata_version = @expectedVersion AND user_id = @userId
            `).run({ id, metadata: json, updated_at: now, expectedVersion, userId })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: metadata }
            }

            const current = this.db.prepare('SELECT metadata, metadata_version FROM sessions WHERE id = ? AND user_id = ?').get(id, userId) as
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

    updateSessionAgentState(id: string, agentState: unknown, expectedVersion: number, userId: string): VersionedUpdateResult<unknown | null> {
        validateUserId(userId)
        try {
            const now = Date.now()
            const json = agentState === null || agentState === undefined ? null : JSON.stringify(agentState)
            const result = this.db.prepare(`
                UPDATE sessions
                SET agent_state = @agent_state,
                    agent_state_version = agent_state_version + 1,
                    updated_at = @updated_at,
                    seq = seq + 1
                WHERE id = @id AND agent_state_version = @expectedVersion AND user_id = @userId
            `).run({ id, agent_state: json, updated_at: now, expectedVersion, userId })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: agentState === undefined ? null : agentState }
            }

            const current = this.db.prepare('SELECT agent_state, agent_state_version FROM sessions WHERE id = ? AND user_id = ?').get(id, userId) as
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

    setSessionTodos(id: string, todos: unknown, todosUpdatedAt: number, userId: string): boolean {
        validateUserId(userId)
        try {
            const json = todos === null || todos === undefined ? null : JSON.stringify(todos)
            const result = this.db.prepare(`
                UPDATE sessions
                SET todos = @todos,
                    todos_updated_at = @todos_updated_at,
                    updated_at = CASE WHEN updated_at > @updated_at THEN updated_at ELSE @updated_at END,
                    seq = seq + 1
                WHERE id = @id AND user_id = @userId AND (todos_updated_at IS NULL OR todos_updated_at < @todos_updated_at)
            `).run({
                id,
                todos: json,
                todos_updated_at: todosUpdatedAt,
                updated_at: todosUpdatedAt,
                userId
            })

            return result.changes === 1
        } catch {
            return false
        }
    }

    getSession(id: string, userId: string): StoredSession | null {
        validateUserId(userId)
        const row = this.db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, userId) as DbSessionRow | undefined
        return row ? toStoredSession(row) : null
    }

    getSessions(userId: string): StoredSession[] {
        validateUserId(userId)
        const rows = this.db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DbSessionRow[]
        return rows.map(toStoredSession)
    }

    createSession(data: { tag?: string; machineId?: string; metadata: unknown; agentState?: unknown }, userId: string): StoredSession {
        validateUserId(userId)
        const now = Date.now()
        const id = randomUUID()

        const metadataJson = JSON.stringify(data.metadata)
        const agentStateJson = data.agentState === null || data.agentState === undefined ? null : JSON.stringify(data.agentState)

        this.db.prepare(`
            INSERT INTO sessions (
                id, tag, machine_id, created_at, updated_at,
                metadata, metadata_version,
                agent_state, agent_state_version,
                todos, todos_updated_at,
                active, active_at, seq, user_id
            ) VALUES (
                @id, @tag, @machine_id, @created_at, @updated_at,
                @metadata, 1,
                @agent_state, 1,
                NULL, NULL,
                0, NULL, 0, @user_id
            )
        `).run({
            id,
            tag: data.tag ?? null,
            machine_id: data.machineId ?? null,
            created_at: now,
            updated_at: now,
            metadata: metadataJson,
            agent_state: agentStateJson,
            user_id: userId
        })

        const row = this.getSession(id, userId)
        if (!row) {
            throw new Error('Failed to create session')
        }
        return row
    }

    updateSession(sessionId: string, updates: Partial<Pick<StoredSession, 'tag' | 'machineId' | 'active'>>, userId: string): boolean {
        validateUserId(userId)
        try {
            const fields: string[] = []
            const params: Record<string, unknown> = { sessionId, userId }

            if (updates.tag !== undefined) {
                fields.push('tag = @tag')
                params.tag = updates.tag
            }
            if (updates.machineId !== undefined) {
                fields.push('machine_id = @machine_id')
                params.machine_id = updates.machineId
            }
            if (updates.active !== undefined) {
                fields.push('active = @active')
                fields.push('active_at = @active_at')
                params.active = updates.active ? 1 : 0
                params.active_at = updates.active ? Date.now() : null
            }

            if (fields.length === 0) {
                return false
            }

            fields.push('updated_at = @updated_at')
            fields.push('seq = seq + 1')
            params.updated_at = Date.now()

            const result = this.db.prepare(`
                UPDATE sessions
                SET ${fields.join(', ')}
                WHERE id = @sessionId AND user_id = @userId
            `).run(params)

            return result.changes === 1
        } catch {
            return false
        }
    }

    deleteSession(sessionId: string, userId: string): boolean {
        validateUserId(userId)
        try {
            const result = this.db.prepare(`
                DELETE FROM sessions
                WHERE id = @sessionId AND user_id = @userId
            `).run({ sessionId, userId })

            return result.changes === 1
        } catch {
            return false
        }
    }

    getOrCreateMachine(id: string, metadata: unknown, daemonState: unknown, userId: string): StoredMachine {
        validateUserId(userId)
        const existing = this.db.prepare('SELECT * FROM machines WHERE id = ? AND user_id = ?').get(id, userId) as DbMachineRow | undefined
        if (existing) {
            return toStoredMachine(existing)
        }

        const now = Date.now()
        const metadataJson = JSON.stringify(metadata)
        const daemonStateJson = daemonState === null || daemonState === undefined ? null : JSON.stringify(daemonState)

        this.db.prepare(`
            INSERT INTO machines (
                id, created_at, updated_at,
                metadata, metadata_version,
                daemon_state, daemon_state_version,
                active, active_at, seq, user_id
            ) VALUES (
                @id, @created_at, @updated_at,
                @metadata, 1,
                @daemon_state, 1,
                0, NULL, 0, @user_id
            )
        `).run({
            id,
            created_at: now,
            updated_at: now,
            metadata: metadataJson,
            daemon_state: daemonStateJson,
            user_id: userId
        })

        const row = this.getMachine(id, userId)
        if (!row) {
            throw new Error('Failed to create machine')
        }
        return row
    }

    updateMachineMetadata(id: string, metadata: unknown, expectedVersion: number, userId: string): VersionedUpdateResult<unknown | null> {
        validateUserId(userId)
        try {
            const now = Date.now()
            const json = JSON.stringify(metadata)
            const result = this.db.prepare(`
                UPDATE machines
                SET metadata = @metadata,
                    metadata_version = metadata_version + 1,
                    updated_at = @updated_at,
                    seq = seq + 1
                WHERE id = @id AND metadata_version = @expectedVersion AND user_id = @userId
            `).run({ id, metadata: json, updated_at: now, expectedVersion, userId })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: metadata }
            }

            const current = this.db.prepare('SELECT metadata, metadata_version FROM machines WHERE id = ? AND user_id = ?').get(id, userId) as
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

    updateMachineDaemonState(id: string, daemonState: unknown, expectedVersion: number, userId: string): VersionedUpdateResult<unknown | null> {
        validateUserId(userId)
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
                WHERE id = @id AND daemon_state_version = @expectedVersion AND user_id = @userId
            `).run({ id, daemon_state: json, updated_at: now, active_at: now, expectedVersion, userId })

            if (result.changes === 1) {
                return { result: 'success', version: expectedVersion + 1, value: daemonState === undefined ? null : daemonState }
            }

            const current = this.db.prepare('SELECT daemon_state, daemon_state_version FROM machines WHERE id = ? AND user_id = ?').get(id, userId) as
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

    getMachine(id: string, userId: string): StoredMachine | null {
        validateUserId(userId)
        const row = this.db.prepare('SELECT * FROM machines WHERE id = ? AND user_id = ?').get(id, userId) as DbMachineRow | undefined
        return row ? toStoredMachine(row) : null
    }

    getMachines(userId: string): StoredMachine[] {
        validateUserId(userId)
        const rows = this.db.prepare('SELECT * FROM machines WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DbMachineRow[]
        return rows.map(toStoredMachine)
    }

    createMachine(data: { id: string; metadata: unknown; daemonState?: unknown }, userId: string): StoredMachine {
        validateUserId(userId)
        const now = Date.now()
        const metadataJson = JSON.stringify(data.metadata)
        const daemonStateJson = data.daemonState === null || data.daemonState === undefined ? null : JSON.stringify(data.daemonState)

        this.db.prepare(`
            INSERT INTO machines (
                id, created_at, updated_at,
                metadata, metadata_version,
                daemon_state, daemon_state_version,
                active, active_at, seq, user_id
            ) VALUES (
                @id, @created_at, @updated_at,
                @metadata, 1,
                @daemon_state, 1,
                0, NULL, 0, @user_id
            )
        `).run({
            id: data.id,
            created_at: now,
            updated_at: now,
            metadata: metadataJson,
            daemon_state: daemonStateJson,
            user_id: userId
        })

        const row = this.getMachine(data.id, userId)
        if (!row) {
            throw new Error('Failed to create machine')
        }
        return row
    }

    updateMachine(machineId: string, updates: Partial<Pick<StoredMachine, 'active'>>, userId: string): boolean {
        validateUserId(userId)
        try {
            const fields: string[] = []
            const params: Record<string, unknown> = { machineId, userId }

            if (updates.active !== undefined) {
                fields.push('active = @active')
                fields.push('active_at = @active_at')
                params.active = updates.active ? 1 : 0
                params.active_at = updates.active ? Date.now() : null
            }

            if (fields.length === 0) {
                return false
            }

            fields.push('updated_at = @updated_at')
            fields.push('seq = seq + 1')
            params.updated_at = Date.now()

            const result = this.db.prepare(`
                UPDATE machines
                SET ${fields.join(', ')}
                WHERE id = @machineId AND user_id = @userId
            `).run(params)

            return result.changes === 1
        } catch {
            return false
        }
    }

    deleteMachine(machineId: string, userId: string): boolean {
        validateUserId(userId)
        try {
            const result = this.db.prepare(`
                DELETE FROM machines
                WHERE id = @machineId AND user_id = @userId
            `).run({ machineId, userId })

            return result.changes === 1
        } catch {
            return false
        }
    }

    createMessage(sessionId: string, content: unknown, userId: string, localId?: string): StoredMessage {
        validateUserId(userId)
        const now = Date.now()

        // Verify session ownership before adding message
        const session = this.getSession(sessionId, userId)
        if (!session) {
            throw new Error('Session not found or access denied')
        }

        if (localId) {
            const existing = this.db.prepare(
                'SELECT m.* FROM messages m JOIN sessions s ON m.session_id = s.id WHERE m.session_id = ? AND m.local_id = ? AND s.user_id = ? LIMIT 1'
            ).get(sessionId, localId, userId) as DbMessageRow | undefined
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

    getMessages(sessionId: string, userId: string, limit: number = 200, beforeSeq?: number): StoredMessage[] {
        validateUserId(userId)
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200

        // Verify session ownership via JOIN
        const rows = (beforeSeq !== undefined && beforeSeq !== null && Number.isFinite(beforeSeq))
            ? this.db.prepare(
                'SELECT m.* FROM messages m JOIN sessions s ON m.session_id = s.id WHERE m.session_id = ? AND s.user_id = ? AND m.seq < ? ORDER BY m.seq DESC LIMIT ?'
            ).all(sessionId, userId, beforeSeq, safeLimit) as DbMessageRow[]
            : this.db.prepare(
                'SELECT m.* FROM messages m JOIN sessions s ON m.session_id = s.id WHERE m.session_id = ? AND s.user_id = ? ORDER BY m.seq DESC LIMIT ?'
            ).all(sessionId, userId, safeLimit) as DbMessageRow[]

        return rows.reverse().map(toStoredMessage)
    }

    updateMessage(messageId: string, updates: Partial<Pick<StoredMessage, 'content'>>, userId: string): boolean {
        validateUserId(userId)
        try {
            if (!updates.content) {
                return false
            }

            const json = JSON.stringify(updates.content)
            const result = this.db.prepare(`
                UPDATE messages
                SET content = @content
                WHERE id = @messageId
                AND session_id IN (SELECT id FROM sessions WHERE user_id = @userId)
            `).run({ messageId, content: json, userId })

            return result.changes === 1
        } catch {
            return false
        }
    }

    deleteMessage(messageId: string, userId: string): boolean {
        validateUserId(userId)
        try {
            const result = this.db.prepare(`
                DELETE FROM messages
                WHERE id = @messageId
                AND session_id IN (SELECT id FROM sessions WHERE user_id = @userId)
            `).run({ messageId, userId })

            return result.changes === 1
        } catch {
            return false
        }
    }

    getSessionMessages(sessionId: string, userId: string, limit?: number, beforeSeq?: number): StoredMessage[] {
        validateUserId(userId)
        // Alias for getMessages for backward compatibility
        return this.getMessages(sessionId, userId, limit, beforeSeq)
    }

    createUser(user: Omit<User, 'created_at'> & { created_at?: number }): User {
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
        const id = nanoid()

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

    /**
     * Internal unsafe methods for SyncEngine cache operations.
     * These bypass userId validation for internal cache refresh.
     * DO NOT use in route handlers or public APIs.
     */
    _unsafeGetSession(id: string): StoredSession | null {
        const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as DbSessionRow | undefined
        return row ? toStoredSession(row) : null
    }

    _unsafeGetMachine(id: string): StoredMachine | null {
        const row = this.db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
        return row ? toStoredMachine(row) : null
    }

    _unsafeGetMessages(sessionId: string, limit: number = 200): StoredMessage[] {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
        const rows = this.db.prepare(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, safeLimit) as DbMessageRow[]
        return rows.reverse().map(toStoredMessage)
    }

    _unsafeSetSessionTodos(id: string, todos: unknown, todosUpdatedAt: number): boolean {
        try {
            const json = todos === null || todos === undefined ? null : JSON.stringify(todos)
            const result = this.db.prepare(`
                UPDATE sessions
                SET todos = @todos,
                    todos_updated_at = @todos_updated_at,
                    updated_at = CASE WHEN updated_at > @updated_at THEN updated_at ELSE @updated_at END,
                    seq = seq + 1
                WHERE id = @id AND (todos_updated_at IS NULL OR todos_updated_at < @todos_updated_at)
            `).run({
                id,
                todos: json,
                todos_updated_at: todosUpdatedAt,
                updated_at: todosUpdatedAt
            })

            return result.changes === 1
        } catch {
            return false
        }
    }
}
