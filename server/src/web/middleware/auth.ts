import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import type { Store } from '../../store'
import { configuration } from '../../configuration'
import { safeCompareStrings } from '../../utils/crypto'

export type WebAppEnv = {
    Variables: {
        userId: string
    }
}

const jwtPayloadSchema = z.object({
    uid: z.string()
})

export function createAuthMiddleware(jwtSecret: Uint8Array, store: Store): MiddlewareHandler<WebAppEnv> {
    return async (c, next) => {
        const path = c.req.path
        if (path === '/api/auth') {
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
                await next()
                return
            }

            if (safeCompareStrings(token, configuration.cliApiToken)) {
                const cliUser = store.getUserById('cli-user')
                if (cliUser) {
                    c.set('userId', cliUser.id)
                    await next()
                    return
                }
            }

            const verified = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] })
            const parsed = jwtPayloadSchema.safeParse(verified.payload)
            if (!parsed.success) {
                return c.json({ error: 'Invalid token payload' }, 401)
            }

            c.set('userId', parsed.data.uid)
            await next()
            return
        } catch {
            return c.json({ error: 'Invalid token' }, 401)
        }
    }
}
