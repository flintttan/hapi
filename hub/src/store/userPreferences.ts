import type { Database } from 'bun:sqlite'

import type { StoredUserPreferences } from './types'

type DbUserPreferencesRow = {
    namespace: string
    auto_cleanup_enabled: number
    session_retention_days: number | null
    updated_at: number
}

export const DEFAULT_SESSION_RETENTION_DAYS = 30

function toStoredUserPreferences(row: DbUserPreferencesRow): StoredUserPreferences {
    return {
        namespace: row.namespace,
        autoCleanupEnabled: row.auto_cleanup_enabled === 1,
        sessionRetentionDays: row.session_retention_days,
        updatedAt: row.updated_at
    }
}

export function getUserPreferences(db: Database, namespace: string): StoredUserPreferences {
    const row = db.prepare(
        'SELECT * FROM user_preferences WHERE namespace = ?'
    ).get(namespace) as DbUserPreferencesRow | undefined

    if (row) {
        return toStoredUserPreferences(row)
    }

    return {
        namespace,
        autoCleanupEnabled: true,
        sessionRetentionDays: null,
        updatedAt: 0
    }
}

export function setUserCleanupPreferences(
    db: Database,
    namespace: string,
    preferences: {
        autoCleanupEnabled: boolean
        sessionRetentionDays: number | null
    }
): StoredUserPreferences {
    const now = Date.now()
    db.prepare(`
        INSERT INTO user_preferences (
            namespace,
            auto_cleanup_enabled,
            session_retention_days,
            updated_at
        ) VALUES (
            @namespace,
            @auto_cleanup_enabled,
            @session_retention_days,
            @updated_at
        )
        ON CONFLICT(namespace) DO UPDATE SET
            auto_cleanup_enabled = excluded.auto_cleanup_enabled,
            session_retention_days = excluded.session_retention_days,
            updated_at = excluded.updated_at
    `).run({
        namespace,
        auto_cleanup_enabled: preferences.autoCleanupEnabled ? 1 : 0,
        session_retention_days: preferences.sessionRetentionDays,
        updated_at: now
    })

    return getUserPreferences(db, namespace)
}

export function listUserCleanupPreferences(db: Database): StoredUserPreferences[] {
    const rows = db.prepare(
        'SELECT * FROM user_preferences ORDER BY namespace ASC'
    ).all() as DbUserPreferencesRow[]
    return rows.map(toStoredUserPreferences)
}
