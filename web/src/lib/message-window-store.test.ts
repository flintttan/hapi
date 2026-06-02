import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import {
  appendOptimisticMessage,
  clearMessageWindow,
  fetchOlderMessages,
  getMessageWindowState,
  ingestIncomingMessages,
  markMessagesConsumed,
} from '@/lib/message-window-store'

;(globalThis as typeof globalThis & {
  requestAnimationFrame?: typeof requestAnimationFrame
  cancelAnimationFrame?: typeof cancelAnimationFrame
}).requestAnimationFrame = ((cb: FrameRequestCallback) => {
  cb(0)
  return 1
}) as typeof requestAnimationFrame

;(globalThis as typeof globalThis & {
  cancelAnimationFrame?: typeof cancelAnimationFrame
}).cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame

function makeMessage(id: string, seq: number, createdAt: number): DecryptedMessage {
  return {
    id,
    seq,
    localId: null,
    content: { role: 'user', content: { type: 'text', text: id } },
    createdAt,
    invokedAt: null,
    scheduledAt: null,
  }
}

describe('message-window-store pagination', () => {
  beforeEach(() => {
    clearMessageWindow('session-1')
    vi.clearAllMocks()
  })

  it('tracks oldestAt from message position and uses beforeAt+beforeSeq when loading older pages', async () => {
    appendOptimisticMessage('session-1', makeMessage('m2', 2, 1000))
    appendOptimisticMessage('session-1', makeMessage('m3', 3, 1000))

    const api = {
      getMessages: vi.fn(async () => ({
        messages: [],
        page: { limit: 50, nextBeforeSeq: null, nextBeforeAt: null, hasMore: false }
      }))
    }

    const state = getMessageWindowState('session-1')
    expect(state.oldestSeq).toBe(2)
    expect(state.oldestAt).toBe(1000)

    ;(getMessageWindowState('session-1') as { hasMore: boolean }).hasMore = true
    await fetchOlderMessages(api as any, 'session-1')

    expect(api.getMessages).toHaveBeenCalledWith('session-1', {
      limit: 50,
      beforeSeq: 2,
      beforeAt: 1000,
    })
  })

  it('does not regress a consumed optimistic message back to queued when a late server echo arrives', () => {
    appendOptimisticMessage('session-1', {
      id: 'local-1',
      seq: null,
      localId: 'local-1',
      content: { role: 'user', content: { type: 'text', text: 'hello' } },
      createdAt: 1000,
      invokedAt: null,
      scheduledAt: null,
      status: 'queued',
      originalText: 'hello',
    })

    markMessagesConsumed('session-1', ['local-1'], 2000)

    ingestIncomingMessages('session-1', [{
      id: 'server-1',
      seq: 2,
      localId: 'local-1',
      content: { role: 'user', content: { type: 'text', text: 'hello' } },
      createdAt: 1000,
      invokedAt: null,
      scheduledAt: null,
    }])

    const state = getMessageWindowState('session-1')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      id: 'server-1',
      localId: 'local-1',
      invokedAt: 2000,
      status: 'sent',
      originalText: 'hello',
    })
  })
})
