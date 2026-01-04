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

        const engine = {
            getSessionByNamespace: (sessionId: string, namespace: string) => sessionId === 's1' && namespace === 'user-1'
                ? {
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
                : undefined,
            deleteSession: () => true
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
        const engine = {
            getSessionByNamespace: (sessionId: string, namespace: string) => sessionId === 's1' && namespace === 'user-1'
                ? {
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
                : undefined,
            deleteSession: (sessionId: string) => {
                deletedSessionId = sessionId
                return true
            }
        } as any

        app.route('/', createSessionsRoutes(() => engine))

        const res = await app.request('/sessions/s1', { method: 'DELETE' })
        expect(res.status).toBe(204)
        expect(deletedSessionId).toBe('s1')
    })
})
