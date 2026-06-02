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

    it('optimistically marks an immediate message as sending when session is idle', async () => {
        const api = createMockApi()

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A'),
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

    it('does not let future scheduled messages block a new immediate send', async () => {
        const api = createMockApi()
        storeMocks.getMessageWindowState.mockReturnValue({
            messages: [{
                id: 'local-scheduled',
                seq: null,
                localId: 'local-scheduled',
                content: { role: 'user', content: { type: 'text', text: 'later' } },
                createdAt: 100,
                invokedAt: null,
                scheduledAt: Date.now() + 60_000,
                status: 'queued',
                originalText: 'later',
            } satisfies DecryptedMessage],
            pending: [] as DecryptedMessage[],
        })

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A'),
            { wrapper: createWrapper() },
        )

        act(() => {
            result.current.sendMessage('hello now')
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
            () => useSendMessage(api, 'session-A'),
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

    it('does not treat stale queued messages from the pre-resume session as active queue for the resumed session', async () => {
        const api = createMockApi()
        storeMocks.getMessageWindowState.mockImplementation(((sid?: string) => {
            if (sid === 'session-resolved') {
                return { messages: [], pending: [] }
            }
            return {
                messages: [{
                    id: 'server-old',
                    seq: 1,
                    localId: 'local-old',
                    content: { role: 'user', content: { type: 'text', text: 'old pending' } },
                    createdAt: 100,
                    invokedAt: null,
                    scheduledAt: null,
                } satisfies DecryptedMessage],
                pending: [] as DecryptedMessage[],
            }
        }) as () => { messages: DecryptedMessage[]; pending: DecryptedMessage[] })

        const { result } = renderHook(
            () => useSendMessage(api, 'session-original', {
                resolveSessionId: async () => 'session-resolved',
            }),
            { wrapper: createWrapper() },
        )

        await act(async () => {
            await result.current.sendMessage('hello after resume')
        })

        await waitFor(() => {
            expect(storeMocks.appendOptimisticMessage).toHaveBeenCalledWith(
                'session-resolved',
                expect.objectContaining({ status: 'sending', invokedAt: null })
            )
        })
    })

    it('retries immediately when session is idle', async () => {
        const api = createMockApi()
        storeMocks.getMessageWindowState.mockReturnValue({
            messages: [{
                id: 'local-id-1',
                seq: null,
                localId: 'local-id-1',
                content: { role: 'user', content: { type: 'text', text: 'retry me' } },
                createdAt: 100,
                invokedAt: null,
                scheduledAt: null,
                status: 'failed',
                originalText: 'retry me',
            } satisfies DecryptedMessage],
            pending: [] as DecryptedMessage[],
        })

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A'),
            { wrapper: createWrapper() },
        )

        act(() => {
            expect(result.current.retryMessage('local-id-1')).toBe(true)
        })

        expect(storeMocks.updateMessageStatus).toHaveBeenCalledWith('session-A', 'local-id-1', 'sending')
        await waitFor(() => {
            expect(storeMocks.appendOptimisticMessage).toHaveBeenCalledWith(
                'session-A',
                expect.objectContaining({ id: 'local-id-1', status: 'sending' }),
            )
        })
    })

    it('retries as queued when another immediate message is already pending', async () => {
        const api = createMockApi()
        storeMocks.getMessageWindowState.mockReturnValue({
            messages: [
                {
                    id: 'local-id-1',
                    seq: null,
                    localId: 'local-id-1',
                    content: { role: 'user', content: { type: 'text', text: 'retry me' } },
                    createdAt: 100,
                    invokedAt: null,
                    scheduledAt: null,
                    status: 'failed',
                    originalText: 'retry me',
                } satisfies DecryptedMessage,
                {
                    id: 'server-queued',
                    seq: 2,
                    localId: 'local-other',
                    content: { role: 'user', content: { type: 'text', text: 'other pending' } },
                    createdAt: 101,
                    invokedAt: null,
                    scheduledAt: null,
                    status: 'queued',
                    originalText: 'other pending',
                } satisfies DecryptedMessage,
            ],
            pending: [] as DecryptedMessage[],
        })

        const { result } = renderHook(
            () => useSendMessage(api, 'session-A'),
            { wrapper: createWrapper() },
        )

        act(() => {
            expect(result.current.retryMessage('local-id-1')).toBe(true)
        })

        expect(storeMocks.updateMessageStatus).toHaveBeenCalledWith('session-A', 'local-id-1', 'queued')
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
