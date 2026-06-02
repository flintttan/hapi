import { describe, expect, it } from 'vitest'
import { CreateMachineResponseSchema, CreateSessionResponseSchema } from './apiTypes'

describe('CLI API response schemas', () => {
    it('accepts create machine responses without namespace', () => {
        const parsed = CreateMachineResponseSchema.safeParse({
            machine: {
                id: 'machine-1',
                seq: 1,
                createdAt: 1,
                updatedAt: 1,
                active: true,
                activeAt: 1,
                metadata: {
                    host: 'devbox',
                    platform: 'darwin',
                    happyCliVersion: '0.5.55'
                },
                metadataVersion: 0,
                runnerState: null,
                runnerStateVersion: 0
            }
        })

        expect(parsed.success).toBe(true)
    })

    it('accepts create session responses without namespace', () => {
        const parsed = CreateSessionResponseSchema.safeParse({
            session: {
                id: 'session-1',
                seq: 1,
                createdAt: 1,
                updatedAt: 1,
                active: true,
                activeAt: 1,
                metadata: {
                    path: '/tmp/project',
                    host: 'devbox'
                },
                metadataVersion: 0,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 1,
                model: null,
                modelReasoningEffort: null,
                effort: null
            }
        })

        expect(parsed.success).toBe(true)
    })
})
