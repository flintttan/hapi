import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HappyThread } from '@/components/AssistantChat/HappyThread'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
}))

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
