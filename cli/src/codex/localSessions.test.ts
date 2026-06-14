import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { loggerDebug } = vi.hoisted(() => ({
    loggerDebug: vi.fn()
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: loggerDebug
    }
}))

import { listLocalCodexSessions } from './localSessions'

const originalHome = process.env.HOME
const originalCodexHome = process.env.CODEX_HOME
const originalHapiCodexHome = process.env.HAPI_CODEX_HOME

function createTranscript(codexHome: string, sessionId: string, suffix: string): string {
    const sessionDir = join(codexHome, 'sessions', '2026', '06', '14')
    mkdirSync(sessionDir, { recursive: true })
    const transcriptPath = join(sessionDir, `rollout-${suffix}-${sessionId}.jsonl`)
    writeFileSync(transcriptPath, `${JSON.stringify({
        type: 'session_meta',
        payload: {
            id: sessionId,
            cwd: `/tmp/${suffix}`,
            originator: 'codex_cli_rs',
            cli_version: '0.0.0-test'
        }
    })}\n`, 'utf-8')
    return transcriptPath
}

describe('listLocalCodexSessions', () => {
    afterEach(() => {
        loggerDebug.mockReset()
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }
        if (originalCodexHome === undefined) {
            delete process.env.CODEX_HOME
        } else {
            process.env.CODEX_HOME = originalCodexHome
        }
        if (originalHapiCodexHome === undefined) {
            delete process.env.HAPI_CODEX_HOME
        } else {
            process.env.HAPI_CODEX_HOME = originalHapiCodexHome
        }
    })

    it('uses transcript file mtime as modifiedAt and sort key', () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-local-sessions-'))
        process.env.HOME = actualHome
        delete process.env.CODEX_HOME
        delete process.env.HAPI_CODEX_HOME

        try {
            const newerPath = createTranscript(join(actualHome, '.codex'), 'aaaaaaa1-1111-4111-8111-111111111111', 'newer')
            const olderPath = createTranscript(join(actualHome, '.codex'), 'bbbbbbb2-2222-4222-8222-222222222222', 'older')
            const newerTime = new Date('2026-06-14T12:00:00.000Z')
            const olderTime = new Date('2026-06-14T11:00:00.000Z')
            utimesSync(newerPath, newerTime, newerTime)
            utimesSync(olderPath, olderTime, olderTime)

            const sessions = listLocalCodexSessions(10)

            expect(sessions).toHaveLength(2)
            expect(sessions[0]).toEqual(expect.objectContaining({
                id: 'aaaaaaa1-1111-4111-8111-111111111111',
                modifiedAt: newerTime.getTime()
            }))
            expect(sessions[1]).toEqual(expect.objectContaining({
                id: 'bbbbbbb2-2222-4222-8222-222222222222',
                modifiedAt: olderTime.getTime()
            }))
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
        }
    })

    it('dedupes duplicate session ids by the newest transcript mtime', () => {
        const actualHome = mkdtempSync(join(tmpdir(), 'hapi-codex-local-sessions-dedupe-'))
        process.env.HOME = actualHome
        delete process.env.CODEX_HOME
        delete process.env.HAPI_CODEX_HOME

        try {
            const oldPath = createTranscript(join(actualHome, '.codex'), 'ccccccc3-3333-4333-8333-333333333333', 'old')
            const newPath = createTranscript(join(actualHome, '.codex'), 'ccccccc3-3333-4333-8333-333333333333', 'new')
            const oldTime = new Date('2026-06-14T10:00:00.000Z')
            const newTime = new Date('2026-06-14T13:00:00.000Z')
            utimesSync(oldPath, oldTime, oldTime)
            utimesSync(newPath, newTime, newTime)

            const sessions = listLocalCodexSessions(10)

            expect(sessions).toHaveLength(1)
            expect(sessions[0]).toEqual(expect.objectContaining({
                id: 'ccccccc3-3333-4333-8333-333333333333',
                file: newPath,
                modifiedAt: newTime.getTime()
            }))
        } finally {
            rmSync(actualHome, { recursive: true, force: true })
        }
    })
})
