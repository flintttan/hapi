import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import { DEFAULT_SESSION_RETENTION_DAYS } from '../../store/userPreferences'
import type { WebAppEnv } from '../middleware/auth'

const cleanupPreferencesSchema = z.object({
    autoCleanupEnabled: z.boolean(),
    sessionRetentionDays: z.number().int().min(1).max(365).nullable().optional()
})

function toCleanupSettings(preferences: {
    autoCleanupEnabled: boolean
    sessionRetentionDays: number | null
}) {
    return {
        autoCleanupEnabled: preferences.autoCleanupEnabled,
        sessionRetentionDays: preferences.sessionRetentionDays,
        defaultSessionRetentionDays: DEFAULT_SESSION_RETENTION_DAYS,
        effectiveSessionRetentionDays: preferences.sessionRetentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
    }
}

export function createPreferencesRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/preferences/cleanup', (c) => {
        const namespace = c.get('namespace')
        const preferences = store.userPreferences.getUserPreferences(namespace)
        return c.json(toCleanupSettings(preferences))
    })

    app.put('/preferences/cleanup', async (c) => {
        const namespace = c.get('namespace')
        const body = await c.req.json().catch(() => null)
        const parsed = cleanupPreferencesSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const preferences = store.userPreferences.setUserCleanupPreferences(namespace, {
            autoCleanupEnabled: parsed.data.autoCleanupEnabled,
            sessionRetentionDays: parsed.data.sessionRetentionDays ?? null
        })
        return c.json(toCleanupSettings(preferences))
    })

    return app
}
