import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueuedMessagesBar } from '@/components/AssistantChat/QueuedMessagesBar'
import type { DecryptedMessage } from '@/types/api'

const mocks = vi.hoisted(() => ({
  state: {
    sessionId: 'session-1',
    messages: [] as DecryptedMessage[],
    pending: [] as DecryptedMessage[],
  },
  setText: vi.fn(),
  removeOptimisticMessage: vi.fn(),
  cancelMutate: vi.fn(),
}))

vi.mock('@assistant-ui/react', () => ({
  useAssistantApi: () => ({
    composer: () => ({ setText: mocks.setText }),
  }),
}))

vi.mock('@/hooks/queries/useMessages', () => ({
  EMPTY_STATE: {
    sessionId: 'session-1',
    messages: [],
    pending: [],
    pendingCount: 0,
    hasMore: false,
    oldestAt: null,
    oldestSeq: null,
    newestSeq: null,
    isLoading: false,
    isLoadingMore: false,
    warning: null,
    atBottom: true,
    messagesVersion: 0,
  },
}))

vi.mock('@/lib/message-window-store', () => ({
  subscribeMessageWindow: (_sessionId: string, _listener: () => void) => () => {},
  getMessageWindowState: () => mocks.state,
  removeOptimisticMessage: mocks.removeOptimisticMessage,
}))

vi.mock('@/hooks/mutations/useCancelQueuedMessage', () => ({
  useCancelQueuedMessage: () => ({
    isPending: false,
    variables: undefined,
    mutate: mocks.cancelMutate,
  }),
}))

vi.mock('@/lib/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'queuedMessages.title') return 'Queued messages'
      if (key === 'queuedMessages.edit') return 'Edit queued message'
      if (key === 'queuedMessages.cancel') return 'Cancel queued message'
      if (key === 'queuedMessages.scheduledFor') return `Scheduled for ${params?.time ?? ''}`
      return key
    }
  })
}))


function makeStoredQueuedMessage(overrides: Partial<DecryptedMessage> = {}) {
  return {
    id: 'server-1',
    seq: 1,
    localId: 'local-server-1',
    content: { role: 'user', content: { type: 'text', text: 'server queued' } },
    createdAt: Date.now(),
    invokedAt: null,
    scheduledAt: null,
    ...overrides,
  } satisfies DecryptedMessage
}

function makeOptimisticMessage(status: 'sending' | 'queued' = 'queued') {
  return {
    id: 'local-1',
    seq: null,
    localId: 'local-1',
    content: { role: 'user', content: { type: 'text', text: 'hello queued' } },
    createdAt: Date.now(),
    invokedAt: null,
    scheduledAt: null,
    status,
    originalText: 'hello queued',
  } satisfies DecryptedMessage
}

describe('QueuedMessagesBar local optimistic controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state = {
      sessionId: 'session-1',
      messages: [makeOptimisticMessage('queued')],
      pending: [],
    }
  })

  it('does not show a normally sending optimistic message as queued', () => {
    mocks.state = {
      sessionId: 'session-1',
      messages: [makeOptimisticMessage('sending')],
      pending: [],
    }

    render(<QueuedMessagesBar sessionId="session-1" api={null} />)

    expect(screen.queryByText('Queued messages')).not.toBeInTheDocument()
  })

  it('shows a stored server queued message even without client-only status', () => {
    mocks.state = {
      sessionId: 'session-1',
      messages: [makeStoredQueuedMessage()],
      pending: [],
    }

    render(<QueuedMessagesBar sessionId="session-1" api={null} />)

    expect(screen.getByText('Queued messages')).toBeInTheDocument()
    expect(screen.getByText('server queued')).toBeInTheDocument()
  })

  it('does not show a stored invoked message as queued', () => {
    mocks.state = {
      sessionId: 'session-1',
      messages: [makeStoredQueuedMessage({ invokedAt: Date.now() })],
      pending: [],
    }

    render(<QueuedMessagesBar sessionId="session-1" api={null} />)

    expect(screen.queryByText('Queued messages')).not.toBeInTheDocument()
  })

  it('allows editing a queued optimistic message before server echo', () => {
    const onEdit = vi.fn()
    render(<QueuedMessagesBar sessionId="session-1" api={null} onEdit={onEdit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit queued message' }))

    expect(mocks.removeOptimisticMessage).toHaveBeenCalledWith('session-1', 'local-1')
    expect(mocks.setText).toHaveBeenCalledWith('hello queued')
    expect(onEdit).toHaveBeenCalled()
    expect(mocks.cancelMutate).not.toHaveBeenCalled()
  })

  it('allows cancelling a queued optimistic message before server echo', () => {
    render(<QueuedMessagesBar sessionId="session-1" api={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued message' }))

    expect(mocks.removeOptimisticMessage).toHaveBeenCalledWith('session-1', 'local-1')
    expect(mocks.cancelMutate).not.toHaveBeenCalled()
  })
})
