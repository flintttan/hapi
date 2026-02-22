import chalk from 'chalk'
import os from 'node:os'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import axios from 'axios'
import { configuration } from '@/configuration'
import { readSettings, clearMachineId, updateSettings } from '@/persistence'
import type { CommandDefinition } from './types'

export async function handleAuthCommand(args: string[]): Promise<void> {
    const subcommand = args[0]

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showHelp()
        return
    }

    if (subcommand === 'setup') {
        await handleSetup()
        return
    }

    if (subcommand === 'status') {
        const settings = await readSettings()
        const envToken = process.env.CLI_API_TOKEN
        const settingsToken = settings.cliApiToken
        const hasToken = Boolean(envToken || settingsToken)
        const tokenSource = envToken ? 'environment' : (settingsToken ? 'settings file' : 'none')
        console.log(chalk.bold('\nDirect Connect Status\n'))
        console.log(chalk.gray(`  HAPI_API_URL: ${configuration.apiUrl}`))
        console.log(chalk.gray(`  CLI_API_TOKEN: ${hasToken ? 'set' : 'missing'}`))
        console.log(chalk.gray(`  Token Source: ${tokenSource}`))
        console.log(chalk.gray(`  Machine ID: ${settings.machineId ?? 'not set'}`))
        console.log(chalk.gray(`  Host: ${os.hostname()}`))

        if (!hasToken) {
            console.log('')
            console.log(chalk.yellow('  Token not configured. To get your token:'))
            console.log(chalk.dim('    1. Check the server startup logs (first run shows generated token)'))
            console.log(chalk.dim('    2. Read ~/.hapi/settings.json on the server'))
            console.log(chalk.dim('    3. Ask your server administrator (if token is set via env var)'))
            console.log('')
            console.log(chalk.dim('  Then run: hapi auth login'))
        }
        return
    }

    if (subcommand === 'login') {
        // Check for --auto flag
        const hasAutoFlag = args.includes('--auto')

        if (hasAutoFlag) {
            await handleAutoLogin()
            return
        }

        if (!process.stdin.isTTY) {
            console.error(chalk.red('Cannot prompt for token in non-TTY environment.'))
            console.error(chalk.dim('Set CLI_API_TOKEN environment variable instead.'))
            process.exit(1)
        }

        const rl = readline.createInterface({ input, output })

        try {
            const token = await rl.question(chalk.cyan('Enter CLI_API_TOKEN: '))

            if (!token.trim()) {
                console.error(chalk.red('Token cannot be empty'))
                process.exit(1)
            }

            await updateSettings(current => ({
                ...current,
                cliApiToken: token.trim()
            }))
            configuration._setCliApiToken(token.trim())
            console.log(chalk.green(`\nToken saved to ${configuration.settingsFile}`))
        } finally {
            rl.close()
        }
        return
    }

    if (subcommand === 'logout') {
        await updateSettings(current => ({
            ...current,
            cliApiToken: undefined
        }))
        await clearMachineId()
        console.log(chalk.green('Cleared local credentials (token and machineId).'))
        console.log(chalk.dim('Note: If CLI_API_TOKEN is set via environment variable, it will still be used.'))
        return
    }

    console.error(chalk.red(`Unknown auth subcommand: ${subcommand}`))
    showHelp()
    process.exit(1)
}

