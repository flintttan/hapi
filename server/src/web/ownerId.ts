import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { configuration } from '../configuration'

const ownerIdFileSchema = z.object({
    ownerId: z.number()
})

function generateOwnerId(): number {
    const bytes = randomBytes(6)
    let value = 0
    for (const byte of bytes) {
        value = (value << 8) + byte
    }
    return value > 0 ? value : 1
}

let cachedOwnerId: number | null = null

/**
 * @deprecated This function is deprecated and will be removed in a future version.
 *
 * The single-user ownerId system has been replaced with multi-user support.
 *
 * Migration Guide:
 * - For Telegram authentication: Use getOrCreateUser(telegramId, username) from auth.ts
 * - For CLI authentication: Use getUserByCliToken() from auth.ts
 * - For user management: Use Store.createUser(), Store.getUserById(), Store.getUserByTelegramId()
 *
 * The existing ownerId is now migrated to the 'admin-user' in the users table.
 * All new authentication flows should use the User-based system with per-user IDs.
 *
 * @see server/src/web/routes/auth.ts for new authentication functions
 * @see server/src/store/index.ts for user management methods
 */
export async function getOrCreateOwnerId(): Promise<number> {
    if (cachedOwnerId !== null) {
        return cachedOwnerId
    }

    const ownerIdFile = join(configuration.dataDir, 'owner-id.json')

    if (existsSync(ownerIdFile)) {
        await chmod(ownerIdFile, 0o600).catch(() => {})
        const raw = await readFile(ownerIdFile, 'utf8')
        const parsed = ownerIdFileSchema.parse(JSON.parse(raw))
        if (!Number.isSafeInteger(parsed.ownerId) || parsed.ownerId <= 0) {
            throw new Error(`Invalid ownerId in ${ownerIdFile}`)
        }
        cachedOwnerId = parsed.ownerId
        return parsed.ownerId
    }

    const ownerId = generateOwnerId()
    const dir = dirname(ownerIdFile)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true, mode: 0o700 })
    }

    const payload = { ownerId }
    await writeFile(ownerIdFile, JSON.stringify(payload, null, 4), { mode: 0o600 })
    await chmod(ownerIdFile, 0o600).catch(() => {})

    cachedOwnerId = ownerId
    return ownerId
}
