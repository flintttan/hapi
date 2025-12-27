import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Store } from '../index'
import { unlinkSync, existsSync } from 'node:fs'

describe('User Management', () => {
    const testDbPath = ':memory:'
    let store: Store

    beforeEach(() => {
        store = new Store(testDbPath)
    })

    test('createUser should create a new user', () => {
        const user = store.createUser({
            id: 'test-user-1',
            telegram_id: '123456789',
            username: 'testuser'
        })

        expect(user).toEqual({
            id: 'test-user-1',
            telegram_id: '123456789',
            username: 'testuser',
            created_at: expect.any(Number)
        })
    })

    test('getUserById should retrieve user by id', () => {
        store.createUser({
            id: 'test-user-2',
            telegram_id: '987654321',
            username: 'anotheruser'
        })

        const user = store.getUserById('test-user-2')

        expect(user).not.toBeNull()
        expect(user?.id).toBe('test-user-2')
        expect(user?.telegram_id).toBe('987654321')
        expect(user?.username).toBe('anotheruser')
    })

    test('getUserById should return null for non-existent user', () => {
        const user = store.getUserById('non-existent')
        expect(user).toBeNull()
    })

    test('getUserByTelegramId should retrieve user by telegram_id', () => {
        store.createUser({
            id: 'test-user-3',
            telegram_id: '111222333',
            username: 'telegramuser'
        })

        const user = store.getUserByTelegramId('111222333')

        expect(user).not.toBeNull()
        expect(user?.id).toBe('test-user-3')
        expect(user?.telegram_id).toBe('111222333')
    })

    test('getUserByTelegramId should return null for non-existent telegram_id', () => {
        const user = store.getUserByTelegramId('non-existent')
        expect(user).toBeNull()
    })

    test('getAllUsers should return all users', () => {
        store.createUser({
            id: 'user-1',
            telegram_id: '111',
            username: 'user1'
        })

        store.createUser({
            id: 'user-2',
            telegram_id: '222',
            username: 'user2'
        })

        store.createUser({
            id: 'user-3',
            telegram_id: null,
            username: 'cli-user'
        })

        const users = store.getAllUsers()

        expect(users).toHaveLength(3)
        expect(users.map(u => u.id)).toContain('user-1')
        expect(users.map(u => u.id)).toContain('user-2')
        expect(users.map(u => u.id)).toContain('user-3')
    })

    test('createUser should support CLI users with null telegram_id', () => {
        const user = store.createUser({
            id: 'cli-user',
            telegram_id: null,
            username: 'CLI User'
        })

        expect(user.telegram_id).toBeNull()
        expect(user.username).toBe('CLI User')
    })

    test('createUser should use provided created_at or default to Date.now()', () => {
        const customTime = 1234567890
        const user1 = store.createUser({
            id: 'user-with-time',
            telegram_id: '999',
            username: 'user',
            created_at: customTime
        })

        expect(user1.created_at).toBe(customTime)

        const user2 = store.createUser({
            id: 'user-without-time',
            telegram_id: '888',
            username: 'user2'
        })

        expect(user2.created_at).toBeGreaterThan(customTime)
    })
})
