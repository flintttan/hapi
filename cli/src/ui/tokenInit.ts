/**
 * Token initialization module
 *
 * Handles CLI_API_TOKEN initialization with priority:
 * 1. Environment variable (highest - allows temporary override)
 * 2. Settings file (~/.hapi/settings.json)
 * 3. Interactive prompt (only when both above are missing)
 */

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chalk from 'chalk'
import { configuration } from '@/configuration'
import { readSettings, updateSettings } from '@/persistence'

/**
 * Initialize CLI API token
 * Must be called before any API operations
 */
export async function initializeToken(): Promise<void> {
    // 1. Environment variable has highest priority (allows temporary override)
    if (configuration.cliApiToken) {
        return
    }

    // 2. Read from settings file
    const settings = await readSettings()
    if (settings.cliApiToken) {
        configuration._setCliApiToken(settings.cliApiToken)
        return
    }

    // 3. Non-TTY environment cannot prompt, fail with clear error
    if (!process.stdin.isTTY) {
        throw new Error('CLI_API_TOKEN is required. Set it via environment variable or run `hapi auth login`.')
    }

    // 4. Interactive prompt
    const token = await promptForToken()

    // 5. Save and update configuration
    await updateSettings(current => ({
        ...current,
        cliApiToken: token
    }))
    configuration._setCliApiToken(token)
}

async function promptForToken(): Promise<string> {
    const rl = readline.createInterface({ input, output })

    console.log(chalk.bold.cyan('\n🚀 Welcome to HAPI CLI!\n'))
    console.log(chalk.yellow('No CLI_API_TOKEN found. Let\'s get you set up.\n'))

    console.log(chalk.bold('Quick Setup:'))
    console.log(chalk.cyan('  Run: hapi auth setup'))
    console.log(chalk.gray('  This will guide you through the complete setup process.\n'))

    console.log(chalk.bold('Or enter your token now:'))
    console.log(chalk.gray('How to get your token:'))
    console.log(chalk.gray('  1. Open your HAPI server URL in a browser'))
    console.log(chalk.gray('  2. Register or login to your account'))
    console.log(chalk.gray('  3. Click your avatar and select "Manage CLI Tokens"'))
    console.log(chalk.gray('  4. Generate a new token and copy it\n'))

    try {
        const token = await rl.question(chalk.cyan('Enter CLI_API_TOKEN (or press Ctrl+C to exit and run "hapi auth setup"): '))
        if (!token.trim()) {
            throw new Error('Token cannot be empty')
        }
        console.log(chalk.green(`\n✅ Token saved to ${configuration.settingsFile}`))
        console.log(chalk.gray(`\nNext steps:`))
        console.log(chalk.gray(`  • Your machine will be registered automatically`))
        console.log(chalk.gray(`  • You can now run: hapi`))
        console.log(chalk.gray(`  • Manage tokens in the web interface\n`))
        return token.trim()
    } finally {
        rl.close()
    }
}
