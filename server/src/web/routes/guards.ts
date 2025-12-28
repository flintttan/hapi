import type { Context } from 'hono'
import type { Session, SyncEngine, Machine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

export function requireSyncEngine(
    c: Context<WebAppEnv>,
    getSyncEngine: () => SyncEngine | null
): SyncEngine | Response {
    const engine = getSyncEngine()
    if (!engine) {
        return c.json({ error: 'Not connected' }, 503)
    }
    return engine
}

export function requireSession(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    sessionId: string,
    userId: string,
    options?: { requireActive?: boolean }
): Session | Response {
    const session = engine.getSession(sessionId)
    if (!session) {
        // Return 404 to hide resource existence
        console.warn(`[Security] User ${userId} attempted to access non-existent session ${sessionId}`)
        return c.json({ error: 'Session not found' }, 404)
    }

    // Verify ownership
    if (session.userId !== userId) {
        // Return 404 to hide resource existence from unauthorized users
        console.warn(`[Security] User ${userId} attempted unauthorized access to session ${sessionId} owned by ${session.userId}`)
        return c.json({ error: 'Session not found' }, 404)
    }

    if (options?.requireActive && !session.active) {
        return c.json({ error: 'Session is inactive' }, 409)
    }
    return session
}

export function requireMachine(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    machineId: string,
    userId: string
): Machine | Response {
    const machine = engine.getMachine(machineId, userId)
    if (!machine) {
        // Return 404 to hide resource existence
        console.warn(`[Security] User ${userId} attempted to access non-existent machine ${machineId}`)
        return c.json({ error: 'Machine not found' }, 404)
    }

    return machine
}

export function requireSessionFromParam(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    userId: string,
    options?: { paramName?: string; requireActive?: boolean }
): { sessionId: string; session: Session } | Response {
    const paramName = options?.paramName ?? 'id'
    const sessionId = c.req.param(paramName)
    const session = requireSession(c, engine, sessionId, userId, { requireActive: options?.requireActive })
    if (session instanceof Response) {
        return session
    }
    return { sessionId, session }
}

export function requireUserOwnsResource<T extends Session | Machine>(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    resourceType: 'session' | 'machine',
    resourceId: string,
    userId: string
): T | Response {
    if (resourceType === 'session') {
        return requireSession(c, engine, resourceId, userId) as T | Response
    } else if (resourceType === 'machine') {
        return requireMachine(c, engine, resourceId, userId) as T | Response
    } else {
        return c.json({ error: 'Invalid resource type' }, 400)
    }
}

