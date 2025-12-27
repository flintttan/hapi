import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { customAlphabet } from 'nanoid'
import type { WebAppEnv } from '../middleware/auth'
import type { Store } from '../../store'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21)

const registerSchema = z.object({
    username: z.string().min(3).max(50),
    email: z.string().email().optional(),
    password: z.string().min(6)
})

export function createRegisterRoutes(jwtSecret: Uint8Array, store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/register', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = registerSchema.safeParse(json)

        if (!parsed.success) {
            return c.json({ error: 'Invalid registration data', details: parsed.error.format() }, 400)
        }

        const { username, email, password } = parsed.data

        // Check if username already exists
        const existingUser = store.getUserByUsername(username)
        if (existingUser) {
            return c.json({ error: 'Username already exists' }, 409)
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = store.getUserByEmail(email)
            if (existingEmail) {
                return c.json({ error: 'Email already exists' }, 409)
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10)

        // Create user
        const userId = nanoid()
        const user = store.createUser({
            id: userId,
            telegram_id: null,
            username,
            email: email || null,
            password_hash: passwordHash
        })

        // Generate JWT token
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
                firstName: user.username
            }
        }, 201)
    })

    return app
}
