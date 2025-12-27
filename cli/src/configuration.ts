/**
 * Global configuration for HAPI CLI
 *
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json'
import { getCliArgs } from '@/utils/cliArgs'

class Configuration {
    public readonly serverUrl: string
    private _cliApiToken: string
    public readonly isDaemonProcess: boolean

    // Directories and paths (from persistence)
    public readonly happyHomeDir: string
    public readonly logsDir: string
    public readonly settingsFile: string
    public readonly privateKeyFile: string
    public readonly daemonStateFile: string
    public readonly daemonLockFile: string
    public readonly currentCliVersion: string

    public readonly isExperimentalEnabled: boolean

    constructor() {
        // Directory configuration - Priority: HAPI_HOME env > default home dir
        if (process.env.HAPI_HOME) {
            // Expand ~ to home directory if present
            const expandedPath = process.env.HAPI_HOME.replace(/^~/, homedir())
            this.happyHomeDir = expandedPath
        } else {
            this.happyHomeDir = join(homedir(), '.hapi')
        }

        this.logsDir = join(this.happyHomeDir, 'logs')
        this.settingsFile = join(this.happyHomeDir, 'settings.json')
        this.privateKeyFile = join(this.happyHomeDir, 'access.key')
        this.daemonStateFile = join(this.happyHomeDir, 'daemon.state.json')
        this.daemonLockFile = join(this.happyHomeDir, 'daemon.state.json.lock')

        // Ensure directories exist
        if (!existsSync(this.happyHomeDir)) {
            mkdirSync(this.happyHomeDir, { recursive: true })
        }
        if (!existsSync(this.logsDir)) {
            mkdirSync(this.logsDir, { recursive: true })
        }

        // Read settings file for serverUrl and token (only if not in env)
        let settingsServerUrl: string | undefined
        let settingsCLIToken: string | undefined
        try {
            if (existsSync(this.settingsFile)) {
                const settings = JSON.parse(readFileSync(this.settingsFile, 'utf8'))
                settingsServerUrl = settings.serverUrl
                settingsCLIToken = settings.cliApiToken
            }
        } catch {
            // Ignore parse errors
        }

        // Server configuration - Priority: env > settings.json > default
        this.serverUrl = process.env.HAPI_SERVER_URL || settingsServerUrl || 'http://localhost:3006'
        this._cliApiToken = process.env.CLI_API_TOKEN || settingsCLIToken || ''

        // Check if we're running as daemon based on process args
        const args = getCliArgs()
        this.isDaemonProcess = args.length >= 2 && args[0] === 'daemon' && (args[1] === 'start-sync')

        this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.HAPI_EXPERIMENTAL?.toLowerCase() || '')

        this.currentCliVersion = packageJson.version
    }

    get cliApiToken(): string {
        return this._cliApiToken
    }

    _setCliApiToken(token: string): void {
        this._cliApiToken = token
    }
}

export const configuration: Configuration = new Configuration()
