import { Hono } from 'hono'
import { jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import { validateTelegramInitData } from '../telegramInitData'
import { getOrCreateOwnerId } from '../../config/ownerId'
import type { WebAppEnv } from '../middleware/auth'
import type { Store } from '../../store'

const telegramAuthSchema = z.object({
    initData: z.string()
})

const accessTokenAuthSchema = z.object({
    accessToken: z.string()
})

const usernamePasswordAuthSchema = z.object({
    username: z.string(),
    password: z.string()
})

const refreshTokenAuthSchema = z.object({
    refreshToken: z.string()
})

const authBodySchema = z.union([
    telegramAuthSchema,
    accessTokenAuthSchema,
    usernamePasswordAuthSchema,
    refreshTokenAuthSchema
])

const refreshTokenPayloadSchema = z.object({
    uid: z.union([z.string(), z.number()]),
    ns: z.string().optional(),
    tokenType: z.literal('refresh'),
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional()
})

export function createAuthRoutes(jwtSecret: Uint8Array, store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/auth', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = authBodySchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        let userId: number | string
        let username: string | undefined
        let firstName: string | undefined
        let lastName: string | undefined
        let namespace: string | undefined

        if ('refreshToken' in parsed.data) {
            try {
                const verified = await jwtVerify(parsed.data.refreshToken, jwtSecret, { algorithms: ['HS256'] })
                const tokenPayload = refreshTokenPayloadSchema.safeParse(verified.payload)
                if (!tokenPayload.success) {
                    return c.json({ error: 'Invalid refresh token' }, 401)
                }

                userId = tokenPayload.data.uid
                namespace = tokenPayload.data.ns
                username = tokenPayload.data.username
                firstName = tokenPayload.data.firstName
                lastName = tokenPayload.data.lastName

                const tokenUserId = String(userId)
                const resolvedNamespace = namespace ?? tokenUserId
                const storedUser = store.getUserById(resolvedNamespace) ?? store.getUserById(tokenUserId)
                if (storedUser) {
                    username ??= storedUser.username
                    firstName ??= storedUser.username
                } else if (!firstName && !username) {
                    firstName = 'Web User'
                }

                const token = await new SignJWT({ uid: userId, ns: resolvedNamespace, tokenType: 'access' })
                    .setProtectedHeader({ alg: 'HS256' })
                    .setIssuedAt()
                    .setExpirationTime('15m')
                    .sign(jwtSecret)

                return c.json({
                    token,
                    refreshToken: parsed.data.refreshToken,
                    user: {
                        id: userId,
                        username,
                        firstName,
                        lastName
                    }
                })
            } catch {
                return c.json({ error: 'Invalid refresh token' }, 401)
            }
        }

        if ('accessToken' in parsed.data) {
            const parsedToken = parseAccessToken(parsed.data.accessToken)
            if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
                return c.json({ error: 'Invalid access token' }, 401)
            }
            userId = await getOrCreateOwnerId()
            firstName = 'Web User'
            namespace = parsedToken.namespace
        } else if ('username' in parsed.data && 'password' in parsed.data) {
            const user = store.getUserByUsername(parsed.data.username)
            if (!user || !user.password_hash) {
                return c.json({ error: 'Invalid username or password' }, 401)
            }

            const isValid = await bcrypt.compare(parsed.data.password, user.password_hash)
            if (!isValid) {
                return c.json({ error: 'Invalid username or password' }, 401)
            }

            userId = await getOrCreateOwnerId()
            username = user.username
            firstName = user.username
            namespace = user.id
        } else if ('initData' in parsed.data) {
            if (!configuration.telegramEnabled || !configuration.telegramBotToken) {
                return c.json({ error: 'Telegram authentication is disabled. Configure TELEGRAM_BOT_TOKEN.' }, 503)
            }

            const result = validateTelegramInitData(parsed.data.initData, configuration.telegramBotToken)
            if (!result.ok) {
                return c.json({ error: result.error }, 401)
            }

            const telegramUserId = String(result.user.id)
            const storedUser = store.users.getUser('telegram', telegramUserId)
            if (!storedUser) {
                return c.json({ error: 'not_bound' }, 401)
            }

            userId = await getOrCreateOwnerId()
            username = result.user.username
            firstName = result.user.first_name
            lastName = result.user.last_name
            namespace = storedUser.namespace
        } else {
            return c.json({ error: 'Invalid authentication method' }, 400)
        }

        const resolvedNamespace = namespace ?? String(userId)

        const token = await new SignJWT({ uid: userId, ns: resolvedNamespace, tokenType: 'access' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
            .sign(jwtSecret)

        const refreshToken = await new SignJWT({
            uid: userId,
            ns: resolvedNamespace,
            tokenType: 'refresh',
            username,
            firstName,
            lastName
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(jwtSecret)

        return c.json({
            token,
            refreshToken,
            user: {
                id: userId,
                username,
                firstName,
                lastName
            }
        })
    })

    return app
}
