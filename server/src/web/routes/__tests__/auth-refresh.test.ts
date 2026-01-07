import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { Store } from '../../../store'
import { getTestJwtSecret } from '../../../__tests__/helpers/testAuth'
import { createAuthMiddleware, type WebAppEnv } from '../../middleware/auth'
import { createAuthRoutes } from '../auth'
import { createCliTokenRoutes } from '../cli-tokens'

describe('Auth refresh token', () => {
    test('POST /api/auth with refreshToken returns access token', async () => {
        const store = new Store(':memory:')
        store.createUser({ id: 'user-1', telegram_id: null, username: 'user1', password_hash: null })

        const jwtSecret = getTestJwtSecret()
        const refreshToken = await new SignJWT({
            uid: 'user-1',
            ns: 'user-1',
            tokenType: 'refresh',
            username: 'user1',
            firstName: 'user1'
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(jwtSecret)

        const app = new Hono<WebAppEnv>()
        app.route('/api', createAuthRoutes(jwtSecret, store))
        app.use('/api/*', createAuthMiddleware(jwtSecret, store))
        app.route('/api', createCliTokenRoutes(store))

        const res = await app.request('/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        })

        expect(res.status).toBe(200)
        const body = await res.json() as any
        expect(typeof body.token).toBe('string')
        expect(body.refreshToken).toBe(refreshToken)
        expect(body.user?.id).toBe('user-1')

        const protectedRes = await app.request('/api/cli-tokens', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${body.token}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ name: 'test' })
        })
        expect(protectedRes.status).toBe(200)
    })

    test('refresh token cannot be used as access token', async () => {
        const store = new Store(':memory:')
        store.createUser({ id: 'user-1', telegram_id: null, username: 'user1', password_hash: null })

        const jwtSecret = getTestJwtSecret()
        const refreshToken = await new SignJWT({
            uid: 'user-1',
            ns: 'user-1',
            tokenType: 'refresh'
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(jwtSecret)

        const app = new Hono<WebAppEnv>()
        app.use('/api/*', createAuthMiddleware(jwtSecret, store))
        app.route('/api', createCliTokenRoutes(store))

        const res = await app.request('/api/cli-tokens', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${refreshToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ name: 'test' })
        })

        expect(res.status).toBe(401)
        const body = await res.json() as any
        expect(body.error).toBe('Invalid token')
    })
})

