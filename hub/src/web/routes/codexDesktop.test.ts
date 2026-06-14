import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { AGENT_MESSAGE_PAYLOAD_TYPE } from '@hapi/protocol'
import { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createCodexDesktopRoutes, importSelectedCodexSessions } from './codexDesktop'

const originalCodexHome = process.env.CODEX_HOME
const originalHome = process.env.HOME
const originalHapiCodexHome = process.env.HAPI_CODEX_HOME

function createTranscript(codexHome: string, sessionId: string): void {
    const sessionDir = join(codexHome, 'sessions', '2026', '06', '04')
    mkdirSync(sessionDir, { recursive: true })
    const transcriptPath = join(sessionDir, `rollout-${sessionId}.jsonl`)
    const lines = [
        {
            type: 'session_meta',
            payload: {
                id: sessionId,
                cwd: 'C:\\work\\project',
                originator: 'codex_cli_rs',
                cli_version: '0.0.0-test'
            }
        },
        {
            type: 'response_item',
            payload: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'normal user message' }]
            }
        },
        {
            type: 'response_item',
            payload: {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'normal assistant message' }]
            }
        }
    ]
    writeFileSync(transcriptPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf-8')
}

function createRoutesApp(namespace: string): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', namespace)
        await next()
    })
    app.route('/api', createCodexDesktopRoutes({
        store: new Store(':memory:'),
        getSyncEngine: () => null
    }))
    return app
}

