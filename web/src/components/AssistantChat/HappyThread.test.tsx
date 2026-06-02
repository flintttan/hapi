import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HappyThread } from '@/components/AssistantChat/HappyThread'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  resizeObservers: [] as Array<{ callback: ResizeObserverCallback }>,
  intersectionObservers: [] as Array<{ callback: IntersectionObserverCallback }>,
}))

class MockResizeObserver {
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    mocks.resizeObservers.push({ callback })
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver)

class MockIntersectionObserver {
  callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    mocks.intersectionObservers.push({ callback })
  }

  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return [] }
  root = null
  rootMargin = ''
  thresholds = []
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver)

vi.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: {
    Root: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    Messages: () => <div data-testid="thread-messages" />,
  },
}))

vi.mock('@/components/AssistantChat/context', () => ({
  HappyChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/AssistantChat/messages/AssistantMessage', () => ({ HappyAssistantMessage: () => null }))
vi.mock('@/components/AssistantChat/messages/UserMessage', () => ({ HappyUserMessage: () => null }))
vi.mock('@/components/AssistantChat/messages/SystemMessage', () => ({ HappySystemMessage: () => null }))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))
vi.mock('@/components/Spinner', () => ({ Spinner: () => <div data-testid="spinner" /> }))
vi.mock('@/components/AssistantChat/messageSearchContext', () => ({
  MessageSearchContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
}))
vi.mock('@/lib/toast-context', () => ({
  useToast: () => ({
    addToast: mocks.addToast,
  }),
}))
vi.mock('@/lib/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'session.outline.title') return '会话目录'
      if (key === 'session.outline.kind.user') return '用户'
      if (key === 'session.outline.empty') return '暂无可定位的用户消息'
      if (key === 'button.close') return '关闭'
      if (key === 'misc.loadOlderMessages') return '加载更早消息'
      if (key === 'misc.loading') return '加载中'
      return key
    },
  }),
}))

function makeProps(overrides: Partial<React.ComponentProps<typeof HappyThread>> = {}): React.ComponentProps<typeof HappyThread> {
  return {
    api: {} as never,
    sessionId: 'session-1',
    metadata: null,
    disabled: false,
    onRefresh: vi.fn(),
    onRetryMessage: vi.fn(),
    onFlushPending: vi.fn(),
    onAtBottomChange: vi.fn(),
    isLoadingMessages: false,
    messagesWarning: null,
    hasMoreMessages: false,
    isLoadingMoreMessages: false,
    onLoadMore: vi.fn(async () => {}),
    pendingCount: 0,
    rawMessagesCount: 1,
    normalizedMessagesCount: 1,
    messagesVersion: 1,
    forceScrollToken: 0,
    outlineOpen: true,
    outlineTitle: 'Test Session',
    outlineItems: [
      {
        id: 'outline:user-text:msg-1',
        targetMessageId: 'user-text:msg-1',
        kind: 'user',
        label: 'first message',
        createdAt: 1,
      },
    ],
    onOutlineOpenChange: vi.fn(),
    onOutlineItemClick: vi.fn(),
    onLocateMessage: vi.fn(async () => false),
    ...overrides,
  }
}

