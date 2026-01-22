import { join } from 'node:path';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { getHappyCliCommand } from '@/utils/spawnHappyCLI';

function shellQuote(value: string): string {
    if (value.length === 0) {
        return '""';
    }

    if (/^[A-Za-z0-9_\/:=-]+$/.test(value)) {
        return value;
    }

    return '"' + value.replace(/(["\\$`])/g, '\\$1') + '"';
}

function shellJoin(parts: string[]): string {
    return parts.map(shellQuote).join(' ');
}

export function generateGeminiHookSettingsFile(port: number, token: string): string {
    const hooksDir = join(configuration.happyHomeDir, 'tmp', 'hooks');
    mkdirSync(hooksDir, { recursive: true });

    const filename = `gemini-session-hook-${process.pid}.json`;
    const filepath = join(hooksDir, filename);

    const { command, args } = getHappyCliCommand(['hook-forwarder', '--port', String(port), '--token', token]);
    const hookCommand = shellJoin([command, ...args]);

    const settings = {
        hooks: {
            enabled: true,
            SessionStart: [
                {
                    matcher: '*',
                    hooks: [
                        {
                            type: 'command',
                            command: hookCommand
                        }
                    ]
                }
            ]
        }
    };

    writeFileSync(filepath, JSON.stringify(settings, null, 4));
    logger.debug(`[gemini-hook-settings] Created hook settings file: ${filepath}`);

    return filepath;
}

export function cleanupGeminiHookSettingsFile(filepath: string): void {
    try {
        if (existsSync(filepath)) {
            unlinkSync(filepath);
            logger.debug(`[gemini-hook-settings] Cleaned up hook settings file: ${filepath}`);
        }
    } catch (error) {
        logger.debug(`[gemini-hook-settings] Failed to cleanup hook settings file: ${error}`);
    }
}
