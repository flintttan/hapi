import type { Database } from 'bun:sqlite'

import type { VersionedUpdateResult } from './types'

type VersionedUpdateArgs<T> = {
    db: Database
    table: string
    id: string
    namespace: string
    field: string
    versionField: string
    expectedVersion: number
    value: T
    encode: (value: T) => string | null
    decode: (value: string | null) => T
    setClauses?: string[]
    params?: Record<string, unknown>
}

export function updateVersionedField<T>(args: VersionedUpdateArgs<T>): VersionedUpdateResult<T> {
    try {
        const setClauses = [
            `${args.field} = @field_value`,
            `${args.versionField} = ${args.versionField} + 1`,
            ...(args.setClauses ?? [])
        ]

        const result = args.db.prepare(
            `UPDATE ${args.table}
             SET ${setClauses.join(', ')}
             WHERE id = @id AND namespace = @namespace AND ${args.versionField} = @expectedVersion`
        ).run({
            id: args.id,
            namespace: args.namespace,
            expectedVersion: args.expectedVersion,
            field_value: args.encode(args.value),
            ...(args.params ?? {})
        })

        if (result.changes === 1) {
            return { result: 'success', version: args.expectedVersion + 1, value: args.value }
        }

        const current = args.db.prepare(
            `SELECT ${args.field} AS field_value, ${args.versionField} AS version
             FROM ${args.table}
             WHERE id = ? AND namespace = ?`
        ).get(args.id, args.namespace) as { field_value: string | null; version: number } | undefined

        if (!current) {
            return { result: 'error' }
        }

        return {
            result: 'version-mismatch',
            version: current.version,
            value: args.decode(current.field_value)
        }
    } catch {
        return { result: 'error' }
    }
}
