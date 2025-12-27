import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine, requireSyncEngine } from './guards'

const spawnBodySchema = z.object({
    directory: z.string().min(1),
    agent: z.enum(['claude', 'codex', 'gemini']).optional()
})

export function createMachinesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/machines', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const userId = c.get('userId') as string
        if (!userId) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const machines = engine.getOnlineMachines().filter(m => m.userId === userId)
        return c.json({ machines })
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const userId = c.get('userId') as string
        if (!userId) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId, userId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = spawnBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const result = await engine.spawnSession(machineId, parsed.data.directory, parsed.data.agent)
        return c.json(result)
    })

    return app
}