async function handleSetup(): Promise<void> {
    if (!process.stdin.isTTY) {
        console.error(chalk.red('Cannot run setup in non-TTY environment.'))
        console.error(chalk.dim('Set HAPI_API_URL and CLI_API_TOKEN environment variables instead.'))
        process.exit(1)
    }

    console.log(chalk.bold.cyan('\n🚀 HAPI CLI Setup Wizard\n'))
    console.log(chalk.dim('This wizard will help you configure your HAPI CLI client.\n'))

    const rl = readline.createInterface({ input, output })

    try {
        // Step 1: Server URL
        console.log(chalk.bold.white('Step 1: Server Configuration'))
        console.log(chalk.dim('Enter your HAPI server URL (e.g., https://hapi.example.com)'))
        const currentServerUrl = process.env.HAPI_API_URL || configuration.apiUrl
        const serverUrl = await rl.question(chalk.cyan(`Server URL [${currentServerUrl}]: `))
        const finalServerUrl = serverUrl.trim() || currentServerUrl

        // Validate URL
        try {
            new URL(finalServerUrl)
        } catch {
            console.error(chalk.red('\n❌ Invalid URL format. Please use http:// or https://'))
            process.exit(1)
        }

        console.log('')

        // Step 2: CLI Token
        console.log(chalk.bold.white('Step 2: Authentication Token'))
        console.log(chalk.dim('To get your token:'))
        console.log(chalk.dim('  1. Open ' + finalServerUrl + ' in your browser'))
        console.log(chalk.dim('  2. Register or login to your account'))
        console.log(chalk.dim('  3. Go to Settings and generate a new CLI token'))
        console.log('')
        const token = await rl.question(chalk.cyan('Enter your CLI token: '))

        if (!token.trim()) {
            console.error(chalk.red('\n❌ Token cannot be empty'))
            process.exit(1)
        }

        // Step 3: Save configuration
        console.log('')
        console.log(chalk.bold.white('Step 3: Saving configuration...'))

        await updateSettings(current => ({
            ...current,
            cliApiToken: token.trim(),
            apiUrl: finalServerUrl
        }))
        configuration._setApiUrl(finalServerUrl)

        console.log(chalk.green(`\n✅ Configuration saved to ${configuration.settingsFile}`))
        console.log('')
        console.log(chalk.bold.white('Configuration summary:'))
        console.log(chalk.dim(`  Server URL: ${finalServerUrl}`))
        console.log(chalk.dim(`  Token: ${'*'.repeat(Math.min(token.length, 20))}...`))
        console.log('')
        console.log(chalk.bold.cyan('🎉 Setup complete!'))
        console.log('')
        console.log(chalk.dim('You can now run:'))
        console.log(chalk.cyan('  hapi            ') + chalk.dim('- Start a Claude Code session'))
        console.log(chalk.cyan('  hapi runner start') + chalk.dim(' - Start background runner'))
        console.log(chalk.cyan('  hapi doctor     ') + chalk.dim('- Check connection status'))
        console.log('')
    } finally {
        rl.close()
    }
}

/**
 * Handles automatic login flow using username and password
 * This eliminates the need to manually copy token from web UI
 */
