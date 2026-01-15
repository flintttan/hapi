/**
 * Server URL initialization module
 *
 * Handles HAPI_SERVER_URL initialization with priority:
 * 1. Environment variable (highest - allows temporary override)
 * 2. Settings file (~/.hapi/settings.json)
 * 3. Default value (http://localhost:3006)
 */

import { configuration } from '@/configuration'
import { readSettings } from '@/persistence'

/**
 * Initialize server URL
 * Must be called before any API operations
 */
export async function initializeServerUrl(): Promise<void> {
    // 1. Environment variable has highest priority (allows temporary override)
    if (process.env.HAPI_SERVER_URL) {
        return
    }

    // 2. Read from settings file
    const settings = await readSettings()
    if (settings.serverUrl) {
        configuration._setServerUrl(settings.serverUrl)
        return
    }

    // 3. Default value already set in configuration constructor
}
