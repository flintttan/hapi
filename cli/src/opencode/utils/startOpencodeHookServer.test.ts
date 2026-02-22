import { describe, it, expect } from 'vitest'
import { request } from 'node:http'
import { startOpencodeHookServer } from './startOpencodeHookServer'

const sendHookRequest = async (
    port: number,
    body: string,
    token?: string
): Promise<{ statusCode?: number; body: string }> => {
    return await new Promise((resolve, reject) => {
        const headers: Record<string, string | number> = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
        if (token) {
            headers['x-hapi-hook-token'] = token
        }

        const req = request({
            host: '127.0.0.1',
            port,
            path: '/hook/opencode',
            method: 'POST',
            headers
        }, (res) => {
            const chunks: Buffer[] = []
            res.on('data', (chunk) => chunks.push(chunk as Buffer))
            res.on('error', reject)
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf-8')
                })
            })
        })

        req.on('error', reject)
        req.end(body)
    })
}

describe('startOpencodeHookServer', () => {
    it('forwards hook payload to callback', async () => {
        let received: { event?: string; payload?: unknown; sessionId?: string } = {}
        const server = await startOpencodeHookServer({
            onEvent: (event) => {
                received = event
            }
        })

        try {
            const body = JSON.stringify({
                event: 'message.updated',
                payload: { message: 'ok' },
                sessionId: 'session-123'
            })
            const response = await sendHookRequest(server.port, body, server.token)
            expect(response.statusCode).toBe(200)
        } finally {
            server.stop()
        }

        expect(received.event).toBe('message.updated')
        expect(received.sessionId).toBe('session-123')
        expect(received.payload).toEqual({ message: 'ok' })
    })

    it('returns 400 for invalid JSON payloads', async () => {
        let hookCalled = false
        const server = await startOpencodeHookServer({
            onEvent: () => {
                hookCalled = true
            }
        })

        try {
            const response = await sendHookRequest(server.port, '{"event":', server.token)
            expect(response.statusCode).toBe(400)
            expect(response.body).toBe('invalid json')
        } finally {
            server.stop()
        }

        expect(hookCalled).toBe(false)
    })

    it('returns 422 when event is missing', async () => {
        let hookCalled = false
        const server = await startOpencodeHookServer({
            onEvent: () => {
                hookCalled = true
            }
        })

        try {
            const body = JSON.stringify({ payload: { ok: true } })
            const response = await sendHookRequest(server.port, body, server.token)
            expect(response.statusCode).toBe(422)
            expect(response.body).toBe('missing event')
        } finally {
            server.stop()
        }

        expect(hookCalled).toBe(false)
    })

    it('returns 401 when hook token is missing', async () => {
        let hookCalled = false
        const server = await startOpencodeHookServer({
            onEvent: () => {
                hookCalled = true
            }
        })

        try {
            const body = JSON.stringify({ event: 'message.updated', payload: { ok: true } })
            const response = await sendHookRequest(server.port, body)
            expect(response.statusCode).toBe(401)
            expect(response.body).toBe('unauthorized')
        } finally {
            server.stop()
        }

        expect(hookCalled).toBe(false)
    })
})
