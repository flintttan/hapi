import type { Database } from 'bun:sqlite'

import type { StoredMachine, VersionedUpdateResult } from './types'
import { safeJsonParse } from './json'
import { updateVersionedField } from './versionedUpdates'

type DbMachineRow = {
    id: string
    namespace: string
    created_at: number
    updated_at: number
    metadata: string | null
    metadata_version: number
    runner_state: string | null
    runner_state_version: number
    active: number
    active_at: number | null
    seq: number
}

function toStoredMachine(row: DbMachineRow): StoredMachine {
    return {
        id: row.id,
        namespace: row.namespace,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata),
        metadataVersion: row.metadata_version,
        runnerState: safeJsonParse(row.runner_state),
        runnerStateVersion: row.runner_state_version,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq
    }
}

export function getOrCreateMachine(
    db: Database,
    id: string,
    metadata: unknown,
    runnerState: unknown,
    namespace: string
): StoredMachine {
    const existing = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
    if (existing) {
        const stored = toStoredMachine(existing)
        if (stored.namespace !== namespace) {
            throw new Error('Machine namespace mismatch')
        }

        const mergedMetadata = (() => {
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
                return metadata
            }
            const incoming = { ...(metadata as Record<string, unknown>) }
            const existingMetadata = safeJsonParse(existing.metadata)
            if (
                !('displayName' in incoming)
                && existingMetadata
                && typeof existingMetadata === 'object'
                && !Array.isArray(existingMetadata)
                && typeof (existingMetadata as Record<string, unknown>).displayName === 'string'
            ) {
                incoming.displayName = (existingMetadata as Record<string, unknown>).displayName
            }
            return incoming
        })()

        const nextMetadataJson = JSON.stringify(mergedMetadata)
        const nextRunnerStateJson = runnerState === null || runnerState === undefined ? null : JSON.stringify(runnerState)
        const metadataChanged = nextMetadataJson !== existing.metadata
        const runnerStateChanged = runnerState !== undefined && nextRunnerStateJson !== existing.runner_state

        if (metadataChanged || runnerStateChanged) {
            const now = Date.now()
            db.prepare(`
                UPDATE machines
                SET metadata = CASE WHEN @metadata_changed = 1 THEN @metadata ELSE metadata END,
                    metadata_version = CASE WHEN @metadata_changed = 1 THEN metadata_version + 1 ELSE metadata_version END,
                    runner_state = CASE WHEN @runner_state_changed = 1 THEN @runner_state ELSE runner_state END,
                    runner_state_version = CASE WHEN @runner_state_changed = 1 THEN runner_state_version + 1 ELSE runner_state_version END,
                    updated_at = @updated_at,
                    active = CASE WHEN @runner_state_changed = 1 THEN 1 ELSE active END,
                    active_at = CASE WHEN @runner_state_changed = 1 THEN @updated_at ELSE active_at END,
                    seq = seq + 1
                WHERE id = @id AND namespace = @namespace
            `).run({
                id,
                namespace,
                metadata: nextMetadataJson,
                metadata_changed: metadataChanged ? 1 : 0,
                runner_state: nextRunnerStateJson,
                runner_state_changed: runnerStateChanged ? 1 : 0,
                updated_at: now,
            })
            return getMachine(db, id) ?? stored
        }

        return stored
    }

    const now = Date.now()
    const metadataJson = JSON.stringify(metadata)
    const runnerStateJson = runnerState === null || runnerState === undefined ? null : JSON.stringify(runnerState)

    db.prepare(`
        INSERT INTO machines (
            id, namespace, created_at, updated_at,
            metadata, metadata_version,
            runner_state, runner_state_version,
            active, active_at, seq
        ) VALUES (
            @id, @namespace, @created_at, @updated_at,
            @metadata, 1,
            @runner_state, 1,
            0, NULL, 0
        )
    `).run({
        id,
        namespace,
        created_at: now,
        updated_at: now,
        metadata: metadataJson,
        runner_state: runnerStateJson
    })

    const row = getMachine(db, id)
    if (!row) {
        throw new Error('Failed to create machine')
    }
    return row
}

export function updateMachineMetadata(
    db: Database,
    id: string,
    metadata: unknown,
    expectedVersion: number,
    namespace: string
): VersionedUpdateResult<unknown | null> {
    const now = Date.now()

    return updateVersionedField({
        db,
        table: 'machines',
        id,
        namespace,
        field: 'metadata',
        versionField: 'metadata_version',
        expectedVersion,
        value: metadata,
        encode: (value) => {
            const json = JSON.stringify(value)
            return json === undefined ? null : json
        },
        decode: safeJsonParse,
        setClauses: ['updated_at = @updated_at', 'seq = seq + 1'],
        params: { updated_at: now }
    })
}

export function updateMachineRunnerState(
    db: Database,
    id: string,
    runnerState: unknown,
    expectedVersion: number,
    namespace: string
): VersionedUpdateResult<unknown | null> {
    const now = Date.now()
    const normalized = runnerState ?? null

    return updateVersionedField({
        db,
        table: 'machines',
        id,
        namespace,
        field: 'runner_state',
        versionField: 'runner_state_version',
        expectedVersion,
        value: normalized,
        encode: (value) => (value === null ? null : JSON.stringify(value)),
        decode: safeJsonParse,
        setClauses: [
            'updated_at = @updated_at',
            'active = 1',
            'active_at = @active_at',
            'seq = seq + 1'
        ],
        params: { updated_at: now, active_at: now }
    })
}

export function getMachine(db: Database, id: string): StoredMachine | null {
    const row = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
    return row ? toStoredMachine(row) : null
}

export function getMachineByNamespace(db: Database, id: string, namespace: string): StoredMachine | null {
    const row = db.prepare(
        'SELECT * FROM machines WHERE id = ? AND namespace = ?'
    ).get(id, namespace) as DbMachineRow | undefined
    return row ? toStoredMachine(row) : null
}

export function getMachines(db: Database): StoredMachine[] {
    const rows = db.prepare('SELECT * FROM machines ORDER BY updated_at DESC').all() as DbMachineRow[]
    return rows.map(toStoredMachine)
}

export function getMachinesByNamespace(db: Database, namespace: string): StoredMachine[] {
    const rows = db.prepare(
        'SELECT * FROM machines WHERE namespace = ? ORDER BY updated_at DESC'
    ).all(namespace) as DbMachineRow[]
    return rows.map(toStoredMachine)
}
