import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('Machine store metadata refresh', () => {
    it('refreshes stored metadata and runner state when machine re-registers in same namespace', () => {
        const store = new Store(':memory:')

        const created = store.machines.getOrCreateMachine(
            'machine-1',
            { host: 'real-host', platform: 'darwin', happyCliVersion: '0.5.48' },
            { status: 'running' },
            'user-1'
        )

        const refreshed = store.machines.getOrCreateMachine(
            'machine-1',
            { host: 'real-host', platform: 'darwin', happyCliVersion: '0.5.49', displayName: 'Desk Mac' },
            { status: 'shutting-down' },
            'user-1'
        )

        expect(refreshed.metadata).toEqual({
            host: 'real-host',
            platform: 'darwin',
            happyCliVersion: '0.5.49',
            displayName: 'Desk Mac',
        })
        expect(refreshed.metadataVersion).toBe(created.metadataVersion + 1)
        expect(refreshed.runnerState).toEqual({ status: 'shutting-down' })
        expect(refreshed.runnerStateVersion).toBe(created.runnerStateVersion + 1)
    })

    it('preserves customized displayName when runner metadata refresh omits it', () => {
        const store = new Store(':memory:')

        store.machines.getOrCreateMachine(
            'machine-1',
            { host: 'real-host', platform: 'darwin', happyCliVersion: '0.5.49', displayName: 'Desk Mac' },
            { status: 'running' },
            'user-1'
        )

        const refreshed = store.machines.getOrCreateMachine(
            'machine-1',
            { host: 'real-host', platform: 'darwin', happyCliVersion: '0.5.49' },
            { status: 'running' },
            'user-1'
        )

        expect(refreshed.metadata).toEqual({
            host: 'real-host',
            platform: 'darwin',
            happyCliVersion: '0.5.49',
            displayName: 'Desk Mac',
        })
    })
})
