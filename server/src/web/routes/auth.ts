import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { customAlphabet } from 'nanoid'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import { validateTelegramInitData } from '../telegramInitData'
import type { WebAppEnv } from '../middleware/auth'
import type { Store, User } from '../../store'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21)

const telegramAuthSchema = z.object({
    initData: z.string()
})

const accessTokenAuthSchema = z.object({
    accessToken: z.string()
})

const passwordAuthSchema = z.object({
    username: z.string(),
    password: z.string()
})

const authBodySchema = z.union([telegramAuthSchema, accessTokenAuthSchema, passwordAuthSchema])

function getOrCreateUserByTelegramId(store: Store, telegramId: string, username?: string): User {
    const existing = store.getUserByTelegramId(telegramId)
    if (existing) {
        return existing
    }

    return store.createUser({
        id: nanoid(),
        telegram_id: telegramId,
        username: username || `User-${telegramId}`
    })
}

function getDefaultCliUser(store: Store): User {
    const defaultId = store.getDefaultCliUserId()
    const existing = store.getUserById(defaultId) ?? store.getUserById('cli-user')
    if (existing) {
        return existing
    }

    return store.createUser({
        id: 'cli-user',
        telegram_id: null,
        username: 'CLI User'
    })
}

export function createAuthRoutes(jwtSecret: Uint8Array, store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/auth', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = authBodySchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        let user: User
        let namespace: string
        let firstName: string | undefined
        let lastName: string | undefined

        if ('username' in parsed.data && 'password' in parsed.data) {
            const dbUser = store.getUserByUsername(parsed.data.username)
            if (!dbUser || !dbUser.password_hash) {
                return c.json({ error: 'Invalid username or password' }, 401)
            }

            const isValid = await bcrypt.compare(parsed.data.password, dbUser.password_hash)
            if (!isValid) {
                return c.json({ error: 'Invalid username or password' }, 401)
            }

            user = dbUser
            namespace = user.id
            firstName = user.username
        } else if ('accessToken' in parsed.data) {
            const parsedToken = parseAccessToken(parsed.data.accessToken)
            if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
                return c.json({ error: 'Invalid access token' }, 401)
            }

            user = getDefaultCliUser(store)
            namespace = parsedToken.namespace
            firstName = user.username
        } else {
            if (!configuration.telegramEnabled || !configuration.telegramBotToken) {
                return c.json({ error: 'Telegram authentication is disabled. Configure TELEGRAM_BOT_TOKEN.' }, 503)
            }

            if (configuration.allowedChatIds.length === 0) {
                return c.json({ error: 'Telegram allowlist is empty. Configure ALLOWED_CHAT_IDS and restart.' }, 403)
            }

            const result = validateTelegramInitData(parsed.data.initData, configuration.telegramBotToken)
            if (!result.ok) {
                return c.json({ error: result.error }, 401)
            }

            const telegramUserId = String(result.user.id)
            if (!configuration.isChatIdAllowed(result.user.id)) {
                return c.json({ error: 'User not allowed' }, 403)
            }

            user = getOrCreateUserByTelegramId(store, telegramUserId, result.user.username)
            firstName = result.user.first_name
            lastName = result.user.last_name

            const bound = store.getPlatformUser('telegram', telegramUserId)
            namespace = bound?.namespace ?? user.id
        }

        const token = await new SignJWT({ uid: user.id, ns: namespace })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(jwtSecret)

        return c.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                firstName,
                lastName
            }
        })
    })

    return app
}
