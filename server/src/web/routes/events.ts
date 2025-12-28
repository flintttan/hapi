import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { randomUUID } from 'node:crypto'
import type { SSEManager } from '../../sse/sseManager'
import type { WebAppEnv } from '../middleware/auth'

function parseOptionalId(value: string | undefined): string | null {
    if (!value) {
        return null
    }
    return value.trim() ? value : null
}

function parseBoolean(value: string | undefined): boolean {
    if (!value) {
        return false
    }
    return value === 'true' || value === '1'
}

export function createEventsRoutes(getSseManager: () => SSEManager | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/events', (c) => {
        // Improve behavior behind proxies (e.g. nginx/cloudflared) by disabling buffering.
        c.header('Cache-Control', 'no-cache')
        c.header('Connection', 'keep-alive')
        c.header('X-Accel-Buffering', 'no')

        const manager = getSseManager()
        if (!manager) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const query = c.req.query()
        const all = parseBoolean(query.all)
        const sessionId = parseOptionalId(query.sessionId)
        const machineId = parseOptionalId(query.machineId)
        const subscriptionId = randomUUID()

        // Extract userId from authenticated context
        const userId = c.get('userId') ?? null

        return streamSSE(c, async (stream) => {
            // Send an initial chunk immediately so intermediaries don't buffer the response.
            await stream.write(': connected\n\n')

            manager.subscribe({
                id: subscriptionId,
                all,
                sessionId,
                machineId,
                userId,
                send: (event) => stream.writeSSE({ data: JSON.stringify(event) }),
                sendHeartbeat: async () => {
                    await stream.write(': heartbeat\n\n')
                }
            })

            await new Promise<void>((resolve) => {
                const done = () => resolve()
                c.req.raw.signal.addEventListener('abort', done, { once: true })
                stream.onAbort(done)
            })

            manager.unsubscribe(subscriptionId)
        })
    })

    return app
}
