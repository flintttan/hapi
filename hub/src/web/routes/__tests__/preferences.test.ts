import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { Store } from '../../../store'
import type { WebAppEnv } from '../../middleware/auth'
import { createPreferencesRoutes } from '../preferences'

describe('Preferences routes', () => {
    function createApp(store: Store, namespace: string = 'user-1') {
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('userId', namespace)
            c.set('namespace', namespace)
            await next()
        })
        app.route('/', createPreferencesRoutes(store))
        return app
    }

    test('returns default cleanup preferences', async () => {
        const store = new Store(':memory:')
        const res = await createApp(store).request('/preferences/cleanup')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            autoCleanupEnabled: true,
            sessionRetentionDays: null,
            defaultSessionRetentionDays: 30,
            effectiveSessionRetentionDays: 30,
        })
    })

    test('updates cleanup preferences for current namespace', async () => {
        const store = new Store(':memory:')
        const res = await createApp(store).request('/preferences/cleanup', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ autoCleanupEnabled: false, sessionRetentionDays: 14 })
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            autoCleanupEnabled: false,
            sessionRetentionDays: 14,
            defaultSessionRetentionDays: 30,
            effectiveSessionRetentionDays: 14,
        })
    })

    test('stores cleanup preferences per namespace', async () => {
        const store = new Store(':memory:')

        await createApp(store, 'user-2').request('/preferences/cleanup', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ autoCleanupEnabled: false, sessionRetentionDays: 21 })
        })

        const user1 = store.userPreferences.getUserPreferences('user-1')
        const user2 = store.userPreferences.getUserPreferences('user-2')

        expect(user1.autoCleanupEnabled).toBe(true)
        expect(user1.sessionRetentionDays).toBe(null)
        expect(user2.autoCleanupEnabled).toBe(false)
        expect(user2.sessionRetentionDays).toBe(21)
    })
})
