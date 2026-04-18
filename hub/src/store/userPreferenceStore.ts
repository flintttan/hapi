import type { Database } from 'bun:sqlite'

import type { StoredUserPreferences } from './types'
import {
    getUserPreferences,
    listUserCleanupPreferences,
    setUserCleanupPreferences
} from './userPreferences'

export class UserPreferenceStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getUserPreferences(namespace: string): StoredUserPreferences {
        return getUserPreferences(this.db, namespace)
    }

    setUserCleanupPreferences(
        namespace: string,
        preferences: {
            autoCleanupEnabled: boolean
            sessionRetentionDays: number | null
        }
    ): StoredUserPreferences {
        return setUserCleanupPreferences(this.db, namespace, preferences)
    }

    listUserCleanupPreferences(): StoredUserPreferences[] {
        return listUserCleanupPreferences(this.db)
    }
}
