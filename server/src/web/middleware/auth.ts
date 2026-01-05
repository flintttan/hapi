import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import type { Store } from '../../store'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'

export type WebAppEnv = {
    Variables: {
        userId: string
        namespace: string
    }
}

const jwtPayloadSchema = z.object({
    uid: z.union([z.string(), z.number()]),
    ns: z.string().optional()
})

export function createAuthMiddleware(jwtSecret: Uint8Array, store: Store): MiddlewareHandler<WebAppEnv> {
    return async (c, next) => {
        const path = c.req.path
        if (path === '/api/auth' || path === '/api/bind' || path === '/api/register' || path.startsWith('/api/cli/')) {
            await next()
            return
        }

        const authorization = c.req.header('authorization')
        const tokenFromHeader = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined
        const tokenFromQuery = path === '/api/events' ? c.req.query().token : undefined
        const token = tokenFromHeader ?? tokenFromQuery

        if (!token) {
            return c.json({ error: 'Missing authorization token' }, 401)
        }

        try {
            const perUserTokenResult = store.validateCliToken(token)
            if (perUserTokenResult) {
                c.set('userId', perUserTokenResult.userId)
                c.set('namespace', perUserTokenResult.userId)
                await next()
                return
            }

            let cliApiToken: string | null = null
            try {
                cliApiToken = configuration.cliApiToken
            } catch {
                cliApiToken = typeof process.env.CLI_API_TOKEN === 'string' ? process.env.CLI_API_TOKEN : null
            }

            if (constantTimeEquals(token, cliApiToken)) {
                const defaultCliUserId = store.getDefaultCliUserId()
                const cliUser = store.getUserById(defaultCliUserId)
                if (cliUser) {
                    c.set('userId', cliUser.id)
                    c.set('namespace', cliUser.id)
                    await next()
                    return
                }
            }

            const verified = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] })
            const parsed = jwtPayloadSchema.safeParse(verified.payload)
            if (!parsed.success) {
                return c.json({ error: 'Invalid token payload' }, 401)
            }

            const tokenUserId = String(parsed.data.uid)
            const namespace = parsed.data.ns ?? tokenUserId
            const userId = store.getUserById(namespace)
                ? namespace
                : store.getUserById(tokenUserId)
                    ? tokenUserId
                    : store.getDefaultCliUserId()

            c.set('userId', userId)
            c.set('namespace', namespace)
            await next()
            return
        } catch {
            return c.json({ error: 'Invalid token' }, 401)
        }
    }
}
