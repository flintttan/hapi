import type { Machine } from '../types/api'

function getLastSpawnError(runnerState: unknown): { message: string; at?: number } | null {
    if (!runnerState || typeof runnerState !== 'object' || Array.isArray(runnerState)) {
        return null
    }
    const lastSpawnError = (runnerState as { lastSpawnError?: unknown }).lastSpawnError
    if (!lastSpawnError || typeof lastSpawnError !== 'object' || Array.isArray(lastSpawnError)) {
        return null
    }
    const message = (lastSpawnError as { message?: unknown }).message
    if (typeof message !== 'string' || message.length === 0) {
        return null
    }
    const at = (lastSpawnError as { at?: unknown }).at
    return typeof at === 'number' ? { message, at } : { message }
}

export function formatRunnerSpawnError(machine: Machine | null): string | null {
    const lastSpawnError = getLastSpawnError(machine?.runnerState)
    if (!lastSpawnError) {
        return null
    }

    const at = typeof lastSpawnError.at === 'number'
        ? new Date(lastSpawnError.at).toLocaleString()
        : null
    return at
        ? `${lastSpawnError.message} (${at})`
        : lastSpawnError.message
}
