import { readdir, stat } from 'fs/promises';
import { join, relative, sep } from 'path';
import { homedir } from 'os';

export interface SlashCommand {
    name: string;
    description?: string;
    source: 'builtin' | 'user';
}

export interface ListSlashCommandsRequest {
    agent: string;
}

export interface ListSlashCommandsResponse {
    success: boolean;
    commands?: SlashCommand[];
    error?: string;
}

/**
 * Built-in slash commands for each agent type.
 */
const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
        { name: 'compact', description: 'Compact conversation context', source: 'builtin' },
        { name: 'context', description: 'Show context information', source: 'builtin' },
        { name: 'cost', description: 'Show session cost', source: 'builtin' },
        { name: 'plan', description: 'Toggle plan mode', source: 'builtin' },
    ],
    codex: [
        { name: 'review', description: 'Review code', source: 'builtin' },
        { name: 'new', description: 'Start new conversation', source: 'builtin' },
        { name: 'compat', description: 'Check compatibility', source: 'builtin' },
        { name: 'undo', description: 'Undo last action', source: 'builtin' },
    ],
    gemini: [
        { name: 'about', description: 'About Gemini', source: 'builtin' },
        { name: 'clear', description: 'Clear conversation', source: 'builtin' },
        { name: 'compress', description: 'Compress context', source: 'builtin' },
    ],
};

/**
 * Get the user commands directory for an agent type.
 * Returns null if the agent doesn't support user commands.
 */
function getUserCommandsDir(agent: string): string | null {
    switch (agent) {
        case 'claude': {
            const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
            return join(configDir, 'commands');
        }
        case 'codex': {
            const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
            return join(codexHome, 'prompts');
        }
        default:
            // Gemini and other agents don't have user commands
            return null;
    }
}

/**
 * Recursively scan a directory for .md files.
 * Returns paths relative to the base directory.
 */
async function scanDirectoryRecursive(dir: string, baseDir: string): Promise<string[]> {
    const results: string[] = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subResults = await scanDirectoryRecursive(fullPath, baseDir);
                results.push(...subResults);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                // Get relative path from base directory
                const relativePath = relative(baseDir, fullPath);
                results.push(relativePath);
            }
        }
    } catch {
        // Ignore errors for individual directories
    }

    return results;
}

/**
 * Scan a directory for user-defined commands (*.md files).
 * Returns the command names (filename without extension).
 * Supports nested directories - converts path separators to colons.
 * Example: workflow/ui-design/capture.md -> workflow:ui-design:capture
 */
async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent);
    if (!dir) {
        return [];
    }

    try {
        const filePaths = await scanDirectoryRecursive(dir, dir);
        const commands: SlashCommand[] = [];

        for (const filePath of filePaths) {
            // Remove .md extension
            const nameWithPath = filePath.slice(0, -3);
            if (!nameWithPath) continue;

            // Convert path separators to colons
            // Example: workflow/ui-design/capture -> workflow:ui-design:capture
            const name = nameWithPath.split(sep).join(':');

            commands.push({
                name,
                description: 'Custom command',
                source: 'user',
            });
        }

        // Sort alphabetically
        commands.sort((a, b) => a.name.localeCompare(b.name));

        return commands;
    } catch {
        // Directory doesn't exist or not accessible - return empty array
        return [];
    }
}

/**
 * List all available slash commands for an agent type.
 * Returns built-in commands plus user-defined commands.
 */
export async function listSlashCommands(agent: string): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? [];
    const user = await scanUserCommands(agent);

    // Combine: built-in first, then user commands
    return [...builtin, ...user];
}
