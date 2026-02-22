import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import type { WebAppEnv } from '../../middleware/auth'
import { createMessagesRoutes } from '../messages'
import { createSessionsRoutes } from '../sessions'

describe('Web routes call SyncEngine with userId', () => {
    test('GET /sessions uses engine.getSessionsByNamespace(namespace)', async () => {
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('userId', 'user-1')
            c.set('namespace', 'user-1')
            await next()
        })

        let capturedNamespace = ''
        const engine = {
            getSessionsByNamespace: (namespace: string) => {
                capturedNamespace = namespace
                return []
            }
        } as any

        app.route('/', createSessionsRoutes(() => engine))

        const res = await app.request('/sessions', { method: 'GET' })
        expect(res.status).toBe(200)
        expect(capturedNamespace).toBe('user-1')
    })

    test('GET/POST /sessions/:id/messages uses namespace in SyncEngine calls', async () => {
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('userId', 'user-1')
            c.set('namespace', 'user-1')
            await next()
        })

        const session = {
            id: 's1',
            namespace: 'user-1',
            active: true,
            activeAt: Date.now(),
            updatedAt: Date.now(),
            thinking: false,
            thinkingAt: 0,
            metadata: { path: '/tmp' },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 1,
            todos: null,
            permissionMode: null,
            modelMode: null
        }

        const calls: Array<{ method: string; sessionId: string; options?: any; payload?: any }> = []
        const engine = {
            getSession: (sessionId: string) => (sessionId === 's1' ? session : null),
            getSessionByNamespace: (sessionId: string, namespace: string) => (sessionId === 's1' && namespace === 'user-1' ? session : undefined),
            getMessagesPage: (sessionId: string, options: { limit: number; beforeSeq: number | null }) => {
                calls.push({ method: 'getMessagesPage', sessionId, options })
                return {
                    messages: [],
                    page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false }
                }
            },
            sendMessage: async (sessionId: string, payload: { text: string; localId?: string; sentFrom?: string }) => {
                calls.push({ method: 'sendMessage', sessionId, payload })
            }
        } as any

        app.route('/', createMessagesRoutes(() => engine))

        const getRes = await app.request('/sessions/s1/messages?limit=50', { method: 'GET' })
        expect(getRes.status).toBe(200)

        const postRes = await app.request('/sessions/s1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'hi' })
        })
        expect(postRes.status).toBe(200)

        expect(calls).toEqual([
            { method: 'getMessagesPage', sessionId: 's1', options: { limit: 50, beforeSeq: null } },
            { method: 'sendMessage', sessionId: 's1', payload: { text: 'hi', localId: undefined, sentFrom: 'webapp' } }
        ])
    })
})
