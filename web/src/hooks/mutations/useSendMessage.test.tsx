import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSendMessage } from './useSendMessage'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage } from '@/types/api'

const storeMocks = vi.hoisted(() => ({
    appendOptimisticMessage: vi.fn(),
    getMessageWindowState: vi.fn<() => { messages: DecryptedMessage[]; pending: DecryptedMessage[] }>(() => ({ messages: [], pending: [] })),
    updateMessageStatus: vi.fn(),
}))

vi.mock('@/lib/message-window-store', () => ({
    appendOptimisticMessage: storeMocks.appendOptimisticMessage,
    getMessageWindowState: storeMocks.getMessageWindowState,
    updateMessageStatus: storeMocks.updateMessageStatus,
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: { notification: vi.fn() },
    }),
}))

vi.mock('@/lib/messages', () => ({
    makeClientSideId: vi.fn(() => 'local-id-1'),
}))

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    })
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
}

function createMockApi(sendMessage: (...args: unknown[]) => Promise<void> = async () => {}): ApiClient {
    return { sendMessage } as unknown as ApiClient
}

describe('useSendMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeMocks.getMessageWindowState.mockReturnValue({ messages: [], pending: [] })
    })

    it('optimistically marks an immediate message as sending even if session thinking is stale', async () => {
        const api = createMockApi()

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A', { isSessionThinking: true }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello')
        })

        await waitFor(() => {
            expect(storeMocks.appendOptimisticMessage).toHaveBeenCalledWith(
                'session-A',
                expect.objectContaining({ status: 'sending', invokedAt: null })
            )
        })
    })

    it('optimistically marks an immediate message as sending when session is idle', async () => {
        const api = createMockApi()

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A', { isSessionThinking: false }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello')
        })

        await waitFor(() => {
            expect(storeMocks.appendOptimisticMessage).toHaveBeenCalledWith(
                'session-A',
                expect.objectContaining({ status: 'sending', invokedAt: null })
            )
        })
    })

    it('optimistically marks a future scheduled message as queued', async () => {
        const api = createMockApi()
        const scheduledAt = Date.now() + 60_000

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A'),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello later', undefined, scheduledAt)
        })

        await waitFor(() => {
            expect(storeMocks.appendOptimisticMessage).toHaveBeenCalledWith(
                'session-A',
                expect.objectContaining({ status: 'queued', scheduledAt })
            )
        })
    })

    it('marks an immediate message as queued when another uninvoked local message already exists', async () => {
        const api = createMockApi()
        storeMocks.getMessageWindowState.mockReturnValue({
            messages: [{
                id: 'server-1',
                seq: 1,
                localId: 'local-existing',
                content: { role: 'user', content: { type: 'text', text: 'first' } },
                createdAt: 100,
                invokedAt: null,
                scheduledAt: null,
            } satisfies DecryptedMessage],
            pending: [] as DecryptedMessage[],
        })

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A', { isSessionThinking: false }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('second')
        })

        await waitFor(() => {
            expect(storeMocks.appendOptimisticMessage).toHaveBeenCalledWith(
                'session-A',
                expect.objectContaining({ status: 'queued', invokedAt: null })
            )
        })
    })

    it('calls onSuccess with the session ID that was sent', async () => {
        const onSuccess = vi.fn()
        const api = createMockApi()

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A', { onSuccess }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello')
        })

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledWith('session-A')
        })
    })

    it('calls onSuccess with resolved session ID, not the original', async () => {
        const onSuccess = vi.fn()
        const api = createMockApi()

        const { result } = renderHook(
            () => useSendMessage(api, 'session-original', {
                onSuccess,
                resolveSessionId: async () => 'session-resolved',
                onSessionResolved: vi.fn(),
            }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello')
        })

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledWith('session-resolved')
        })
    })

    it('does not call onSuccess when send fails', async () => {
        const onSuccess = vi.fn()
        const api = createMockApi(async () => {
            throw new Error('network error')
        })

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A', { onSuccess }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello')
        })

        await waitFor(() => {
            expect(result.current.isSending).toBe(false)
        })

        expect(onSuccess).not.toHaveBeenCalled()
    })

    it('does not call onSuccess when blocked', () => {
        const onSuccess = vi.fn()
        const onBlocked = vi.fn()

        const { result } = renderHook(
            () => useSendMessage(null, 'session-A', { onSuccess, onBlocked }),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello')
        })

        expect(onBlocked).toHaveBeenCalledWith('no-api')
        expect(onSuccess).not.toHaveBeenCalled()
    })
})
