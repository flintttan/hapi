import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import type { WebAppEnv } from '../../middleware/auth'
import { createSessionsRoutes } from '../sessions'

describe('Sessions routes - delete', () => {
    test('DELETE /sessions/:id returns 409 when active', async () => {
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('userId', 'user-1')
            c.set('namespace', 'user-1')
            await next()
        })

        const session = {
            id: 's1',
            namespace: 'user-1',
            seq: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            active: true,
            activeAt: Date.now(),
            metadata: { path: '/tmp', host: 'test' },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 0,
            permissionMode: null,
            modelMode: null
        }
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

        app.route('/', createSessionsRoutes(() => engine))

        const res = await app.request('/sessions/s1', { method: 'DELETE' })
        expect(res.status).toBe(409)
    })

    test('DELETE /sessions/:id returns 204 when deleted', async () => {
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('userId', 'user-1')
            c.set('namespace', 'user-1')
            await next()
        })

        let deletedSessionId = ''
        const session = {
            id: 's1',
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
            modelMode: null
        }
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

        app.route('/', createSessionsRoutes(() => engine))

        const res = await app.request('/sessions/s1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        expect(deletedSessionId).toBe('s1')
    })
})
