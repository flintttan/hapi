import { describe, expect, it, vi } from 'vitest'
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

describe('listLocalCodexSessions summary scanner', () => {
    it('reads large transcripts without loading the whole file', () => {
        const home = mkdtempSync(join(tmpdir(), 'hapi-codex-summary-'))
        const codexHome = join(home, '.codex')
        const sessionId = 'ddddddd4-4444-4444-8444-444444444444'
        const sessionDir = join(codexHome, 'sessions', '2026', '06', '14')
        mkdirSync(sessionDir, { recursive: true })
        const transcriptPath = join(sessionDir, `rollout-large-${sessionId}.jsonl`)
        const filler = 'x'.repeat(3 * 1024 * 1024)
        writeFileSync(transcriptPath, [
            JSON.stringify({
                type: 'session_meta',
                payload: { id: sessionId, cwd: '/tmp/large', originator: 'codex_cli_rs', cli_version: '0.0.0-test' }
            }),
            filler,
            JSON.stringify({
                type: 'response_item',
                payload: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'large transcript message' }]
                }
            })
        ].join('\n'), 'utf-8')
        const transcriptTime = new Date('2026-06-14T14:00:00.000Z')
        utimesSync(transcriptPath, transcriptTime, transcriptTime)
        const originalHome = process.env.HOME
        process.env.HOME = home

        try {
            const sessions = listLocalCodexSessions(10)
            expect(sessions).toEqual([
                expect.objectContaining({
                    id: sessionId,
                    modifiedAt: transcriptTime.getTime()
                })
            ])
        } finally {
            if (originalHome === undefined) {
                delete process.env.HOME
            } else {
                process.env.HOME = originalHome
            }
            rmSync(home, { recursive: true, force: true })
        }
    })
})
