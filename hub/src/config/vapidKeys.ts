import { generateVAPIDKeys } from 'web-push'
import { getOrCreateSettingsValue } from './generators'
import { getSettingsFile } from './settings'

export type VapidKeys = {
    publicKey: string
    privateKey: string
}

export async function getOrCreateVapidKeys(dataDir: string): Promise<VapidKeys> {
    const settingsFile = getSettingsFile(dataDir)
    const result = await getOrCreateSettingsValue({
        settingsFile,
        readValue: (settings) => {
            if (settings.vapidKeys?.publicKey && settings.vapidKeys?.privateKey) {
                return { value: settings.vapidKeys }
            }
            return null
        },
        writeValue: (settings, value) => {
            settings.vapidKeys = value
        },
        generate: () => {
            const generated = generateVAPIDKeys()
            return {
                publicKey: generated.publicKey,
                privateKey: generated.privateKey
            }
        }
    })

    return result.value
}
