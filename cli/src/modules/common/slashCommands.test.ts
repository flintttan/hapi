import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { listSlashCommands } from './slashCommands';

describe('listSlashCommands', () => {
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const originalCodexHome = process.env.CODEX_HOME;

    const tempDirs: string[] = [];

    afterEach(async () => {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
        process.env.CODEX_HOME = originalCodexHome;

        await Promise.all(tempDirs.splice(0).map(async (dir) => {
            await rm(dir, { recursive: true, force: true });
        }));
    });

    it('parses Claude custom command descriptions and nested namespaces', async () => {
        const root = await mkdtemp(join(tmpdir(), 'hapi-claude-'));
        tempDirs.push(root);
        process.env.CLAUDE_CONFIG_DIR = root;

        const commandsDir = join(root, 'commands');
        await mkdir(join(commandsDir, 'workflow'), { recursive: true });

        await writeFile(
            join(commandsDir, 'workflow', 'plan.md'),
            `---\ndescription: Workflow plan\n---\nBody\n`
        );
        await writeFile(
            join(commandsDir, 'lite-plan.md'),
            `---\ndescription: Lite plan\n---\nBody\n`
        );
        await writeFile(
            join(commandsDir, 'no-desc.md'),
            `# No frontmatter\nBody\n`
        );

        const commands = await listSlashCommands('claude');
        const userCommands = commands.filter((cmd) => cmd.source === 'user');

        expect(userCommands).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'workflow:plan', description: 'Workflow plan', source: 'user' }),
            expect.objectContaining({ name: 'lite-plan', description: 'Lite plan', source: 'user' }),
            expect.objectContaining({ name: 'no-desc', description: 'Custom command', source: 'user' }),
        ]));

        expect(userCommands.find((cmd) => cmd.name === 'workflow:plan')?.content).toBeUndefined();
    });

    it('parses Codex prompt content and description from frontmatter', async () => {
        const root = await mkdtemp(join(tmpdir(), 'hapi-codex-'));
        tempDirs.push(root);
        process.env.CODEX_HOME = root;

        const promptsDir = join(root, 'prompts');
        await mkdir(promptsDir, { recursive: true });

        await writeFile(
            join(promptsDir, 'my-prompt.md'),
            `---\ndescription: My prompt\n---\nHello world\n\nMore\n`
        );

        const commands = await listSlashCommands('codex');
        const user = commands.find((cmd) => cmd.source === 'user' && cmd.name === 'my-prompt');
        expect(user?.description).toBe('My prompt');
        expect(user?.content).toBe('Hello world\n\nMore');
    });
});

