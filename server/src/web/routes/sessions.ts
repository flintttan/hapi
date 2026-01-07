import { getPermissionModesForFlavor, isModelModeAllowedForFlavor } from '@hapi/protocol'
import { ModelModeSchema, PermissionModeSchema } from '@hapi/protocol/schemas'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ModelMode } from '@hapi/protocol/types'
import type { SyncEngine, Session } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

type SessionSummaryMetadata = {
    name?: string
    path: string
    machineId?: string
    summary?: { text: string }
    flavor?: string | null
    worktree?: {
        basePath: string
        branch: string
        name: string
        worktreePath?: string
        createdAt?: number
    }
}

type SessionSummary = {
    id: string
    active: boolean
    thinking: boolean
    activeAt: number
    updatedAt: number
    metadata: SessionSummaryMetadata | null
    todoProgress: { completed: number; total: number } | null
    pendingRequestsCount: number
    modelMode?: ModelMode
}

function toSessionSummary(session: Session): SessionSummary {
    const pendingRequestsCount = session.agentState?.requests ? Object.keys(session.agentState.requests).length : 0

    const metadata: SessionSummaryMetadata | null = session.metadata ? {
        name: session.metadata.name,
        path: session.metadata.path,
        machineId: session.metadata.machineId ?? undefined,
        summary: session.metadata.summary ? { text: session.metadata.summary.text } : undefined,
        flavor: session.metadata.flavor ?? null,
        worktree: session.metadata.worktree
    } : null

    const todoProgress = session.todos?.length ? {
        completed: session.todos.filter(t => t.status === 'completed').length,
        total: session.todos.length
    } : null

    return {
        id: session.id,
        active: session.active,
        thinking: session.thinking,
        activeAt: session.activeAt,
        updatedAt: session.updatedAt,
        metadata,
        todoProgress,
        pendingRequestsCount,
        modelMode: session.modelMode
    }
}

const permissionModeSchema = z.object({
    mode: PermissionModeSchema
})

const modelModeSchema = z.object({
    model: ModelModeSchema
})

const renameSessionSchema = z.object({
    name: z.string().min(1).max(255)
})

