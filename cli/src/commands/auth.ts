import chalk from 'chalk'
import os from 'node:os'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { configuration } from '@/configuration'
import { readSettings, clearMachineId, updateSettings } from '@/persistence'

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
        console.log(chalk.gray(`  HAPI_SERVER_URL: ${configuration.serverUrl}`))
        console.log(chalk.gray(`  CLI_API_TOKEN: ${hasToken ? 'set' : 'missing'}`))
        console.log(chalk.gray(`  Token Source: ${tokenSource}`))
        console.log(chalk.gray(`  Machine ID: ${settings.machineId ?? 'not set'}`))
        console.log(chalk.gray(`  Host: ${os.hostname()}`))

        if (!hasToken) {
            console.log('')
            console.log(chalk.yellow('  Token not configured. To get your token:'))
            console.log(chalk.gray('    1. Check the server startup logs (first run shows generated token)'))
            console.log(chalk.gray('    2. Read ~/.hapi/settings.json on the server'))
            console.log(chalk.gray('    3. Ask your server administrator (if token is set via env var)'))
            console.log('')
            console.log(chalk.gray('  Then run: hapi auth login'))
        }
        return
    }

    if (subcommand === 'login') {
        if (!process.stdin.isTTY) {
            console.error(chalk.red('Cannot prompt for token in non-TTY environment.'))
            console.error(chalk.gray('Set CLI_API_TOKEN environment variable instead.'))
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
        console.log(chalk.gray('Note: If CLI_API_TOKEN is set via environment variable, it will still be used.'))
        return
    }

    console.error(chalk.red(`Unknown auth subcommand: ${subcommand}`))
    showHelp()
    process.exit(1)
}

async function handleSetup(): Promise<void> {
    if (!process.stdin.isTTY) {
        console.error(chalk.red('Cannot run setup in non-TTY environment.'))
        console.error(chalk.gray('Set HAPI_SERVER_URL and CLI_API_TOKEN environment variables instead.'))
        process.exit(1)
    }

    console.log(chalk.bold.cyan('\n🚀 HAPI CLI Setup Wizard\n'))
    console.log(chalk.gray('This wizard will help you configure your HAPI CLI client.\n'))

    const rl = readline.createInterface({ input, output })

    try {
        // Step 1: Server URL
        console.log(chalk.bold('Step 1: Server Configuration'))
        console.log(chalk.gray('Enter your HAPI server URL (e.g., https://hapi.example.com)'))
        const currentServerUrl = process.env.HAPI_SERVER_URL || configuration.serverUrl
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
        console.log(chalk.bold('Step 2: Authentication Token'))
        console.log(chalk.gray('To get your token:'))
        console.log(chalk.gray('  1. Open ' + finalServerUrl + ' in your browser'))
        console.log(chalk.gray('  2. Register or login to your account'))
        console.log(chalk.gray('  3. Go to Settings and generate a new CLI token'))
        console.log('')
        const token = await rl.question(chalk.cyan('Enter your CLI token: '))

        if (!token.trim()) {
            console.error(chalk.red('\n❌ Token cannot be empty'))
            process.exit(1)
        }

        // Step 3: Save configuration
        console.log('')
        console.log(chalk.bold('Step 3: Saving configuration...'))

        await updateSettings(current => ({
            ...current,
            cliApiToken: token.trim(),
            serverUrl: finalServerUrl
        }))

        console.log(chalk.green(`\n✅ Configuration saved to ${configuration.settingsFile}`))
        console.log('')
        console.log(chalk.bold('Configuration summary:'))
        console.log(chalk.gray(`  Server URL: ${finalServerUrl}`))
        console.log(chalk.gray(`  Token: ${'*'.repeat(Math.min(token.length, 20))}...`))
        console.log('')
        console.log(chalk.bold.cyan('🎉 Setup complete!'))
        console.log('')
        console.log(chalk.gray('You can now run:'))
        console.log(chalk.cyan('  hapi            ') + chalk.gray('- Start a Claude Code session'))
        console.log(chalk.cyan('  hapi daemon start') + chalk.gray(' - Start background daemon'))
        console.log(chalk.cyan('  hapi doctor     ') + chalk.gray('- Check connection status'))
        console.log('')
    } finally {
        rl.close()
    }
}

function showHelp(): void {
    console.log(`
${chalk.bold('hapi auth')} - Authentication management

${chalk.bold('Usage:')}
  hapi auth setup             Interactive setup wizard (first-time setup)
  hapi auth status            Show current configuration
  hapi auth login             Enter and save CLI_API_TOKEN
  hapi auth logout            Clear saved credentials

${chalk.bold('Token priority (highest to lowest):')}
  1. CLI_API_TOKEN environment variable
  2. ~/.hapi/settings.json
  3. Interactive prompt (on first run)
`)
}
