import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMachineMetadata, buildSessionMetadata } from './sessionFactory'
import { readSettings } from '@/persistence'

vi.mock('@/persistence', () => ({
    readSettings: vi.fn(async () => ({})),
}))

describe('buildSessionMetadata', () => {
    const originalHostname = process.env.HAPI_HOSTNAME
    const originalDisplayName = process.env.HAPI_MACHINE_DISPLAY_NAME

    afterEach(() => {
        if (originalHostname === undefined) {
            delete process.env.HAPI_HOSTNAME
        } else {
            process.env.HAPI_HOSTNAME = originalHostname
        }
        if (originalDisplayName === undefined) {
            delete process.env.HAPI_MACHINE_DISPLAY_NAME
        } else {
            process.env.HAPI_MACHINE_DISPLAY_NAME = originalDisplayName
        }
        vi.mocked(readSettings).mockResolvedValue({})
    })

    it('uses HAPI_HOSTNAME for session metadata host when provided', () => {
        process.env.HAPI_HOSTNAME = 'custom-session-host'

        const metadata = buildSessionMetadata({
            flavor: 'codex',
            startedBy: 'terminal',
            workingDirectory: '/tmp/project',
            machineId: 'machine-1',
            now: 123
        })

        expect(metadata.host).toBe('custom-session-host')
    })

    it('uses custom machine displayName without overriding real host', async () => {
        process.env.HAPI_HOSTNAME = 'real-host'
        process.env.HAPI_MACHINE_DISPLAY_NAME = 'Desk Mac'

        const metadata = await buildMachineMetadata()

        expect(metadata.host).toBe('real-host')
        expect(metadata.displayName).toBe('Desk Mac')
    })

    it('reads machine displayName from persisted settings', async () => {
        vi.mocked(readSettings).mockResolvedValue({ machineDisplayName: 'Lab Mini' })

        const metadata = await buildMachineMetadata()

        expect(metadata.displayName).toBe('Lab Mini')
    })
})
