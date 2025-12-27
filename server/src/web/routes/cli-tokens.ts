import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const generateTokenSchema = z.object({
    name: z.string().optional()
})

export function createCliTokenRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/cli-tokens', async (c) => {
        const userId = c.get('userId')
        if (!userId) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const json = await c.req.json().catch(() => null)
        const parsed = generateTokenSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const result = store.generateCliToken(userId, parsed.data.name)
            return c.json({
                id: result.id,
                token: result.token,
                name: result.name,
                created_at: result.created_at
            })
        } catch (error) {
            return c.json({ error: 'Failed to generate token' }, 500)
        }
    })

    app.get('/cli-tokens', async (c) => {
        const userId = c.get('userId')
        if (!userId) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        try {
            const tokens = store.getCliTokens(userId)
            return c.json({ tokens })
        } catch (error) {
            return c.json({ error: 'Failed to fetch tokens' }, 500)
        }
    })

    app.delete('/cli-tokens/:id', async (c) => {
        const userId = c.get('userId')
        if (!userId) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const tokenId = c.req.param('id')
        if (!tokenId) {
            return c.json({ error: 'Missing token ID' }, 400)
        }

        try {
            const revoked = store.revokeCliToken(tokenId, userId)
            if (!revoked) {
                return c.json({ error: 'Token not found or not owned by user' }, 404)
            }
            return c.body(null, 204)
        } catch (error) {
            return c.json({ error: 'Failed to revoke token' }, 500)
        }
    })

    return app
}
