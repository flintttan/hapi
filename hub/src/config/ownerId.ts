import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { configuration } from '../configuration'
import { getOrCreateJsonFile } from './generators'

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

export async function getOrCreateOwnerId(): Promise<number> {
    if (cachedOwnerId !== null) {
        return cachedOwnerId
    }

    const ownerIdFile = join(configuration.dataDir, 'owner-id.json')

    const result = await getOrCreateJsonFile({
        filePath: ownerIdFile,
        readValue: (raw) => {
            const parsed = ownerIdFileSchema.parse(JSON.parse(raw))
            if (!Number.isSafeInteger(parsed.ownerId) || parsed.ownerId <= 0) {
                throw new Error(`Invalid ownerId in ${ownerIdFile}`)
            }
            return parsed.ownerId
        },
        writeValue: (ownerId) => JSON.stringify({ ownerId }, null, 4),
        generate: generateOwnerId,
        fileMode: 0o600,
        dirMode: 0o700
    })

    cachedOwnerId = result.value
    return result.value
}
