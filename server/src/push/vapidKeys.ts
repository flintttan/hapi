import { join } from 'node:path'
import { generateVAPIDKeys } from 'web-push'
import { readSettings, writeSettings } from '../web/cliApiToken'

export type VapidKeys = {
    publicKey: string
    privateKey: string
}

export async function getOrCreateVapidKeys(dataDir: string): Promise<VapidKeys> {
    const settingsFile = join(dataDir, 'settings.json')
    const settings = await readSettings(settingsFile)

    if (settings === null) {
        throw new Error(`Cannot read ${settingsFile}. Please fix or remove the file and restart.`)
    }

    if (settings.vapidKeys?.publicKey && settings.vapidKeys?.privateKey) {
        return settings.vapidKeys
    }

    const generated = generateVAPIDKeys()
    const keys: VapidKeys = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey
    }

    settings.vapidKeys = keys
    await writeSettings(settingsFile, settings)

    return keys
}
