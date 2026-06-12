import {
    getBuiltinSlashCommands,
    mergeSlashCommands
} from '@hapi/protocol/slashCommands'
import type { SlashCommand } from '@hapi/protocol/apiTypes'

const UNSUPPORTED_CODEX_BUILTIN_COMMANDS = new Set([
    'review',
    'new',
    'compat',
    'undo',
    'diff',
])

export { getBuiltinSlashCommands, mergeSlashCommands }

export function findCodexCustomPromptExpansion(
    text: string,
    availableCommands: readonly SlashCommand[]
): string | null {
    const trimmed = text.trim()
    const match = /^\/([a-z0-9:_-]+)$/i.exec(trimmed)
    if (!match) {
        return null
    }

    const commandName = match[1]?.toLowerCase()
    if (!commandName) {
        return null
    }

    const command = availableCommands.find(
        candidate => candidate.source !== 'builtin'
            && candidate.name.toLowerCase() === commandName
            && typeof candidate.content === 'string'
            && candidate.content.length > 0
    )
    return command?.content ?? null
}

export function findUnsupportedCodexBuiltinSlashCommand(
    text: string,
    availableCommands: readonly SlashCommand[]
): string | null {
    const match = /^\s*\/([a-z0-9:_-]+)(?:\s|$)/i.exec(text)
    if (!match) {
        return null
    }

    const commandName = match[1]?.toLowerCase()
    if (!commandName || !UNSUPPORTED_CODEX_BUILTIN_COMMANDS.has(commandName)) {
        return null
    }

    const hasCustomCommand = availableCommands.some(
        command => command.source !== 'builtin' && command.name.toLowerCase() === commandName
    )

    return hasCustomCommand ? null : commandName
}
