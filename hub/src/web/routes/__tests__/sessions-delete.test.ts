import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import type { WebAppEnv } from '../../middleware/auth'
import { createSessionsRoutes } from '../sessions'

function makeSession(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        namespace: 'user-1',
        seq: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: false,
        activeAt: Date.now(),
        metadata: { path: '/tmp', host: 'test' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        permissionMode: null,
        modelMode: null,
        ...overrides,
    }
}

function createApp(engine: any) {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('userId', 'user-1')
        c.set('namespace', 'user-1')
        await next()
    })
    app.route('/', createSessionsRoutes(() => engine))
    return app
}

describe('Sessions routes - delete', () => {
    test('DELETE /sessions/:id returns 409 when active', async () => {
        const session = makeSession('s1', { active: true })
        const engine = {
            getSession: (sessionId: string) => (sessionId === 's1' ? session : null),
            getSessionByNamespace: (sessionId: string, namespace: string) => sessionId === 's1' && namespace === 'user-1' ? session : undefined,
            resolveSessionAccess: (sessionId: string, namespace: string) => {
                const scoped = sessionId === 's1' && namespace === 'user-1' ? session : undefined
                if (scoped) {
                    return { ok: true, sessionId, session: scoped }
                }
                const anySession = sessionId === 's1' ? session : null
                if (anySession) {
                    return { ok: false, reason: 'access-denied' as const }
                }
                return { ok: false, reason: 'not-found' as const }
            },
            deleteSession: async () => {}
        } as any

        const res = await createApp(engine).request('/sessions/s1', { method: 'DELETE' })
        expect(res.status).toBe(409)
    })

    test('DELETE /sessions/:id returns 200 when deleted', async () => {
        let deletedSessionId = ''
        const session = makeSession('s1')
        const engine = {
            getSession: (sessionId: string) => (sessionId === 's1' ? session : null),
            getSessionByNamespace: (sessionId: string, namespace: string) => sessionId === 's1' && namespace === 'user-1' ? session : undefined,
            resolveSessionAccess: (sessionId: string, namespace: string) => {
                const scoped = sessionId === 's1' && namespace === 'user-1' ? session : undefined
                if (scoped) {
                    return { ok: true, sessionId, session: scoped }
                }
                const anySession = sessionId === 's1' ? session : null
                if (anySession) {
                    return { ok: false, reason: 'access-denied' as const }
                }
                return { ok: false, reason: 'not-found' as const }
            },
            deleteSession: async (sessionId: string) => {
                deletedSessionId = sessionId
            }
        } as any

        const res = await createApp(engine).request('/sessions/s1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        expect(deletedSessionId).toBe('s1')
    })

    test('POST /sessions/bulk-delete deletes inactive sessions', async () => {
        const sessions = new Map([
            ['s1', makeSession('s1')],
            ['s2', makeSession('s2')],
        ])
        const deleted: string[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => {
                const session = sessions.get(sessionId)
                if (session && namespace === 'user-1') return { ok: true, sessionId, session }
                return { ok: false, reason: 'not-found' as const }
            },
            deleteSession: async (sessionId: string) => {
                deleted.push(sessionId)
            }
        } as any

        const res = await createApp(engine).request('/sessions/bulk-delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionIds: ['s1', 's1', 's2'] })
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, deletedSessionIds: ['s1', 's2'] })
        expect(deleted).toEqual(['s1', 's2'])
    })

    test('POST /sessions/bulk-delete rejects active sessions before deleting anything', async () => {
        const sessions = new Map([
            ['s1', makeSession('s1')],
            ['s2', makeSession('s2', { active: true })],
        ])
        const deleted: string[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => {
                const session = sessions.get(sessionId)
                if (session && namespace === 'user-1') return { ok: true, sessionId, session }
                return { ok: false, reason: 'not-found' as const }
            },
            deleteSession: async (sessionId: string) => {
                deleted.push(sessionId)
            }
        } as any

        const res = await createApp(engine).request('/sessions/bulk-delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionIds: ['s1', 's2'] })
        })

        expect(res.status).toBe(409)
        expect(deleted).toEqual([])
    })

    test('POST /sessions/bulk-archive archives sessions in batch', async () => {
        const sessions = new Map([
            ['s1', makeSession('s1')],
            ['s2', makeSession('s2', { active: true })],
        ])
        const archived: string[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => {
                const session = sessions.get(sessionId)
                if (session && namespace === 'user-1') return { ok: true, sessionId, session }
                return { ok: false, reason: 'not-found' as const }
            },
            archiveSession: async (sessionId: string) => {
                archived.push(sessionId)
            }
        } as any

        const res = await createApp(engine).request('/sessions/bulk-archive', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionIds: ['s1', 's1', 's2'] })
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, archivedSessionIds: ['s1', 's2'] })
        expect(archived).toEqual(['s1', 's2'])
    })
})