describe('HappyThread outline navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resizeObservers.length = 0
    mocks.intersectionObservers.length = 0
  })

  it('scrolls to bottom when session id changes', async () => {
    const { rerender, container } = render(
      <HappyThread {...makeProps({ sessionId: 'session-1', outlineOpen: false })} />,
    )

    const viewport = container.querySelector('.app-scroll-y') as HTMLDivElement | null
    expect(viewport).toBeTruthy()
    if (!viewport) return

    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => 999,
    })
    viewport.scrollTop = 0

    rerender(
      <HappyThread {...makeProps({ sessionId: 'session-2', outlineOpen: false })} />,
    )

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(999)
    })
  })

  it('keeps session entry pinned to bottom until initial messages finish rendering', async () => {
    const { rerender, container } = render(
      <HappyThread {...makeProps({ sessionId: 'session-1', outlineOpen: false, isLoadingMessages: true, rawMessagesCount: 0, normalizedMessagesCount: 0, messagesVersion: 1 })} />,
    )

    const viewport = container.querySelector('.app-scroll-y') as HTMLDivElement | null
    expect(viewport).toBeTruthy()
    if (!viewport) return

    let scrollHeight = 120
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    viewport.scrollTop = 0

    rerender(
      <HappyThread {...makeProps({ sessionId: 'session-2', outlineOpen: false, isLoadingMessages: true, rawMessagesCount: 0, normalizedMessagesCount: 0, messagesVersion: 2 })} />,
    )

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(120)
    })

    scrollHeight = 640
    rerender(
      <HappyThread {...makeProps({ sessionId: 'session-2', outlineOpen: false, isLoadingMessages: false, rawMessagesCount: 6, normalizedMessagesCount: 6, messagesVersion: 3 })} />,
    )

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(640)
    })
  })

  it('keeps bottom alignment when layout chrome changes while already at bottom', async () => {
    const { rerender, container } = render(
      <HappyThread {...makeProps({ sessionId: 'session-1', outlineOpen: false, viewportLayoutKey: 'search:0|outline:0|team:0|inactive:0' })} />,
    )

    const viewport = container.querySelector('.app-scroll-y') as HTMLDivElement | null
    expect(viewport).toBeTruthy()
    if (!viewport) return

    let scrollHeight = 320
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    viewport.scrollTop = 320

    scrollHeight = 540
    rerender(
      <HappyThread {...makeProps({ sessionId: 'session-1', outlineOpen: false, viewportLayoutKey: 'search:1|outline:0|team:0|inactive:0' })} />,
    )

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(540)
    })
  })

  it('keeps initial entry pinned when content height grows after render without prop changes', async () => {
    const { container } = render(
      <HappyThread {...makeProps({ sessionId: 'session-1', outlineOpen: false, isLoadingMessages: false, rawMessagesCount: 3, normalizedMessagesCount: 3, messagesVersion: 1 })} />,
    )

    const viewport = container.querySelector('.app-scroll-y') as HTMLDivElement | null
    expect(viewport).toBeTruthy()
    if (!viewport) return

    let scrollHeight = 180
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    viewport.scrollTop = 180
    scrollHeight = 620

    for (const observer of mocks.resizeObservers) {
      observer.callback([], {} as ResizeObserver)
    }

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(620)
    })
  })

  it('does not auto-load older messages during initial entry settle window', async () => {
    vi.useFakeTimers()
    const onLoadMore = vi.fn(async () => {})

    render(
      <HappyThread
        {...makeProps({
          sessionId: 'session-1',
          outlineOpen: false,
          hasMoreMessages: true,
          isLoadingMessages: false,
          onLoadMore,
        })}
      />,
    )

    expect(mocks.intersectionObservers.length).toBeGreaterThan(0)
    for (const observer of mocks.intersectionObservers) {
      observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }

    expect(onLoadMore).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)

    for (const observer of mocks.intersectionObservers) {
      observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }

    expect(onLoadMore).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('closes outline after successful locate', async () => {
    const onOutlineOpenChange = vi.fn()
    const onLocateMessage = vi.fn(async () => true)

    const { container } = render(
      <HappyThread
        {...makeProps({
          onOutlineOpenChange,
          onLocateMessage,
        })}
      />,
    )

    const target = document.createElement('div')
    target.id = 'hapi-message-user-text:msg-1'
    target.scrollIntoView = vi.fn()
    container.querySelector('.happy-thread-messages')?.appendChild(target)

    fireEvent.click(screen.getByRole('button', { name: /first message/i }))

    await waitFor(() => {
      expect(onOutlineOpenChange).toHaveBeenCalledWith(false)
    })
    expect(mocks.addToast).not.toHaveBeenCalled()
  })

  it('does not close outline and shows toast when locate fails', async () => {
    const onOutlineOpenChange = vi.fn()
    const onLocateMessage = vi.fn(async () => false)

    render(
      <HappyThread
        {...makeProps({
          onOutlineOpenChange,
          onLocateMessage,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /first message/i }))

    await waitFor(() => {
      expect(mocks.addToast).toHaveBeenCalled()
    })
    expect(onOutlineOpenChange).not.toHaveBeenCalledWith(false)
  })
})