export function createSessionsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/sessions', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const getPendingCount = (s: Session) => s.agentState?.requests ? Object.keys(s.agentState.requests).length : 0

        const namespace = c.get('namespace')
        const sessions = engine.getSessionsByNamespace(namespace)
            .sort((a, b) => {
                if (a.active !== b.active) {
                    return a.active ? -1 : 1
                }
                const aPending = getPendingCount(a)
                const bPending = getPendingCount(b)
                if (a.active && aPending !== bPending) {
                    return bPending - aPending
                }
                return b.updatedAt - a.updatedAt
            })
            .map(toSessionSummary)

        return c.json({ sessions })
    })

    app.get('/sessions/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        return c.json({ session: sessionResult.session })
    })

    app.post('/sessions/:id/abort', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        await engine.abortSession(sessionResult.sessionId)
        return c.json({ ok: true })
    })

    app.post('/sessions/:id/archive', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        await engine.archiveSession(sessionResult.sessionId)
        return c.json({ ok: true })
    })

    app.post('/sessions/:id/switch', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        await engine.switchSession(sessionResult.sessionId, 'remote')
        return c.json({ ok: true })
    })

    app.post('/sessions/:id/permission-mode', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const body = await c.req.json().catch(() => null)
        const parsed = permissionModeSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const flavor = sessionResult.session.metadata?.flavor ?? 'claude'
        const mode = parsed.data.mode

        const allowedModes = getPermissionModesForFlavor(flavor)
        if (allowedModes.length === 0) {
            return c.json({ error: 'Permission mode not supported for session flavor' }, 400)
        }

        if (!allowedModes.includes(mode)) {
            return c.json({ error: 'Invalid permission mode for session flavor' }, 400)
        }

        try {
            await engine.applySessionConfig(sessionResult.sessionId, { permissionMode: mode })
            return c.json({ ok: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to apply permission mode'
            return c.json({ error: message }, 409)
        }
    })

    app.post('/sessions/:id/model', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const body = await c.req.json().catch(() => null)
        const parsed = modelModeSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const flavor = sessionResult.session.metadata?.flavor ?? 'claude'
        if (!isModelModeAllowedForFlavor(parsed.data.model, flavor)) {
            return c.json({ error: 'Model mode is only supported for Claude sessions' }, 400)
        }

        try {
            await engine.applySessionConfig(sessionResult.sessionId, { modelMode: parsed.data.model })
            return c.json({ ok: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to apply model mode'
            return c.json({ error: message }, 409)
        }
    })

    app.patch('/sessions/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const body = await c.req.json().catch(() => null)
        const parsed = renameSessionSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body: name is required' }, 400)
        }

        try {
            await engine.renameSession(sessionResult.sessionId, parsed.data.name)
            return c.json({ ok: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to rename session'
            if (message.includes('concurrently') || message.includes('version')) {
                return c.json({ error: message }, 409)
            }
            return c.json({ error: message }, 500)
        }
    })

    app.delete('/sessions/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        if (sessionResult.session.active) {
            return c.json({ error: 'Cannot delete active session. Archive it first.' }, 409)
        }

        try {
            await engine.deleteSession(sessionResult.sessionId)
            return c.json({ ok: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete session'
            if (message.includes('active')) {
                return c.json({ error: message }, 409)
            }
            return c.json({ error: message }, 500)
        }
    })

    app.get('/sessions/:id/slash-commands', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const cached = sessionResult.session.metadata?.slashCommands
        const agent = sessionResult.session.metadata?.flavor ?? 'claude'

        const builtinNamesByAgent: Record<string, Set<string>> = {
            claude: new Set(['clear', 'compact', 'context', 'cost', 'doctor', 'plan', 'stats', 'status']),
            codex: new Set(['review', 'new', 'compat', 'undo', 'diff', 'status']),
            gemini: new Set(['about', 'clear', 'compress', 'stats'])
        }

        const builtinNames = builtinNamesByAgent[agent] ?? new Set<string>()
        const normalizeName = (rawName: string): string => {
            const trimmed = rawName.trim()
            return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
        }

        type SlashCommandSource = 'builtin' | 'user'
        const cachedCommands: Array<{ name: string; source: SlashCommandSource }> | null = (() => {
            if (!cached || !Array.isArray(cached)) {
                return null
            }

            return cached
                .filter((name): name is string => typeof name === 'string')
                .map(normalizeName)
                .filter((name) => name.length > 0)
                .map((name): { name: string; source: SlashCommandSource } => ({
                    name,
                    source: builtinNames.has(name) ? 'builtin' : 'user'
                }))
        })()

        const mergeCommands = (
            primary?: Array<Record<string, unknown>>,
            secondary?: Array<{ name: string; source: SlashCommandSource }> | null
        ): Array<Record<string, unknown>> => {
            const merged: Array<Record<string, unknown>> = []
            const seen = new Set<string>()

            const add = (cmd: Record<string, unknown>) => {
                const rawName = typeof cmd.name === 'string' ? cmd.name : null
                if (!rawName) {
                    return
                }

                const name = normalizeName(rawName)
                if (!name || seen.has(name)) {
                    return
                }

                seen.add(name)

                const entry: Record<string, unknown> = rawName === name
                    ? { ...cmd }
                    : { ...cmd, name }

                if (typeof entry.source !== 'string') {
                    entry.source = builtinNames.has(name) ? 'builtin' : 'user'
                }

                merged.push(entry)
            }

            if (Array.isArray(primary)) {
                for (const cmd of primary) {
                    add(cmd)
                }
            }

            if (secondary) {
                for (const cmd of secondary) {
                    add(cmd as unknown as Record<string, unknown>)
                }
            }

            return merged
        }

        try {
            const result = await engine.listSlashCommands(sessionResult.sessionId, agent)
            const merged = mergeCommands(result.commands as unknown as Array<Record<string, unknown>> | undefined, cachedCommands)

            if (merged.length > 0) {
                return c.json({ success: true, commands: merged })
            }

            if (!result.success && cachedCommands && cachedCommands.length > 0) {
                return c.json({ success: true, commands: cachedCommands })
            }

            return c.json(result)
        } catch (error) {
            if (cachedCommands && cachedCommands.length > 0) {
                return c.json({ success: true, commands: cachedCommands })
            }
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list slash commands'
            })
        }
    })

    return app
}
