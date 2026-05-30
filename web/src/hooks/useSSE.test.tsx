import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { act } from '@testing-library/react'
import { useSSE } from '@/hooks/useSSE'

const mocks = vi.hoisted(() => ({
  instances: [] as MockEventSource[],
  invalidateQueries: vi.fn(),
  clearMessageWindow: vi.fn(),
  ingestIncomingMessages: vi.fn(),
  markMessagesConsumed: vi.fn(),
  removeOptimisticMessage: vi.fn(),
}))

class MockEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 1
  url: string

  constructor(url: string) {
    this.url = url
    mocks.instances.push(this)
  }

  close() {
    this.readyState = 2
  }
}

vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)
vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
  cb(0)
  return 1
}) as typeof requestAnimationFrame)
vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

vi.mock('@/lib/message-window-store', () => ({
  clearMessageWindow: mocks.clearMessageWindow,
  ingestIncomingMessages: mocks.ingestIncomingMessages,
  markMessagesConsumed: mocks.markMessagesConsumed,
  removeOptimisticMessage: mocks.removeOptimisticMessage,
}))

vi.mock('@/lib/query-keys', () => ({
  queryKeys: {
    sessions: ['sessions'],
    session: (sessionId: string) => ['session', sessionId],
    machines: ['machines'],
  },
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useSSE session list invalidation for message stream events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.instances.length = 0
    vi.useFakeTimers()
  })

  it('invalidates session list for full-scope messages-consumed and message-cancelled', () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { unmount } = renderHook(() => useSSE({
      enabled: true,
      token: 'token',
      baseUrl: 'http://localhost:3000',
      subscription: { sessionId: 'session-1' },
      scope: 'full',
      onEvent: vi.fn(),
    }), { wrapper: createWrapper(queryClient) })

    const source = mocks.instances[0]
    expect(source).toBeTruthy()

    act(() => {
      source.onmessage?.({
        data: JSON.stringify({ type: 'messages-consumed', sessionId: 'session-1', localIds: ['l1'], invokedAt: 123 }),
      } as MessageEvent<string>)

      source.onmessage?.({
        data: JSON.stringify({ type: 'message-cancelled', sessionId: 'session-1', messageId: 'm1', localId: 'l1' }),
      } as MessageEvent<string>)
      vi.advanceTimersByTime(20)
    })

    expect(mocks.markMessagesConsumed).toHaveBeenCalledWith('session-1', ['l1'], 123)
    expect(mocks.removeOptimisticMessage).toHaveBeenCalledWith('session-1', 'm1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sessions'] })
    unmount()
  })

  it('invalidates session list for scheduled message receive and scheduled-matured in full scope', () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { unmount } = renderHook(() => useSSE({
      enabled: true,
      token: 'token',
      baseUrl: 'http://localhost:3000',
      subscription: { sessionId: 'session-1' },
      scope: 'full',
      onEvent: vi.fn(),
    }), { wrapper: createWrapper(queryClient) })

    const source = mocks.instances[0]

    act(() => {
      source.onmessage?.({
        data: JSON.stringify({
          type: 'message-received',
          sessionId: 'session-1',
          message: { id: 'm2', seq: 2, localId: 'l2', content: { role: 'user', content: { type: 'text', text: 'later' } }, createdAt: 100, invokedAt: null, scheduledAt: 999999 },
        }),
      } as MessageEvent<string>)

      source.onmessage?.({
        data: JSON.stringify({ type: 'scheduled-matured', sessionId: 'session-1' }),
      } as MessageEvent<string>)
      vi.advanceTimersByTime(20)
    })

    expect(mocks.ingestIncomingMessages).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sessions'] })
    unmount()
  })
})
