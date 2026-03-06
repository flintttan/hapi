import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { parse as parseYaml } from 'yaml'

export interface SlashCommand {
    name: string
    description?: string
    source: 'builtin' | 'user' | 'plugin' | 'project'
    content?: string
    pluginName?: string
}

export interface ListSlashCommandsRequest {
    agent: string
}

export interface ListSlashCommandsResponse {
    success: boolean
    commands?: SlashCommand[]
    error?: string
}

const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
        { name: 'compact', description: 'Compact conversation context', source: 'builtin' },
        { name: 'context', description: 'Show context information', source: 'builtin' },
        { name: 'cost', description: 'Show session cost', source: 'builtin' },
        { name: 'plan', description: 'Toggle plan mode', source: 'builtin' }
    ],
    codex: [],
    gemini: [
        { name: 'about', description: 'About Gemini', source: 'builtin' },
        { name: 'clear', description: 'Clear conversation', source: 'builtin' },
        { name: 'compress', description: 'Compress context', source: 'builtin' }
    ],
    opencode: []
}

interface InstalledPluginsFile {
    version: number
    plugins: Record<string, Array<{
        scope: string
        installPath: string
        version: string
        installedAt: string
        lastUpdated: string
        gitCommitSha?: string
    }>>
}

function parseFrontmatter(fileContent: string): { name?: string; description?: string; content: string } {
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (match) {
        const yamlContent = match[1]
        const body = match[2].trim()
        try {
            const parsed = parseYaml(yamlContent) as Record<string, unknown> | null
            const name = typeof parsed?.name === 'string' ? parsed.name : undefined
            const description = typeof parsed?.description === 'string' ? parsed.description : undefined
            return { name, description, content: body }
        } catch {
            return { content: fileContent.trim() }
        }
    }

    return { content: fileContent.trim() }
}

function sanitizeClaudeCommandName(rawName: string): string | null {
    const trimmed = rawName.trim().replace(/^\/+/, '')
    if (!trimmed) {
        return null
    }
    if (trimmed.includes(':') || trimmed.includes('/') || trimmed.includes('\\')) {
        return null
    }
    return trimmed
}

function getUserCommandsDir(agent: string): string | null {
    switch (agent) {
        case 'claude': {
            const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
            return join(configDir, 'commands')
        }
        case 'codex': {
            const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
            return join(codexHome, 'prompts')
        }
        default:
            return null
    }
}

function getProjectCommandsDir(agent: string, projectDir: string): string | null {
    switch (agent) {
        case 'claude':
            return join(projectDir, '.claude', 'commands')
        case 'codex':
            return join(projectDir, '.codex', 'prompts')
        default:
            return null
    }
}

async function scanCommandsDir(
    agent: string,
    dir: string,
    source: 'user' | 'plugin' | 'project',
    pluginName?: string
): Promise<SlashCommand[]> {
    const shouldExposeContent = agent === 'codex'

    async function scanRecursive(currentDir: string, segments: string[]): Promise<SlashCommand[]> {
        const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => null)
        if (!entries) {
            return []
        }

        const commandsByEntry = await Promise.all(
            entries.map(async (entry): Promise<SlashCommand[]> => {
                if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
                    return []
                }

                if (entry.isDirectory()) {
                    if (entry.name.includes(':')) {
                        return []
                    }
                    return scanRecursive(join(currentDir, entry.name), [...segments, entry.name])
                }

                if (!entry.isFile() || !entry.name.endsWith('.md')) {
                    return []
                }

                const baseName = entry.name.slice(0, -3)
                if (!baseName || baseName.includes(':')) {
                    return []
                }

                const fallbackDescription = source === 'plugin' ? `${pluginName ?? 'plugin'} command` : 'Custom command'
                let leafName = baseName
                let description = fallbackDescription
                let content: string | undefined

                try {
                    const filePath = join(currentDir, entry.name)
                    const fileContent = await readFile(filePath, 'utf-8')
                    const parsed = parseFrontmatter(fileContent)

                    if (parsed.description) {
                        description = parsed.description
                    }
                    if (shouldExposeContent) {
                        content = parsed.content
                    }
                    if (agent === 'claude' && parsed.name) {
                        leafName = sanitizeClaudeCommandName(parsed.name) ?? baseName
                    }
                } catch {
                    // Keep fallback values
                }

                if (!leafName) {
                    return []
                }

                const localName = [...segments, leafName].join(':')
                const command: SlashCommand = {
                    name: pluginName ? `${pluginName}:${localName}` : localName,
                    description,
                    source
                }

                if (content) {
                    command.content = content
                }
                if (pluginName) {
                    command.pluginName = pluginName
                }

                return [command]
            })
        )

        return commandsByEntry.flat()
    }

    const commands = await scanRecursive(dir, [])
    return commands.sort((a, b) => a.name.localeCompare(b.name))
}

async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent)
    if (!dir) {
        return []
    }
    return await scanCommandsDir(agent, dir, 'user')
}

async function scanProjectCommands(agent: string, projectDir?: string): Promise<SlashCommand[]> {
    if (!projectDir) {
        return []
    }

    const dir = getProjectCommandsDir(agent, projectDir)
    if (!dir) {
        return []
    }

    return await scanCommandsDir(agent, dir, 'project')
}

async function scanPluginCommands(agent: string): Promise<SlashCommand[]> {
    if (agent !== 'claude') {
        return []
    }

    const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
    const installedPluginsPath = join(configDir, 'plugins', 'installed_plugins.json')

    try {
        const content = await readFile(installedPluginsPath, 'utf-8')
        const installedPlugins = JSON.parse(content) as InstalledPluginsFile

        if (!installedPlugins.plugins) {
            return []
        }

        const allCommands: SlashCommand[] = []

        for (const [pluginKey, installations] of Object.entries(installedPlugins.plugins)) {
            const lastAtIndex = pluginKey.lastIndexOf('@')
            const pluginName = lastAtIndex > 0 ? pluginKey.substring(0, lastAtIndex) : pluginKey

            if (installations.length === 0) {
                continue
            }

            const sortedInstallations = [...installations].sort((a, b) => {
                return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
            })

            const installation = sortedInstallations[0]
            if (!installation?.installPath) {
                continue
            }

            const commandsDir = join(installation.installPath, 'commands')
            const commands = await scanCommandsDir(agent, commandsDir, 'plugin', pluginName)
            allCommands.push(...commands)
        }

        return allCommands.sort((a, b) => a.name.localeCompare(b.name))
    } catch {
        return []
    }
}

export async function listSlashCommands(agent: string, projectDir?: string): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? []

    const [user, plugin, project] = await Promise.all([
        scanUserCommands(agent),
        scanPluginCommands(agent),
        scanProjectCommands(agent, projectDir)
    ])

    const allCommands = [...builtin, ...user, ...plugin, ...project]
    const commandMap = new Map<string, SlashCommand>()

    for (const command of allCommands) {
        if (commandMap.has(command.name)) {
            commandMap.delete(command.name)
        }
        commandMap.set(command.name, command)
    }

    return Array.from(commandMap.values())
}
