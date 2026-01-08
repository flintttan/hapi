import { readdir, readFile } from 'fs/promises';
import type { Dirent } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

export interface SlashCommand {
    name: string;
    description?: string;
    source: 'builtin' | 'user';
    content?: string;  // Expanded content for Codex user prompts
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
 * Parse frontmatter from a markdown file content.
 * Returns the name/description (from frontmatter) and the body content.
 */
function parseFrontmatter(fileContent: string): { name?: string; description?: string; content: string } {
    // Match frontmatter: starts with ---, ends with ---
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
        const yamlContent = match[1];
        const body = match[2].trim();
        try {
            const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
            const name = typeof parsed?.name === 'string' ? parsed.name : undefined;
            const description = typeof parsed?.description === 'string' ? parsed.description : undefined;
            return { name, description, content: body };
        } catch {
            // Invalid YAML - the --- block is not valid frontmatter, return entire file
            return { content: fileContent.trim() };
        }
    }
    // No frontmatter, entire file is content
    return { content: fileContent.trim() };
}

function sanitizeClaudeCommandName(rawName: string): string | null {
    const trimmed = rawName.trim().replace(/^\/+/, '');
    if (!trimmed) {
        return null;
    }
    // Claude command namespaces come from directory structure; the frontmatter `name` should be a leaf segment.
    if (trimmed.includes(':') || trimmed.includes('/') || trimmed.includes('\\')) {
        return null;
    }
    return trimmed;
}

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
 * Scan a directory for user-defined commands (*.md files).
 * For Claude + Codex, reads frontmatter (YAML) for `description`.
 * For Codex, also returns the expanded prompt `content`.
 *
 * Claude supports nested command namespaces: `workflow/plan.md` -> `workflow:plan`.
 */
async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent);
    if (!dir) {
        return [];
    }

    const shouldReadContent = agent === 'codex';
    const shouldReadDescription = agent === 'codex' || agent === 'claude';

    const listCommandFiles = async (): Promise<string[]> => {
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
            return mdFiles.map((entry) => join(dir, entry.name));
        } catch {
            return [];
        }
    };

    const listCommandFilesRecursive = async (): Promise<string[]> => {
        const files: string[] = [];
        const stack: string[] = [dir];

        while (stack.length > 0) {
            const currentDir = stack.pop();
            if (!currentDir) continue;

            let entries: Dirent[];
            try {
                entries = await readdir(currentDir, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                const entryPath = join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    stack.push(entryPath);
                    continue;
                }
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    files.push(entryPath);
                }
            }
        }

        return files;
    };

    try {
        const commandFiles = agent === 'claude'
            ? await listCommandFilesRecursive()
            : await listCommandFiles();

        // Read all files in parallel
        const commands = await Promise.all(
            commandFiles.map(async (filePath): Promise<SlashCommand | null> => {
                const relPath = relative(dir, filePath).replace(/\\/g, '/');
                const withoutExt = relPath.endsWith('.md') ? relPath.slice(0, -3) : relPath;
                const segments = withoutExt.split('/').filter(Boolean);
                if (segments.length === 0) {
                    return null;
                }

                let claudeNameOverride: string | null = null;
                const command: SlashCommand = {
                    name: agent === 'claude' ? segments.join(':') : withoutExt,
                    description: 'Custom command',
                    source: 'user',
                };

                if (shouldReadContent || shouldReadDescription) {
                    try {
                        const fileContent = await readFile(filePath, 'utf-8');
                        const parsed = parseFrontmatter(fileContent);
                        if (shouldReadDescription && parsed.description) {
                            command.description = parsed.description;
                        }
                        if (shouldReadContent) {
                            command.content = parsed.content;
                        }
                        if (agent === 'claude' && parsed.name) {
                            claudeNameOverride = sanitizeClaudeCommandName(parsed.name);
                        }
                    } catch {
                        // Failed to read file, keep default description
                    }
                }

                if (agent === 'claude') {
                    const namespace = segments.slice(0, -1);
                    const leaf = claudeNameOverride ?? segments[segments.length - 1] ?? '';
                    if (!leaf) {
                        return null;
                    }
                    command.name = [...namespace, leaf].join(':');
                }

                return command;
            })
        );

        // Filter nulls and sort alphabetically
        return commands
            .filter((cmd): cmd is SlashCommand => cmd !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
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
