import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import {
  appendOptimisticMessage,
  clearMessageWindow,
  fetchOlderMessages,
  getMessageWindowState,
} from '@/lib/message-window-store'

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
})
