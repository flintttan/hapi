import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { Context } from 'hono'
import type { Session, SyncEngine, Machine } from '../../../sync/syncEngine'
import type { WebAppEnv } from '../../middleware/auth'
import { requireSession, requireMachine, requireUserOwnsResource, requireSessionFromParam } from '../guards'

// Mock console.warn to verify audit logging
const mockWarn = mock(() => {})
console.warn = mockWarn

// Test users
const USER_A = 'user-a-123'
const USER_B = 'user-b-456'

// Mock sessions
const SESSION_A: Session = {
    id: 'session-a',
    userId: USER_A,
    seq: 0,
    createdAt: Date.now(),
    active: true,
    activeAt: Date.now(),
    updatedAt: Date.now(),
    thinking: false,
    thinkingAt: 0,
    metadata: {
        path: '/path/a',
        host: 'host-a',
        name: 'Session A',
        userId: USER_A
    },
    metadataVersion: 1,
    agentState: null,
    agentStateVersion: 0,
    permissionMode: null,
    modelMode: null
}

const SESSION_B: Session = {
    id: 'session-b',
    userId: USER_B,
    seq: 0,
    createdAt: Date.now(),
    active: true,
    activeAt: Date.now(),
    updatedAt: Date.now(),
    thinking: false,
    thinkingAt: 0,
    metadata: {
        path: '/path/b',
        host: 'host-b',
        name: 'Session B',
        userId: USER_B
    },
    metadataVersion: 1,
    agentState: null,
    agentStateVersion: 0,
    permissionMode: null,
    modelMode: null
}

// Mock machines
const MACHINE_A: Machine = {
    id: 'machine-a',
    userId: USER_A,
    seq: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    active: true,
    activeAt: Date.now(),
    metadata: {
        host: 'machine-a',
        platform: 'test',
        happyCliVersion: '0.0.0-test',
        userId: USER_A
    },
    metadataVersion: 1,
    daemonState: null,
    daemonStateVersion: 0
}

const MACHINE_B: Machine = {
    id: 'machine-b',
    userId: USER_B,
    seq: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    active: true,
    activeAt: Date.now(),
    metadata: {
        host: 'machine-b',
        platform: 'test',
        happyCliVersion: '0.0.0-test',
        userId: USER_B
    },
    metadataVersion: 1,
    daemonState: null,
    daemonStateVersion: 0
}

// Mock SyncEngine
const createMockEngine = (): SyncEngine => {
    return {
        getSession: (sessionId: string, userId: string) => {
            const session = sessionId === 'session-a' ? SESSION_A : sessionId === 'session-b' ? SESSION_B : undefined
            if (!session) return undefined
            return session.userId === userId ? session : undefined
        },
        getMachine: (machineId: string, userId: string) => {
            const machine = machineId === 'machine-a' ? MACHINE_A : machineId === 'machine-b' ? MACHINE_B : undefined
            if (!machine) return undefined
            return machine.userId === userId ? machine : undefined
        }
    } as unknown as SyncEngine
}

// Mock Hono Context
const createMockContext = (userId?: string): Context<WebAppEnv> => {
    return {
        get: (key: string) => {
            if (key === 'userId') return userId
            return undefined
        },
        json: (data: any, status?: number) => {
            const response = new Response(JSON.stringify(data), {
                status: status ?? 200,
                headers: { 'Content-Type': 'application/json' }
            })
            ;(response as any).data = data
            return response
        },
        req: {
            param: (name: string) => {
                if (name === 'id') return 'session-a'
                return undefined
            }
        }
    } as unknown as Context<WebAppEnv>
}

