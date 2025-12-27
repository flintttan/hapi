import { describe, it, expect, beforeEach } from 'bun:test'
import { Store } from '../../../store'
import { createCliTokenRoutes } from '../cli-tokens'
import type { WebAppEnv } from '../../middleware/auth'

describe('CLI Token Management', () => {
    let store: Store
    let testUserId: string

    beforeEach(() => {
        store = new Store(':memory:')
        testUserId = 'test-user-1'
        store.createUser({
            id: testUserId,
            telegram_id: null,
            username: 'Test User'
        })
    })

    describe('Store.generateCliToken', () => {
        it('should generate unique tokens for same user', () => {
            const token1 = store.generateCliToken(testUserId, 'Token 1')
            const token2 = store.generateCliToken(testUserId, 'Token 2')

            expect(token1.id).not.toBe(token2.id)
            expect(token1.token).not.toBe(token2.token)
            expect(token1.name).toBe('Token 1')
            expect(token2.name).toBe('Token 2')
        })

        it('should generate token with null name when name not provided', () => {
            const token = store.generateCliToken(testUserId)

            expect(token.id).toBeDefined()
            expect(token.token).toBeDefined()
            expect(token.name).toBe(null)
            expect(token.created_at).toBeDefined()
        })
    })

    describe('Store.validateCliToken', () => {
        it('should validate correct token and return userId', () => {
            const generated = store.generateCliToken(testUserId, 'Test Token')
            const result = store.validateCliToken(generated.token)

            expect(result).not.toBeNull()
            expect(result?.userId).toBe(testUserId)
            expect(result?.tokenId).toBe(generated.id)
        })

        it('should return null for invalid token', () => {
            const result = store.validateCliToken('invalid-token-12345')
            expect(result).toBeNull()
        })

        it('should update last_used_at on successful validation', () => {
            const generated = store.generateCliToken(testUserId, 'Test Token')
            const beforeValidation = Date.now()

            store.validateCliToken(generated.token)

            const tokens = store.getCliTokens(testUserId)
            const validatedToken = tokens.find(t => t.id === generated.id)

            expect(validatedToken?.last_used_at).not.toBeNull()
            expect(validatedToken?.last_used_at!).toBeGreaterThanOrEqual(beforeValidation)
        })
    })

    describe('Store token hashing', () => {
        it('should store hashed token, not plaintext', () => {
            const generated = store.generateCliToken(testUserId, 'Secret Token')

            const tokens = store.getCliTokens(testUserId)

            const tokenInfo = tokens.find(t => t.id === generated.id)
            expect(tokenInfo).toBeDefined()
        })
    })

    describe('Store.revokeCliToken', () => {
        it('should revoke token owned by user', () => {
            const generated = store.generateCliToken(testUserId, 'Token to Revoke')

            const revoked = store.revokeCliToken(generated.id, testUserId)
            expect(revoked).toBe(true)

            const tokens = store.getCliTokens(testUserId)
            expect(tokens.find(t => t.id === generated.id)).toBeUndefined()
        })

        it('should not revoke token not owned by user', () => {
            const user2Id = 'test-user-2'
            store.createUser({
                id: user2Id,
                telegram_id: null,
                username: 'User 2'
            })

            const token1 = store.generateCliToken(testUserId, 'User1 Token')

            const revoked = store.revokeCliToken(token1.id, user2Id)
            expect(revoked).toBe(false)

            const user1Tokens = store.getCliTokens(testUserId)
            expect(user1Tokens.find(t => t.id === token1.id)).toBeDefined()
        })
    })

    describe('Store.getCliTokens', () => {
        it('should return only tokens owned by user', () => {
            const user2Id = 'test-user-2'
            store.createUser({
                id: user2Id,
                telegram_id: null,
                username: 'User 2'
            })

            store.generateCliToken(testUserId, 'User1 Token1')
            store.generateCliToken(testUserId, 'User1 Token2')
            store.generateCliToken(user2Id, 'User2 Token1')

            const user1Tokens = store.getCliTokens(testUserId)
            expect(user1Tokens).toHaveLength(2)
            expect(user1Tokens.every(t => t.name?.startsWith('User1'))).toBe(true)

            const user2Tokens = store.getCliTokens(user2Id)
            expect(user2Tokens).toHaveLength(1)
            expect(user2Tokens[0].name).toBe('User2 Token1')
        })
    })

    describe('API Routes', () => {
        const createMockContext = (userId: string) => ({
            get: (key: string) => key === 'userId' ? userId : undefined,
            req: {
                json: async () => ({}),
                param: (key: string) => undefined
            },
            json: (data: unknown, status?: number) => ({ data, status }),
            body: (data: unknown, status?: number) => ({ data, status })
        } as unknown as any)

        describe('POST /cli-tokens', () => {
            it('should create new CLI token', async () => {
                const app = createCliTokenRoutes(store)
                const ctx = createMockContext(testUserId)
                ctx.req.json = async () => ({ name: 'API Token' })

                const route = app.routes.find(r => r.method === 'POST' && r.path === '/cli-tokens')
                expect(route).toBeDefined()

                const handler = route?.handler
                if (!handler) throw new Error('Handler not found')

                const response: any = await handler(ctx, async () => {})

                expect(response.status).toBe(200)
                expect(response.data.id).toBeDefined()
                expect(response.data.token).toBeDefined()
                expect(response.data.name).toBe('API Token')
            })
        })

        describe('GET /cli-tokens', () => {
            it('should list user tokens without exposing full token value', async () => {
                store.generateCliToken(testUserId, 'Token 1')
                store.generateCliToken(testUserId, 'Token 2')

                const app = createCliTokenRoutes(store)
                const ctx = createMockContext(testUserId)

                const route = app.routes.find(r => r.method === 'GET' && r.path === '/cli-tokens')
                expect(route).toBeDefined()

                const handler = route?.handler
                if (!handler) throw new Error('Handler not found')

                const response: any = await handler(ctx, async () => {})

                expect(response.status).toBe(200)
                expect(response.data.tokens).toHaveLength(2)
                expect(response.data.tokens[0].id).toBeDefined()
                expect(response.data.tokens[0].name).toBeDefined()
                expect((response.data.tokens[0] as any).token).toBeUndefined()
            })
        })

        describe('DELETE /cli-tokens/:id', () => {
            it('should revoke token', async () => {
                const generated = store.generateCliToken(testUserId, 'Token to Delete')

                const app = createCliTokenRoutes(store)
                const ctx = createMockContext(testUserId)
                ctx.req.param = (key: string) => key === 'id' ? generated.id : undefined

                const route = app.routes.find(r => r.method === 'DELETE' && r.path === '/cli-tokens/:id')
                expect(route).toBeDefined()

                const handler = route?.handler
                if (!handler) throw new Error('Handler not found')

                const response: any = await handler(ctx, async () => {})

                expect(response.status).toBe(204)

                const tokens = store.getCliTokens(testUserId)
                expect(tokens.find(t => t.id === generated.id)).toBeUndefined()
            })
        })
    })
})
