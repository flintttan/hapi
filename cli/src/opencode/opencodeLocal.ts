import { logger } from '@/ui/logger';
import { restoreTerminalState } from '@/ui/terminalState';
import { spawnWithAbort } from '@/utils/spawnWithAbort';

export async function opencodeLocal(opts: {
    path: string;
    abort: AbortSignal;
    env: NodeJS.ProcessEnv;
    sessionId?: string;
}): Promise<void> {
    const args: string[] = [];
    if (opts.sessionId) {
        args.push('--session', opts.sessionId);
    }

    logger.debug(`[OpencodeLocal] Spawning opencode with args: ${JSON.stringify(args)}`);

    process.stdin.pause();
    try {
        await spawnWithAbort({
            command: 'opencode',
            args,
            cwd: opts.path,
            env: opts.env,
            signal: opts.abort,
            shell: process.platform === 'win32',
            logLabel: 'OpencodeLocal',
            spawnName: 'opencode',
            installHint: 'OpenCode CLI',
            includeCause: true,
            logExit: true
        });
    } finally {
        process.stdin.resume();
        restoreTerminalState();
    }
}