describe('Route Guards - Ownership Validation', () => {
    beforeEach(() => {
        mockWarn.mockClear()
    })

    describe('requireSession', () => {
        test('should allow access to owned session', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireSession(context, engine, 'session-a', USER_A)

            expect(result).toEqual(SESSION_A)
            expect(mockWarn).not.toHaveBeenCalled()
        })

        test('should block unauthorized access with 404', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireSession(context, engine, 'session-b', USER_A)

            expect(result).toBeInstanceOf(Object)
            expect((result as any).status).toBe(404)
            expect((result as any).data).toEqual({ error: 'Session not found' })
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining(`User ${USER_A} attempted to access non-existent session session-b`)
            )
        })

        test('should return 404 for non-existent session', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireSession(context, engine, 'non-existent', USER_A)

            expect(result).toBeInstanceOf(Object)
            expect((result as any).status).toBe(404)
            expect((result as any).data).toEqual({ error: 'Session not found' })
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining(`User ${USER_A} attempted to access non-existent session non-existent`)
            )
        })

        test('should verify active status when required', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            // Create inactive session
            const inactiveSession: Session = { ...SESSION_A, active: false }
            engine.getSession = () => inactiveSession

            const result = requireSession(context, engine, 'session-a', USER_A, { requireActive: true })

            expect(result).toBeInstanceOf(Object)
            expect((result as any).status).toBe(409)
            expect((result as any).data).toEqual({ error: 'Session is inactive' })
        })
    })

    describe('requireMachine', () => {
        test('should allow access to owned machine', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireMachine(context, engine, 'machine-a', USER_A)

            expect(result).toEqual(MACHINE_A)
            expect(mockWarn).not.toHaveBeenCalled()
        })

        test('should block unauthorized access with 404', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireMachine(context, engine, 'machine-b', USER_A)

            expect(result).toBeInstanceOf(Object)
            expect((result as any).status).toBe(404)
            expect((result as any).data).toEqual({ error: 'Machine not found' })
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining(`User ${USER_A} attempted to access non-existent machine machine-b`)
            )
        })

        test('should return 404 for non-existent machine', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireMachine(context, engine, 'non-existent', USER_A)

            expect(result).toBeInstanceOf(Object)
            expect((result as any).status).toBe(404)
            expect((result as any).data).toEqual({ error: 'Machine not found' })
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining(`User ${USER_A} attempted to access non-existent machine non-existent`)
            )
        })
    })

    describe('requireUserOwnsResource', () => {
        test('should delegate to requireSession for session resources', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireUserOwnsResource<Session>(
                context,
                engine,
                'session',
                'session-a',
                USER_A
            )

            expect(result).toEqual(SESSION_A)
        })

        test('should delegate to requireMachine for machine resources', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireUserOwnsResource<Machine>(
                context,
                engine,
                'machine',
                'machine-a',
                USER_A
            )

            expect(result).toEqual(MACHINE_A)
        })

        test('should return 400 for invalid resource type', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireUserOwnsResource(
                context,
                engine,
                'invalid' as any,
                'resource-id',
                USER_A
            )

            expect(result).toBeInstanceOf(Object)
            expect((result as any).status).toBe(400)
            expect((result as any).data).toEqual({ error: 'Invalid resource type' })
        })
    })

    describe('requireSessionFromParam', () => {
        test('should extract session ID from params and validate ownership', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const result = requireSessionFromParam(context, engine, USER_A)

            expect(result).not.toBeInstanceOf(Response)
            expect((result as any).sessionId).toBe('session-a')
            expect((result as any).session).toEqual(SESSION_A)
        })

        test('should return 404 for unauthorized session access', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_B)

            // USER_B trying to access session-a (which belongs to USER_A)
            const result = requireSessionFromParam(context, engine, USER_B)

            // Should return Response object with 404
            expect((result as any).status).toBe(404)
            expect((result as any).data).toEqual({ error: 'Session not found' })
        })
    })

    describe('Security Audit Logging', () => {
        test('should log all unauthorized access attempts', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            // Attempt 1: Unauthorized session access
            requireSession(context, engine, 'session-b', USER_A)
            expect(mockWarn).toHaveBeenCalledTimes(1)

            // Attempt 2: Unauthorized machine access
            requireMachine(context, engine, 'machine-b', USER_A)
            expect(mockWarn).toHaveBeenCalledTimes(2)

            // Attempt 3: Non-existent resource
            requireSession(context, engine, 'non-existent', USER_A)
            expect(mockWarn).toHaveBeenCalledTimes(3)

            // Verify log format includes userId and resourceId
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining(`[Security] User ${USER_A} attempted to access non-existent session session-b`)
            )
        })

        test('should not log successful authorized access', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            requireSession(context, engine, 'session-a', USER_A)
            requireMachine(context, engine, 'machine-a', USER_A)

            expect(mockWarn).not.toHaveBeenCalled()
        })
    })

    describe('Error Response Format', () => {
        test('should always return 404 for ownership violations (not 403)', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const sessionResult = requireSession(context, engine, 'session-b', USER_A)
            const machineResult = requireMachine(context, engine, 'machine-b', USER_A)

            // Verify we return 404 to hide resource existence from unauthorized users
            expect((sessionResult as any).status).toBe(404)
            expect((machineResult as any).status).toBe(404)

            // Verify we never return 403
            expect((sessionResult as any).status).not.toBe(403)
            expect((machineResult as any).status).not.toBe(403)
        })

        test('should return consistent error messages', () => {
            const engine = createMockEngine()
            const context = createMockContext(USER_A)

            const unauthorizedResult = requireSession(context, engine, 'session-b', USER_A)
            const notFoundResult = requireSession(context, engine, 'non-existent', USER_A)

            // Both should return same error message to prevent information disclosure
            expect((unauthorizedResult as any).data).toEqual({ error: 'Session not found' })
            expect((notFoundResult as any).data).toEqual({ error: 'Session not found' })
        })
    })
})
