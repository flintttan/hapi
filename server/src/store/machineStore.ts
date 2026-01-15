import type { Database } from 'bun:sqlite'

import type { StoredMachine, VersionedUpdateResult } from './types'
import {
    getMachine,
    getMachineByNamespace,
    getMachines,
    getMachinesByNamespace,
    getOrCreateMachine,
    updateMachineDaemonState,
    updateMachineMetadata
} from './machines'

export class MachineStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getOrCreateMachine(id: string, metadata: unknown, daemonState: unknown, namespace: string): StoredMachine {
        return getOrCreateMachine(this.db, id, metadata, daemonState, namespace)
    }

    updateMachineMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        return updateMachineMetadata(this.db, id, metadata, expectedVersion, namespace)
    }

    updateMachineDaemonState(
        id: string,
        daemonState: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        return updateMachineDaemonState(this.db, id, daemonState, expectedVersion, namespace)
    }

    getMachine(id: string): StoredMachine | null {
        return getMachine(this.db, id)
    }

    getMachineByNamespace(id: string, namespace: string): StoredMachine | null {
        return getMachineByNamespace(this.db, id, namespace)
    }

    getMachines(): StoredMachine[] {
        return getMachines(this.db)
    }

    getMachinesByNamespace(namespace: string): StoredMachine[] {
        return getMachinesByNamespace(this.db, namespace)
    }
}