describe('Codex Desktop import routes', () => {
    afterEach(() => {
        if (originalCodexHome === undefined) {
            delete process.env.CODEX_HOME
        } else {
            process.env.CODEX_HOME = originalCodexHome
        }
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }
        if (originalHapiCodexHome === undefined) {
            delete process.env.HAPI_CODEX_HOME
        } else {
            process.env.HAPI_CODEX_HOME = originalHapiCodexHome
        }
    })

    it('imports normal response_item chat messages', async () => {
        const codexHome = mkdtempSync(join(tmpdir(), 'hapi-codex-home-test-'))
        const store = new Store(':memory:')
        const codexSessionId = '11111111-1111-4111-8111-111111111111'
        process.env.CODEX_HOME = codexHome

        try {
            createTranscript(codexHome, codexSessionId)

            const result = await importSelectedCodexSessions({
                codexSessionIds: [codexSessionId],
                store,
                namespace: 'default',
                getSyncEngine: () => null
            })

            expect(result.success).toBe(true)
            const session = store.sessions.getSessionsByNamespace('default')[0]
            expect(session).toBeDefined()
            const messages = store.messages.getAllMessages(session.id)
            expect(messages).toHaveLength(2)
            expect(messages[0].content).toEqual({
                role: 'user',
                content: {
                    type: 'text',
                    text: 'normal user message'
                },
                meta: {
                    sentFrom: 'cli'
                }
            })
            expect(messages[1].content).toEqual({
                role: 'agent',
                content: {
                    type: AGENT_MESSAGE_PAYLOAD_TYPE,
                    data: {
                        type: 'message',
                        message: 'normal assistant message',
                        id: expect.any(String)
                    }
                },
                meta: {
                    sentFrom: 'cli'
                }
            })
        } finally {
            store.close()
            rmSync(codexHome, { recursive: true, force: true })
        }
    })

    it('exposes namespace availability in codex status', async () => {
        const app = createRoutesApp('team-a')
        const response = await app.request('/api/codex/status')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            success: true,
            codexDesktopRunning: false,
            codexClientAvailable: true,
            codexTranscriptImportAvailable: true
        })
    })

    it('allows Codex transcript endpoints for non-default namespaces', async () => {
        const codexHome = mkdtempSync(join(tmpdir(), 'hapi-codex-home-route-test-'))
        const isolatedHome = mkdtempSync(join(tmpdir(), 'hapi-codex-isolated-home-'))
        process.env.CODEX_HOME = codexHome
        process.env.HOME = isolatedHome

        try {
            // Ensure the test home exists but is empty so the route returns no sessions.
            mkdirSync(join(codexHome, 'sessions'), { recursive: true })
            const app = createRoutesApp('team-a')
            const response = await app.request('/api/codex/sessions')

            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
                success: true,
                sessions: []
            })
        } finally {
            rmSync(isolatedHome, { recursive: true, force: true })
            rmSync(codexHome, { recursive: true, force: true })
        }
    })

    it('allows Codex transcript endpoints in the default namespace', async () => {
        const codexHome = mkdtempSync(join(tmpdir(), 'hapi-codex-home-route-test-'))
        const isolatedHome = mkdtempSync(join(tmpdir(), 'hapi-codex-isolated-home-'))
        process.env.CODEX_HOME = codexHome
        process.env.HOME = isolatedHome

        try {
            mkdirSync(join(codexHome, 'sessions'), { recursive: true })
            const app = createRoutesApp('default')
            const response = await app.request('/api/codex/sessions')

            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
                success: true,
                sessions: []
            })
        } finally {
            rmSync(isolatedHome, { recursive: true, force: true })
            rmSync(codexHome, { recursive: true, force: true })
        }
    })

    it('lists local Codex sessions from the real home when CODEX_HOME points to a temporary auth directory', async () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-real-home-'))
        const temporaryCodexHome = mkdtempSync(join(tmpdir(), 'hapi-codex-temp-home-'))
        const codexSessionId = '22222222-2222-4222-8222-222222222222'
        process.env.HOME = actualHome
        process.env.CODEX_HOME = temporaryCodexHome

        try {
            createTranscript(join(actualHome, '.codex'), codexSessionId)
            writeFileSync(join(temporaryCodexHome, 'auth.json'), '{"token":"fixture"}', 'utf-8')

            const app = createRoutesApp('default')
            const response = await app.request('/api/codex/sessions')

            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
                success: true,
                sessions: [
                    expect.objectContaining({
                        id: codexSessionId,
                        cwd: 'C:\\work\\project',
                        originator: 'codex_cli_rs',
                        cliVersion: '0.0.0-test'
                    })
                ]
            })
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
            rmSync(temporaryCodexHome, { recursive: true, force: true })
        }
    })

    it('prefers HAPI_CODEX_HOME for transcript discovery', async () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-home-'))
        const configuredImportHome = mkdtempSync(join(tmpdir(), 'hapi-codex-import-home-'))
        const codexSessionId = '33333333-3333-4333-8333-333333333333'
        process.env.HOME = actualHome
        process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'hapi-codex-runtime-home-'))
        process.env.HAPI_CODEX_HOME = configuredImportHome

        try {
            writeFileSync(join(process.env.CODEX_HOME, 'auth.json'), '{"token":"fixture"}', 'utf-8')
            createTranscript(join(configuredImportHome), codexSessionId)

            const app = createRoutesApp('default')
            const response = await app.request('/api/codex/sessions')

            expect(response.status).toBe(200)
            const body = await response.json() as { success: true; sessions: Array<{ id: string }> }
            expect(body).toEqual({
                success: true,
                sessions: [
                    expect.objectContaining({
                        id: codexSessionId
                    })
                ]
            })
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
            rmSync(configuredImportHome, { recursive: true, force: true })
            rmSync(process.env.CODEX_HOME ?? '', { recursive: true, force: true })
        }
    })

    it('falls back to the real home when HAPI_CODEX_HOME exists but has no transcripts', async () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-home-fallback-'))
        const emptyImportHome = mkdtempSync(join(tmpdir(), 'hapi-codex-empty-import-home-'))
        const codexSessionId = '44444444-4444-4444-8444-444444444444'
        process.env.HOME = actualHome
        process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'hapi-codex-runtime-home-fallback-'))
        process.env.HAPI_CODEX_HOME = emptyImportHome

        try {
            writeFileSync(join(process.env.CODEX_HOME, 'auth.json'), '{"token":"fixture"}', 'utf-8')
            createTranscript(join(actualHome, '.codex'), codexSessionId)

            const app = createRoutesApp('default')
            const response = await app.request('/api/codex/sessions')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body).toEqual({
                success: true,
                sessions: [
                    expect.objectContaining({
                        id: codexSessionId
                    })
                ]
            })
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
            rmSync(emptyImportHome, { recursive: true, force: true })
            rmSync(process.env.CODEX_HOME ?? '', { recursive: true, force: true })
        }
    })

    it('does not fall back when HAPI_CODEX_HOME already has transcripts', async () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-home-no-fallback-'))
        const configuredImportHome = mkdtempSync(join(tmpdir(), 'hapi-codex-import-home-no-fallback-'))
        const fallbackSessionId = '55555555-5555-4555-8555-555555555555'
        const importSessionId = '66666666-6666-4666-8666-666666666666'
        process.env.HOME = actualHome
        process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'hapi-codex-runtime-home-no-fallback-'))
        process.env.HAPI_CODEX_HOME = configuredImportHome

        try {
            writeFileSync(join(process.env.CODEX_HOME, 'auth.json'), '{"token":"fixture"}', 'utf-8')
            createTranscript(join(actualHome, '.codex'), fallbackSessionId)
            createTranscript(join(configuredImportHome), importSessionId)

            const app = createRoutesApp('default')
            const response = await app.request('/api/codex/sessions')

            expect(response.status).toBe(200)
            const body = await response.json() as { success: true; sessions: Array<{ id: string }> }
            expect(body.success).toBe(true)
            expect(body.sessions).toHaveLength(1)
            expect(body.sessions[0]).toEqual(expect.objectContaining({
                id: importSessionId
            }))
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
            rmSync(configuredImportHome, { recursive: true, force: true })
            rmSync(process.env.CODEX_HOME ?? '', { recursive: true, force: true })
        }
    })

    it('falls back to local transcript import when an older runner has not registered getCodexTranscriptImportData', async () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-machine-home-'))
        const codexSessionId = '66666666-6666-4666-8666-666666666666'
        process.env.HOME = actualHome

        try {
            createTranscript(join(actualHome, '.codex'), codexSessionId)
            const store = new Store(':memory:')
            const engine = {
                getMachine: () => ({
                    id: 'machine-1',
                    namespace: 'default',
                    seq: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    active: true,
                    activeAt: 1,
                    metadata: {
                        host: hostname(),
                        platform: 'darwin',
                        happyCliVersion: '1.0.0',
                        homeDir: actualHome
                    },
                    metadataVersion: 1,
                    runnerState: null,
                    runnerStateVersion: 1
                }),
                getSessionsByNamespace: () => [],
                getOrCreateSession: (id: string, metadata: Record<string, unknown>, agentState: Record<string, unknown>, namespace: string) => (
                    store.sessions.getOrCreateSession(id, metadata, agentState, namespace)
                ),
                recordSessionActivity: () => {},
                getCodexTranscriptImportDataForMachine: async () => {
                    throw new Error('RPC handler not registered: machine-1:getCodexTranscriptImportData')
                }
            } as Partial<SyncEngine>

            const app = new Hono<WebAppEnv>()
            app.use('*', async (c, next) => {
                c.set('namespace', 'default')
                await next()
            })
            app.route('/api', createCodexDesktopRoutes({
                store,
                getSyncEngine: () => engine as SyncEngine
            }))

            const response = await app.request('/api/codex/sync-session-from-machine', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    machineId: 'machine-1',
                    sessionIds: [codexSessionId]
                })
            })

            expect(response.status).toBe(200)
            const body = await response.json() as { success: boolean; syncedCount?: number }
            expect(body.success).toBe(true)
            expect(body.syncedCount).toBe(1)

            const session = store.sessions.getSessionsByNamespace('default')[0]
            expect(session).toBeDefined()
            const messages = store.messages.getAllMessages(session.id)
            expect(messages).toHaveLength(2)
            store.close()
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
        }
    })
})
