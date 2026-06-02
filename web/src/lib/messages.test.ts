import { describe, expect, it } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import { mergeMessages } from '@/lib/messages'

function makeMessage(overrides: Partial<DecryptedMessage>): DecryptedMessage {
  return {
    id: 'm1',
    seq: 1,
    localId: 'local-1',
    content: { role: 'user', content: { type: 'text', text: 'hello' } },
    createdAt: 100,
    invokedAt: null,
    scheduledAt: null,
    ...overrides,
  }
}

describe('mergeMessages', () => {
  it('does not let a stale server echo revert an invoked queued message', () => {
    const invoked = makeMessage({ invokedAt: 200, status: 'sent' })
    const staleEcho = makeMessage({ invokedAt: null })

    const merged = mergeMessages([invoked], [staleEcho])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'm1', invokedAt: 200, status: 'sent' })
  })

  it('preserves optimistic sending status when server echo arrives before invoked ack', () => {
    const optimistic = makeMessage({
      id: 'local-1',
      seq: null,
      status: 'sending',
      originalText: 'hello',
    })
    const serverEcho = makeMessage({
      id: 'server-1',
      seq: 2,
      invokedAt: null,
    })

    const merged = mergeMessages([optimistic], [serverEcho])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'server-1',
      localId: 'local-1',
      status: 'sending',
      originalText: 'hello',
      invokedAt: null,
    })
  })
})
