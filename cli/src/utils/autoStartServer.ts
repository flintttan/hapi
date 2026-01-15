/**
 * Auto-start server module
 *
 * Automatically starts the HAPI server when CLI is launched
 * if specific conditions are met:
 * 1. HAPI_SERVER_URL is not set (using default localhost:3006)
 * 2. cliApiToken exists in settings.json (server was previously started)
 * 3. Port 3006 is not currently listening
 */

import chalk from 'chalk'
import { createConnection } from 'node:net'
import { configuration } from '@/configuration'
import { readSettings } from '@/persistence'
import { spawnHappyCLI } from '@/utils/spawnHappyCLI'
import { logger } from '@/ui/logger'

const DEFAULT_SERVER_PORT = 3006
const SERVER_STARTUP_TIMEOUT_MS = 10000
const POLL_INTERVAL_MS = 200
const PORT_CHECK_TIMEOUT_MS = 1000

/**
 * Check if a port is currently listening (cross-platform)
 */
async function checkPortListening(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host })

        const cleanup = () => {
            socket.removeAllListeners()
            socket.destroy()
        }

        socket.setTimeout(PORT_CHECK_TIMEOUT_MS)

        socket.on('connect', () => {
            cleanup()
            resolve(true)
        })

        socket.on('error', () => {
            cleanup()
            resolve(false)
        })

        socket.on('timeout', () => {
            cleanup()
            resolve(false)
        })
    })
}

/**
 * Check if server is ready via health endpoint
 */
async function checkServerHealth(url: string): Promise<boolean> {
    try {
        const response = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(1000)
        })
        return response.ok
    } catch {
        return false
    }
}

/**
 * Wait for server to become ready
 */
async function waitForServerReady(
    url: string,
    maxWaitMs: number = SERVER_STARTUP_TIMEOUT_MS,
    pollIntervalMs: number = POLL_INTERVAL_MS
): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
        if (await checkServerHealth(url)) {
            logger.debug(`[AUTO-START] Server ready after ${Date.now() - startTime}ms`)
            return true
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    return false
}

/**
 * Determine if server should be auto-started
 */
async function shouldAutoStartServer(): Promise<boolean> {
    // Condition 1: HAPI_SERVER_URL not set (using default localhost:3006)
    if (process.env.HAPI_SERVER_URL) {
        logger.debug('[AUTO-START] HAPI_SERVER_URL is set, skipping auto-start')
        return false
    }

    // Condition 2: Check settings.json
    const settings = await readSettings()

    // 2a: serverUrl is set in settings.json (user configured a specific server)
    if (settings.serverUrl) {
        logger.debug('[AUTO-START] serverUrl is set in settings.json, skipping auto-start')
        return false
    }

    // 2b: cliApiToken exists in settings.json (server was previously started)
    if (!settings.cliApiToken) {
        logger.debug('[AUTO-START] No cliApiToken in settings, skipping auto-start')
        return false
    }

    // Condition 3: Port 3006 is not currently listening
    const isListening = await checkPortListening(DEFAULT_SERVER_PORT)
    if (isListening) {
        logger.debug('[AUTO-START] Port 3006 already in use, skipping auto-start')
        return false
    }

    return true
}

/**
 * Start server as a child process (will exit when CLI exits)
 */
function startServerAsChild(): void {
    const serverProcess = spawnHappyCLI(['server'], {
        detached: false,
        stdio: 'ignore',
        env: process.env
    })

    logger.debug(`[AUTO-START] Server process spawned with PID ${serverProcess.pid}`)

    // Ensure server is killed when CLI exits
    process.on('exit', () => {
        serverProcess.kill()
    })
}

/**
 * Main entry point: auto-start server if conditions are met
 */
export async function maybeAutoStartServer(): Promise<void> {
    try {
        const shouldStart = await shouldAutoStartServer()
        if (!shouldStart) {
            return
        }

        logger.debug('[AUTO-START] Starting server automatically...')
        console.log(chalk.gray('Starting HAPI server in background...'))

        startServerAsChild()

        const isReady = await waitForServerReady(configuration.serverUrl)

        if (!isReady) {
            console.log(chalk.yellow('Warning: Server did not start within expected time'))
            console.log(chalk.gray('  Try running `hapi server` manually to see errors'))
            return
        }

        console.log(chalk.green('HAPI server started'))
    } catch (error) {
        logger.debug('[AUTO-START] Error during server auto-start', error)
        console.log(chalk.yellow('Warning: Failed to auto-start server'))
        if (error instanceof Error) {
            console.log(chalk.gray(`  Error: ${error.message}`))
        }
    }
}
