import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import type { WebAppEnv } from '../../middleware/auth'
import { createMachinesRoutes } from '../machines'

function makeMachine(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        namespace: 'user-1',
        active: true,
        activeAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        seq: 1,
        metadata: {
            host: 'real-host',
            platform: 'darwin',
            happyCliVersion: '0.5.48',
        },
        metadataVersion: 1,
        runnerState: null,
        runnerStateVersion: 1,
        ...overrides,
    }
}

describe('Machines routes', () => {
    function createApp(engine: any) {
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('userId', 'user-1')
            c.set('namespace', 'user-1')
            await next()
        })
        app.route('/', createMachinesRoutes(() => engine))
        return app
    }

    test('PATCH /machines/:id/display-name updates machine display name', async () => {
        const machine = makeMachine('m1')
        const captureState: {
            captured?: { machineId: string; namespace: string; displayName: string | null }
        } = {}
        const updated = makeMachine('m1', {
            metadata: {
                host: 'real-host',
                platform: 'darwin',
                happyCliVersion: '0.5.48',
                displayName: 'Desk Mac'
            }
        })
        const engine = {
            getMachine: (machineId: string) => machineId === 'm1' ? machine : undefined,
            updateMachineDisplayName: (machineId: string, namespace: string, displayName: string | null) => {
                captureState.captured = { machineId, namespace, displayName }
                return updated
            }
        } as any

        const res = await createApp(engine).request('/machines/m1/display-name', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ displayName: 'Desk Mac' })
        })

        expect(res.status).toBe(200)
        const captured = captureState.captured
        if (!captured) {
            throw new Error('expected capture')
        }
        expect(captured.machineId).toBe('m1')
        expect(captured.namespace).toBe('user-1')
        expect(captured.displayName).toBe('Desk Mac')
        expect(await res.json()).toEqual({ machine: updated })
    })

    test('PATCH /machines/:id/display-name rejects cross-namespace machine access', async () => {
        const engine = {
            getMachine: () => makeMachine('m1', { namespace: 'user-2' })
        } as any

        const res = await createApp(engine).request('/machines/m1/display-name', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ displayName: 'Desk Mac' })
        })

        expect(res.status).toBe(403)
    })
})
