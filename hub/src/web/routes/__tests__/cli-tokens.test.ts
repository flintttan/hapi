import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { Store } from '../../../store'
import { getTestJwtSecret } from '../../../__tests__/helpers/testAuth'
import { createAuthMiddleware, type WebAppEnv } from '../../middleware/auth'
import { createCliTokenRoutes } from '../cli-tokens'

async function signJwt(payload: Record<string, unknown>): Promise<string> {
    const jwtSecret = getTestJwtSecret()
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(jwtSecret)
}

describe('CLI token routes', () => {
    test('POST /api/cli-tokens requires auth', async () => {
        const store = new Store(':memory:')
        const app = new Hono<WebAppEnv>()
        app.use('/api/*', createAuthMiddleware(getTestJwtSecret(), store))
        app.route('/api', createCliTokenRoutes(store))

        const res = await app.request('/api/cli-tokens', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'test' })
        })

        expect(res.status).toBe(401)
        const body = await res.json() as any
        expect(body.error).toBe('Missing authorization token')
    })

    test('POST /api/cli-tokens accepts JWT with uid=userId', async () => {
        const store = new Store(':memory:')
        store.createUser({ id: 'user-1', telegram_id: null, username: 'user1', password_hash: null })

        const app = new Hono<WebAppEnv>()
        app.use('/api/*', createAuthMiddleware(getTestJwtSecret(), store))
        app.route('/api', createCliTokenRoutes(store))

        const jwt = await signJwt({ uid: 'user-1' })
        const res = await app.request('/api/cli-tokens', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${jwt}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ name: 'CLI test' })
        })

        expect(res.status).toBe(200)
        const body = await res.json() as any
        expect(typeof body.token).toBe('string')
        expect(body.token.length).toBeGreaterThan(20)
    })

    test('POST /api/cli-tokens accepts legacy JWT with uid=ownerId and ns=userId', async () => {
        const store = new Store(':memory:')
        store.createUser({ id: 'user-1', telegram_id: null, username: 'user1', password_hash: null })

        const app = new Hono<WebAppEnv>()
        app.use('/api/*', createAuthMiddleware(getTestJwtSecret(), store))
        app.route('/api', createCliTokenRoutes(store))

        const jwt = await signJwt({ uid: 123, ns: 'user-1' })
        const res = await app.request('/api/cli-tokens', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${jwt}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ name: 'legacy token' })
        })

        expect(res.status).toBe(200)
        const body = await res.json() as any
        expect(typeof body.token).toBe('string')
        expect(body.token.length).toBeGreaterThan(20)
    })
})

