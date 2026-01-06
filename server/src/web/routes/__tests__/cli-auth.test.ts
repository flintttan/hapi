import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { Store } from '../../../store'
import { createCliRoutes } from '../cli'

describe('CLI routes auth', () => {
    test('rejects missing Authorization header', async () => {
        const store = new Store(':memory:')
        const app = new Hono()
        app.route('/cli', createCliRoutes(() => null, store))

        const res = await app.request('/cli/machines', { method: 'POST' })
        expect(res.status).toBe(401)
        const body = await res.json() as any
        expect(body.error).toBe('Missing Authorization header')
    })

    test('accepts Bearer token for per-user CLI token', async () => {
        const store = new Store(':memory:')
        store.createUser({ id: 'user-1', telegram_id: null, username: 'user1', password_hash: null })
        const { token } = store.generateCliToken('user-1', 'test')

        const app = new Hono()
        app.route('/cli', createCliRoutes(() => null, store))

        const res = await app.request('/cli/machines', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`
            }
        })
        expect(res.status).toBe(503)
        const body = await res.json() as any
        expect(body.error).toBe('Not ready')
    })

    test('rejects non-Bearer Authorization header', async () => {
        const store = new Store(':memory:')
        store.createUser({ id: 'user-1', telegram_id: null, username: 'user1', password_hash: null })
        const { token } = store.generateCliToken('user-1', 'test')

        const app = new Hono()
        app.route('/cli', createCliRoutes(() => null, store))

        const res = await app.request('/cli/machines', {
            method: 'POST',
            headers: {
                authorization: `Token ${token}`
            }
        })
        expect(res.status).toBe(401)
        const body = await res.json() as any
        expect(body.error).toBe('Invalid Authorization header')
    })
})

