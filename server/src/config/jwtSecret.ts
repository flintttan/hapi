import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { configuration } from '../configuration'
import { getOrCreateJsonFile } from './generators'

const jwtSecretFileSchema = z.object({
    secretBase64: z.string()
})

export async function getOrCreateJwtSecret(): Promise<Uint8Array> {
    const secretFile = join(configuration.dataDir, 'jwt-secret.json')

    const result = await getOrCreateJsonFile({
        filePath: secretFile,
        readValue: (raw) => {
            const parsed = jwtSecretFileSchema.parse(JSON.parse(raw))
            const bytes = new Uint8Array(Buffer.from(parsed.secretBase64, 'base64'))
            if (bytes.length !== 32) {
                throw new Error(`Invalid JWT secret length in ${secretFile}`)
            }
            return bytes
        },
        writeValue: (secretBytes) => {
            const payload = {
                secretBase64: Buffer.from(secretBytes).toString('base64')
            }
            return JSON.stringify(payload, null, 4)
        },
        generate: () => new Uint8Array(randomBytes(32)),
        fileMode: 0o600,
        dirMode: 0o700
    })

    return result.value
}
