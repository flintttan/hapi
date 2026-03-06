import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listSlashCommands } from './slashCommands'

describe('listSlashCommands', () => {
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    const originalCodexHome = process.env.CODEX_HOME

    let sandboxDir: string
    let claudeConfigDir: string
    let codexHome: string
    let projectDir: string

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'hapi-slash-commands-'))
        claudeConfigDir = join(sandboxDir, 'global-claude')
        codexHome = join(sandboxDir, 'global-codex')
        projectDir = join(sandboxDir, 'project')

        process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
        process.env.CODEX_HOME = codexHome
    })

    afterEach(async () => {
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
        }

        if (originalCodexHome === undefined) {
            delete process.env.CODEX_HOME
        } else {
            process.env.CODEX_HOME = originalCodexHome
        }

        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('parses Claude custom command descriptions, nesting, and name overrides', async () => {
        const commandsDir = join(claudeConfigDir, 'commands')
        await mkdir(join(commandsDir, 'workflow'), { recursive: true })

        await writeFile(
            join(commandsDir, 'workflow', 'plan.md'),
            `---\ndescription: Workflow plan\n---\nBody\n`
        )
        await writeFile(
            join(commandsDir, 'workflow', 'do-it.md'),
            `---\nname: execute\ndescription: Workflow execute\n---\nBody\n`
        )
        await writeFile(
            join(commandsDir, 'lite-plan.md'),
            `---\ndescription: Lite plan\n---\nBody\n`
        )
        await writeFile(
            join(commandsDir, 'no-desc.md'),
            `# No frontmatter\nBody\n`
        )

        const commands = await listSlashCommands('claude')
        const userCommands = commands.filter((cmd) => cmd.source === 'user')

        expect(userCommands).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'workflow:plan', description: 'Workflow plan', source: 'user' }),
            expect.objectContaining({ name: 'workflow:execute', description: 'Workflow execute', source: 'user' }),
            expect.objectContaining({ name: 'lite-plan', description: 'Lite plan', source: 'user' }),
            expect.objectContaining({ name: 'no-desc', description: 'Custom command', source: 'user' })
        ]))

        expect(userCommands.find((cmd) => cmd.name === 'workflow:plan')?.content).toBeUndefined()
    })

    it('parses Codex prompt content and description from frontmatter', async () => {
        const promptsDir = join(codexHome, 'prompts')
        await mkdir(promptsDir, { recursive: true })
        await writeFile(
            join(promptsDir, 'my-prompt.md'),
            `---\ndescription: My prompt\n---\nHello world\n\nMore\n`
        )

        const commands = await listSlashCommands('codex')
        const user = commands.find((cmd) => cmd.source === 'user' && cmd.name === 'my-prompt')

        expect(user?.description).toBe('My prompt')
        expect(user?.content).toBe('Hello world\n\nMore')
    })

    it('keeps backward-compatible behavior when projectDir is not provided', async () => {
        await mkdir(join(claudeConfigDir, 'commands'), { recursive: true })
        await writeFile(
            join(claudeConfigDir, 'commands', 'global-only.md'),
            ['---', 'description: Global only', '---', '', 'Global command body'].join('\n')
        )

        const commands = await listSlashCommands('claude')
        const command = commands.find((cmd) => cmd.name === 'global-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('user')
        expect(command?.description).toBe('Global only')
    })

    it('loads project-level commands when projectDir is provided', async () => {
        await mkdir(join(projectDir, '.claude', 'commands'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'commands', 'project-only.md'),
            ['---', 'description: Project only', '---', '', 'Project command body'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const command = commands.find((cmd) => cmd.name === 'project-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Project only')
        expect(command?.content).toBeUndefined()
    })

    it('prefers project command when project and global have same name', async () => {
        await mkdir(join(claudeConfigDir, 'commands'), { recursive: true })
        await mkdir(join(projectDir, '.claude', 'commands'), { recursive: true })

        await writeFile(
            join(claudeConfigDir, 'commands', 'shared.md'),
            ['---', 'description: Global shared', '---', '', 'Global body'].join('\n')
        )
        await writeFile(
            join(projectDir, '.claude', 'commands', 'shared.md'),
            ['---', 'description: Project shared', '---', '', 'Project body'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const sharedCommands = commands.filter((cmd) => cmd.name === 'shared')

        expect(sharedCommands).toHaveLength(1)
        expect(sharedCommands[0]?.source).toBe('project')
        expect(sharedCommands[0]?.description).toBe('Project shared')
    })

    it('loads nested project commands using colon-separated names', async () => {
        await mkdir(join(projectDir, '.claude', 'commands', 'trellis'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'commands', 'trellis', 'start.md'),
            ['---', 'description: Trellis start', '---', '', 'Start flow'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const command = commands.find((cmd) => cmd.name === 'trellis:start')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Trellis start')
    })

    it('returns empty project commands when project directory does not exist', async () => {
        const nonExistentProjectDir = join(sandboxDir, 'not-exists')
        await expect(listSlashCommands('claude', nonExistentProjectDir)).resolves.toBeDefined()
    })
})
