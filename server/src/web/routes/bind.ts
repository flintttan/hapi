import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { customAlphabet } from 'nanoid'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import { validateTelegramInitData } from '../telegramInitData'
import type { WebAppEnv } from '../middleware/auth'
import type { Store, User } from '../../store'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21)

const bindBodySchema = z.object({
    initData: z.string(),
    accessToken: z.string()
})

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

export function createBindRoutes(jwtSecret: Uint8Array, store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/bind', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = bindBodySchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const parsedToken = parseAccessToken(parsed.data.accessToken)
        if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid access token' }, 401)
        }
        const namespace = parsedToken.namespace

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

        const existingUser = store.getPlatformUser('telegram', telegramUserId)
        if (existingUser && existingUser.namespace !== namespace) {
            return c.json({ error: 'already_bound' }, 409)
        }
        store.addPlatformUser('telegram', telegramUserId, namespace)

        const user = getOrCreateUserByTelegramId(store, telegramUserId, result.user.username)

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
                firstName: result.user.first_name,
                lastName: result.user.last_name
            }
        })
    })

    return app
}