async function handleAutoLogin(): Promise<void> {
    if (!process.stdin.isTTY) {
        console.error(chalk.red('Cannot run auto login in non-TTY environment.'))
        console.error(chalk.dim('Use manual token login instead.'))
        process.exit(1)
    }

    console.log(chalk.bold.cyan('\n🔐 HAPI Auto Login\n'))
    console.log(chalk.dim('This will automatically configure your CLI using your account credentials.\n'))

    const rl = readline.createInterface({ input, output })

    try {
        // Get server URL
        const currentServerUrl = process.env.HAPI_API_URL || configuration.apiUrl
        console.log(chalk.bold.white('Step 1: Server Configuration'))
        const serverUrl = await rl.question(chalk.cyan(`Server URL [${currentServerUrl}]: `))
        const finalServerUrl = (serverUrl.trim() || currentServerUrl).replace(/\/$/, '')

        // Validate URL
        try {
            new URL(finalServerUrl)
        } catch {
            console.error(chalk.red('\n❌ Invalid URL format. Please use http:// or https://'))
            process.exit(1)
        }

        console.log('')

        // Get credentials
        console.log(chalk.bold.white('Step 2: Account Credentials'))
        const username = await rl.question(chalk.cyan('Username: '))

        if (!username.trim()) {
            console.error(chalk.red('\n❌ Username cannot be empty'))
            process.exit(1)
        }

        // For password, we need to hide input
        // Since readline doesn't support hidden input, we'll use a workaround
        const password = await rl.question(chalk.cyan('Password: '))

        if (!password.trim()) {
            console.error(chalk.red('\n❌ Password cannot be empty'))
            process.exit(1)
        }

        console.log('')
        console.log(chalk.bold.white('Step 3: Authenticating...'))

        // Step 1: Login to get JWT token
        let jwtToken: string
        try {
            const authResponse = await axios.post(`${finalServerUrl}/api/auth`, {
                username: username.trim(),
                password: password.trim()
            })

            jwtToken = authResponse.data.token
            console.log(chalk.green('✓ Authentication successful'))
        } catch (error: any) {
            if (error.response?.status === 401) {
                console.error(chalk.red('\n❌ Invalid username or password'))
            } else if (error.response?.data?.error) {
                console.error(chalk.red(`\n❌ ${error.response.data.error}`))
            } else {
                console.error(chalk.red('\n❌ Failed to authenticate. Please check your server URL and try again.'))
                console.error(chalk.dim(`Error: ${error.message}`))
            }
            process.exit(1)
        }

        // Step 2: Generate CLI token using JWT
        console.log(chalk.bold.white('Step 4: Generating CLI token...'))
        let cliToken: string
        try {
            const tokenResponse = await axios.post(
                `${finalServerUrl}/api/cli-tokens`,
                {
                    name: `CLI on ${os.hostname()}`
                },
                {
                    headers: {
                        'Authorization': `Bearer ${jwtToken}`
                    }
                }
            )

            cliToken = tokenResponse.data.token
            console.log(chalk.green('✓ CLI token generated'))
        } catch (error: any) {
            console.error(chalk.red('\n❌ Failed to generate CLI token'))
            if (error.response?.data?.error) {
                console.error(chalk.dim(`Error: ${error.response.data.error}`))
            } else {
                console.error(chalk.dim(`Error: ${error.message}`))
            }
            process.exit(1)
        }

        // Step 3: Save configuration
        console.log('')
        console.log(chalk.bold.white('Step 5: Saving configuration...'))

        await updateSettings(current => ({
            ...current,
            cliApiToken: cliToken,
            apiUrl: finalServerUrl
        }))
        configuration._setCliApiToken(cliToken)
        configuration._setApiUrl(finalServerUrl)

        console.log(chalk.green(`\n✅ Configuration saved to ${configuration.settingsFile}`))
        console.log('')
        console.log(chalk.bold.white('Configuration summary:'))
        console.log(chalk.dim(`  Server URL: ${finalServerUrl}`))
        console.log(chalk.dim(`  Username: ${username.trim()}`))
        console.log(chalk.dim(`  CLI Token: ${'*'.repeat(20)}...`))
        console.log('')
        console.log(chalk.bold.cyan('🎉 Auto login complete!'))
        console.log('')
        console.log(chalk.dim('Your machine will be automatically registered when you start a session.'))
        console.log('')
        console.log(chalk.dim('You can now run:'))
        console.log(chalk.cyan('  hapi            ') + chalk.dim('- Start a Claude Code session'))
        console.log(chalk.cyan('  hapi runner start') + chalk.dim(' - Start background runner'))
        console.log(chalk.cyan('  hapi doctor     ') + chalk.dim('- Check connection status'))
        console.log('')
    } finally {
        rl.close()
    }
}

function showHelp(): void {
    console.log(`
${chalk.bold.white('hapi auth')} - Authentication management

${chalk.bold.white('Usage:')}
  hapi auth setup             Interactive setup wizard (first-time setup)
  hapi auth login             Enter and save CLI_API_TOKEN manually
  hapi auth login --auto      Auto login with username/password (recommended)
  hapi auth status            Show current configuration
  hapi auth logout            Clear saved credentials

${chalk.bold.white('Token priority (highest to lowest):')}
  1. CLI_API_TOKEN environment variable
  2. ~/.hapi/settings.json
  3. Interactive prompt (on first run)

${chalk.bold.white('Recommended workflow for new users:')}
  1. Run: hapi auth login --auto
  2. Enter your server URL, username, and password
  3. CLI token will be automatically generated and saved
  4. Your machine will be registered when you start a session
`)
}

export const authCommand: CommandDefinition = {
    name: 'auth',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        try {
            await handleAuthCommand(commandArgs)
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    }
}
