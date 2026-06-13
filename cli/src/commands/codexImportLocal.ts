import chalk from 'chalk'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { ApiClient } from '@/api/api'
import type { CodexLocalSessionSummary } from '@hapi/protocol/codexImport'
import type { CommandDefinition } from './types'
import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { initializeToken } from '@/ui/tokenInit'
import { maybeAutoStartServer } from '@/utils/autoStartServer'
import { assertCodexLocalSupported } from '@/codex/utils/codexVersion'

async function resolveCodexSessionIds(commandArgs: string[]): Promise<string[]> {
    const explicit = commandArgs
        .map((arg) => arg.trim())
        .filter(Boolean)

    if (explicit.length > 0) {
        return Array.from(new Set(explicit))
    }

    if (!process.stdin.isTTY) {
        throw new Error('Please provide at least one Codex session id in non-TTY mode')
    }

    const api = await ApiClient.create()
    const sessions = await api.getCodexSessions()
    if (sessions.sessions.length === 0) {
        throw new Error('No local Codex sessions found on this machine')
    }

    console.log(chalk.bold('Local Codex sessions:'))
    sessions.sessions.forEach((session: CodexLocalSessionSummary, index: number) => {
        console.log(`${index + 1}. ${session.id}  ${session.title}`)
    })

    const rl = readline.createInterface({ input, output })
    try {
        const answer = await rl.question(chalk.cyan('Choose session number(s), comma-separated: '))
        const indexes = answer
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0 && value <= sessions.sessions.length)
        if (indexes.length === 0) {
            throw new Error('No valid session selected')
        }
        return Array.from(new Set(indexes.map((index) => sessions.sessions[index - 1]!.id)))
    } finally {
        rl.close()
    }
}

export const codexImportLocalCommand: CommandDefinition = {
    name: 'codex-import',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        try {
            assertCodexLocalSupported()
            await initializeToken()
            await maybeAutoStartServer()
            await authAndSetupMachineIfNeeded()

            const codexSessionIds = await resolveCodexSessionIds(commandArgs)
            const api = await ApiClient.create()
            const result = await api.syncCodexSession({ sessionIds: codexSessionIds })

            if (!result.success) {
                throw new Error(result.error ?? 'Codex import failed')
            }

            console.log(result.output ?? result.message ?? 'Codex import completed')
            if (result.hapiSessionId) {
                console.log(chalk.green(`Imported session: ${result.hapiSessionId}`))
                console.log(chalk.green('Now continue in the Hapi Web UI.'))
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    }
}
