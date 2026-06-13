import { afterEach, describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'node:events'
import { Hono } from 'hono'
import { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

const originalPlatform = process.platform

function makeChildProcessMock(record: { spawnCalls: Array<{ command: string; args: string[] }>; spawnSyncCalls: Array<{ command: string; args: string[] }> }) {
    class FakeChild extends EventEmitter {
        pid = 4321
        stdout = { on: () => {} }
        stderr = { on: () => {} }
        kill() {}
        once(event: string, listener: (...args: any[]) => void) {
            this.on(event, listener)
            return this
        }
        off(event: string, listener: (...args: any[]) => void) {
            this.removeListener(event, listener)
            return this
        }
    }

    return {
        spawn: (command: string, args: string[]) => {
            record.spawnCalls.push({ command, args })
            const child = new FakeChild()
            queueMicrotask(() => {
                child.emit('spawn')
                child.emit('exit', 0, null)
            })
            return child
        },
        spawnSync: (command: string, args: string[]) => {
            record.spawnSyncCalls.push({ command, args })
            if (command === 'zsh' && args[0] === '-lc') {
                return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' }
            }
            if (command === 'open') {
                return { status: 0, stdout: '', stderr: '' }
            }
            return { status: 1, stdout: '', stderr: '' }
        }
    }
}

describe('Codex Desktop restart on macOS', () => {
    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('detects codex launcher and starts codex app command', async () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' })

        const record = {
            spawnCalls: [] as Array<{ command: string; args: string[] }>,
            spawnSyncCalls: [] as Array<{ command: string; args: string[] }>
        }
        mock.module('node:child_process', () => makeChildProcessMock(record))

        const mod = await import('./codexDesktop')
        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'team-a')
            await next()
        })
        app.route('/api', mod.createCodexDesktopRoutes({
            store: new Store(':memory:'),
            getSyncEngine: () => null as unknown as SyncEngine
        }))

        const statusResponse = await app.request('/api/codex/status')
        expect(statusResponse.status).toBe(200)
        expect(await statusResponse.json()).toEqual({
            success: true,
            codexDesktopRunning: false,
            codexClientAvailable: true,
            codexTranscriptImportAvailable: true
        })

        const restartResponse = await app.request('/api/codex/restart-desktop', { method: 'POST' })
        expect(restartResponse.status).toBe(200)
        expect(await restartResponse.json()).toMatchObject({
            success: true,
            codexClientAvailable: true
        })
        expect(record.spawnCalls[0]?.command).toContain('codex')
        expect(record.spawnCalls[0]).toMatchObject({
            args: ['app', process.cwd()]
        })
    })
})
