import { readdir, readFile } from 'fs/promises'
import type { Dirent } from 'fs'
import { join, relative } from 'path'
import { homedir } from 'os'
import { parse as parseYaml } from 'yaml'

export interface SlashCommand {
    name: string
    description?: string
    source: 'builtin' | 'user' | 'plugin'
    content?: string // Expanded content for Codex user prompts
    pluginName?: string // Name of the plugin that provides this command
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

async function listMarkdownFiles(rootDir: string, options: { recursive: boolean }): Promise<string[]> {
    const { recursive } = options

    if (!recursive) {
        try {
            const entries = await readdir(rootDir, { withFileTypes: true })
            const mdFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
            return mdFiles.map((entry) => join(rootDir, entry.name))
        } catch {
            return []
        }
    }

    const files: string[] = []
    const stack: string[] = [rootDir]

    while (stack.length > 0) {
        const currentDir = stack.pop()
        if (!currentDir) continue

        let entries: Dirent[]
        try {
            entries = await readdir(currentDir, { withFileTypes: true })
        } catch {
            continue
        }

        for (const entry of entries) {
            const entryPath = join(currentDir, entry.name)
            if (entry.isDirectory()) {
                stack.push(entryPath)
                continue
            }
            if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(entryPath)
            }
        }
    }

    return files
}

async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent)
    if (!dir) {
        return []
    }

    const shouldReadContent = agent === 'codex'
    const shouldReadDescription = agent === 'codex' || agent === 'claude'
    const commandFiles = await listMarkdownFiles(dir, { recursive: agent === 'claude' })

    const commands = await Promise.all(
        commandFiles.map(async (filePath): Promise<SlashCommand | null> => {
            const relPath = relative(dir, filePath).replace(/\\/g, '/')
            const withoutExt = relPath.endsWith('.md') ? relPath.slice(0, -3) : relPath
            const segments = withoutExt.split('/').filter(Boolean)
            if (segments.length === 0) {
                return null
            }

            let claudeNameOverride: string | null = null
            const command: SlashCommand = {
                name: agent === 'claude' ? segments.join(':') : withoutExt,
                description: 'Custom command',
                source: 'user'
            }

            if (shouldReadContent || shouldReadDescription) {
                try {
                    const fileContent = await readFile(filePath, 'utf-8')
                    const parsed = parseFrontmatter(fileContent)

                    if (shouldReadDescription && parsed.description) {
                        command.description = parsed.description
                    }
                    if (shouldReadContent) {
                        command.content = parsed.content
                    }
                    if (agent === 'claude' && parsed.name) {
                        claudeNameOverride = sanitizeClaudeCommandName(parsed.name)
                    }
                } catch {
                    // Ignore file read errors.
                }
            }

            if (agent === 'claude') {
                const namespace = segments.slice(0, -1)
                const leaf = claudeNameOverride ?? segments[segments.length - 1] ?? ''
                if (!leaf) {
                    return null
                }
                command.name = [...namespace, leaf].join(':')
                // Claude commands are executed by Claude itself; do not send markdown content to hub/webapp.
                delete command.content
            }

            return command
        })
    )

    return commands
        .filter((cmd): cmd is SlashCommand => cmd !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
}

async function scanCommandsDirForPlugin(commandsDir: string, pluginName: string): Promise<SlashCommand[]> {
    const files = await listMarkdownFiles(commandsDir, { recursive: false })

    const commands = await Promise.all(
        files.map(async (filePath): Promise<SlashCommand | null> => {
            const relPath = relative(commandsDir, filePath).replace(/\\/g, '/')
            const withoutExt = relPath.endsWith('.md') ? relPath.slice(0, -3) : relPath
            if (!withoutExt) {
                return null
            }

            const name = `${pluginName}:${withoutExt}`
            const base: SlashCommand = {
                name,
                description: `${pluginName} command`,
                source: 'plugin',
                pluginName
            }

            try {
                const fileContent = await readFile(filePath, 'utf-8')
                const parsed = parseFrontmatter(fileContent)
                if (parsed.description) {
                    base.description = parsed.description
                }
            } catch {
                // Ignore file read errors.
            }

            return base
        })
    )

    return commands
        .filter((cmd): cmd is SlashCommand => cmd !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
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
            if (installations.length === 0) continue

            const sortedInstallations = [...installations].sort((a, b) => {
                return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
            })

            const installation = sortedInstallations[0]
            if (!installation?.installPath) continue

            const commandsDir = join(installation.installPath, 'commands')
            const commands = await scanCommandsDirForPlugin(commandsDir, pluginName)
            allCommands.push(...commands)
        }

        return allCommands.sort((a, b) => a.name.localeCompare(b.name))
    } catch {
        return []
    }
}

export async function listSlashCommands(agent: string): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? []

    const [user, plugin] = await Promise.all([
        scanUserCommands(agent),
        scanPluginCommands(agent)
    ])

    return [...builtin, ...user, ...plugin]
}
