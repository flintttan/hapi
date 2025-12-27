import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { configuration } from '../../configuration'
import { safeCompareStrings } from '../../utils/crypto'
import { validateTelegramInitData } from '../telegramInitData'
import { getOrCreateOwnerId } from '../ownerId'
import type { WebAppEnv } from '../middleware/auth'
import type { Store, User } from '../../store'
import { customAlphabet } from 'nanoid'

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

function getOrCreateUser(store: Store, telegramId: string, username?: string): User {
    const existing = store.getUserByTelegramId(telegramId)
    if (existing) {
        return existing
    }

    const finalUsername = username || `User-${telegramId}`
    const user = store.createUser({
        id: nanoid(),
        telegram_id: telegramId,
        username: finalUsername
    })

    return user
}

let cliUserCache: User | null = null

function getUserByCliToken(store: Store): User {
    if (cliUserCache) {
        return cliUserCache
    }

    const existing = store.getUserById('cli-user')
    if (existing) {
        cliUserCache = existing
        return existing
    }

    const user = store.createUser({
        id: 'cli-user',
        telegram_id: null,
        username: 'CLI User'
    })

    cliUserCache = user
    return user
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
        let firstName: string | undefined
        let lastName: string | undefined

        // Username/Password authentication
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
            firstName = dbUser.username
        }
        // Access Token authentication (CLI_API_TOKEN)
        else if ('accessToken' in parsed.data) {
            if (!safeCompareStrings(parsed.data.accessToken, configuration.cliApiToken)) {
                return c.json({ error: 'Invalid access token' }, 401)
            }
            user = getUserByCliToken(store)
            firstName = 'CLI User'
        }
        // Telegram initData authentication
        else {
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

            const telegramUserId = result.user.id
            if (!configuration.isChatIdAllowed(telegramUserId)) {
                return c.json({ error: 'User not allowed' }, 403)
            }

            user = getOrCreateUser(store, String(telegramUserId), result.user.username)
            firstName = result.user.first_name
            lastName = result.user.last_name
        }

        const token = await new SignJWT({ uid: user.id })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
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
