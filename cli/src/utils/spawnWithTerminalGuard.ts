import { restoreTerminalState } from '@/ui/terminalState';
import { spawnWithAbort, type SpawnWithAbortOptions } from '@/utils/spawnWithAbort';

/**
 * Guards the terminal around a spawnWithAbort call: pauses stdin before spawn,
 * then resumes stdin and restores terminal escape state in finally.
 */
export async function spawnWithTerminalGuard(options: SpawnWithAbortOptions): Promise<void> {
    process.stdin.pause();
    try {
        await spawnWithAbort(options);
    } finally {
        process.stdin.resume();
        restoreTerminalState();
    }
}
