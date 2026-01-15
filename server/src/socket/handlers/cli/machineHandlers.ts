import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Store, StoredMachine } from '../../../store'
import type { SyncEvent } from '../../../sync/syncEngine'
import type { SocketWithData } from '../../socketTypes'

type MachineAlivePayload = {
    machineId: string
    time: number
}

type AccessErrorReason = 'namespace-missing' | 'access-denied' | 'not-found'

type AccessResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: AccessErrorReason }

type ResolveMachineAccess = (machineId: string) => AccessResult<StoredMachine>

type EmitAccessError = (scope: 'session' | 'machine', id: string, reason: AccessErrorReason) => void

const machineUpdateMetadataSchema = z.object({
    machineId: z.string(),
    expectedVersion: z.number().int(),
    metadata: z.unknown()
})

const machineUpdateStateSchema = z.object({
    machineId: z.string(),
    expectedVersion: z.number().int(),
    daemonState: z.unknown().nullable()
})

export type MachineHandlersDeps = {
    store: Store
    resolveMachineAccess: ResolveMachineAccess
    emitAccessError: EmitAccessError
    onMachineAlive?: (payload: MachineAlivePayload) => void
    onWebappEvent?: (event: SyncEvent) => void
}

export function registerMachineHandlers(socket: SocketWithData, deps: MachineHandlersDeps): void {
    const { store, resolveMachineAccess, emitAccessError, onMachineAlive, onWebappEvent } = deps

    socket.on('machine-alive', (data: MachineAlivePayload) => {
        if (!data || typeof data.machineId !== 'string' || typeof data.time !== 'number') {
            return
        }
        const machineAccess = resolveMachineAccess(data.machineId)
        if (!machineAccess.ok) {
            emitAccessError('machine', data.machineId, machineAccess.reason)
            return
        }
        onMachineAlive?.(data)
    })

    const handleMachineMetadataUpdate = (data: unknown, cb: (answer: unknown) => void) => {
        const parsed = machineUpdateMetadataSchema.safeParse(data)
        if (!parsed.success) {
            cb({ result: 'error' })
            return
        }

        const { machineId: id, metadata, expectedVersion } = parsed.data
        const machineAccess = resolveMachineAccess(id)
        if (!machineAccess.ok) {
            cb({ result: 'error', reason: machineAccess.reason })
            return
        }

        const result = store.machines.updateMachineMetadata(id, metadata, expectedVersion, machineAccess.value.namespace)
        if (result.result === 'success') {
            cb({ result: 'success', version: result.version, metadata: result.value })
        } else if (result.result === 'version-mismatch') {
            cb({ result: 'version-mismatch', version: result.version, metadata: result.value })
        } else {
            cb({ result: 'error' })
        }

        if (result.result === 'success') {
            const update = {
                id: randomUUID(),
                seq: Date.now(),
                createdAt: Date.now(),
                body: {
                    t: 'update-machine' as const,
                    machineId: id,
                    metadata: { version: result.version, value: metadata },
                    daemonState: null
                }
            }
            socket.to(`machine:${id}`).emit('update', update)
            onWebappEvent?.({ type: 'machine-updated', machineId: id, data: { id } })
        }
    }

    const handleMachineStateUpdate = (data: unknown, cb: (answer: unknown) => void) => {
        const parsed = machineUpdateStateSchema.safeParse(data)
        if (!parsed.success) {
            cb({ result: 'error' })
            return
        }

        const { machineId: id, daemonState, expectedVersion } = parsed.data
        const machineAccess = resolveMachineAccess(id)
        if (!machineAccess.ok) {
            cb({ result: 'error', reason: machineAccess.reason })
            return
        }

        const result = store.machines.updateMachineDaemonState(
            id,
            daemonState,
            expectedVersion,
            machineAccess.value.namespace
        )
        if (result.result === 'success') {
            cb({ result: 'success', version: result.version, daemonState: result.value })
        } else if (result.result === 'version-mismatch') {
            cb({ result: 'version-mismatch', version: result.version, daemonState: result.value })
        } else {
            cb({ result: 'error' })
        }

        if (result.result === 'success') {
            const update = {
                id: randomUUID(),
                seq: Date.now(),
                createdAt: Date.now(),
                body: {
                    t: 'update-machine' as const,
                    machineId: id,
                    metadata: null,
                    daemonState: { version: result.version, value: daemonState }
                }
            }
            socket.to(`machine:${id}`).emit('update', update)
            onWebappEvent?.({ type: 'machine-updated', machineId: id, data: { id } })
        }
    }

    socket.on('machine-update-metadata', handleMachineMetadataUpdate)
    socket.on('machine-update-state', handleMachineStateUpdate)
}
