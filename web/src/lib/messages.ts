import type { InfiniteData } from '@tanstack/react-query'
import type { DecryptedMessage, MessagesResponse } from '@/types/api'

export function makeClientSideId(prefix: string): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}-${crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random()}`
}

export function isUserMessage(msg: DecryptedMessage): boolean {
    const content = msg.content
    if (content && typeof content === 'object' && 'role' in content) {
        return (content as { role: string }).role === 'user'
    }
    return false
}

function isOptimisticMessage(msg: DecryptedMessage): boolean {
    return Boolean(msg.localId && msg.id === msg.localId)
}

function hasInvokedAt(msg: DecryptedMessage): boolean {
    return msg.invokedAt !== null && msg.invokedAt !== undefined
}

function resolveMessageStatus(current?: DecryptedMessage['status'], incoming?: DecryptedMessage['status']): DecryptedMessage['status'] {
    if (current === 'failed' || incoming === 'failed') {
        return current === 'failed' ? current : incoming
    }
    if (current === 'sent' || incoming === 'sent') {
        return current === 'sent' ? current : incoming
    }
    if (current === 'queued' || incoming === 'queued') {
        return current === 'queued' ? current : incoming
    }
    return current ?? incoming
}

function mergeMessageState(base: DecryptedMessage, candidate: DecryptedMessage): DecryptedMessage {
    return {
        ...candidate,
        invokedAt: hasInvokedAt(base) ? base.invokedAt : candidate.invokedAt,
        status: resolveMessageStatus(base.status, candidate.status),
        originalText: base.originalText ?? candidate.originalText,
    }
}

function compareMessages(a: DecryptedMessage, b: DecryptedMessage): number {
    const aSeq = typeof a.seq === 'number' ? a.seq : null
    const bSeq = typeof b.seq === 'number' ? b.seq : null

    if (aSeq !== null && bSeq !== null && aSeq !== bSeq) {
        return aSeq - bSeq
    }

    if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt
    }
    return a.id.localeCompare(b.id)
}

export function mergeMessages(existing: DecryptedMessage[], incoming: DecryptedMessage[]): DecryptedMessage[] {
    if (existing.length === 0) {
        return [...incoming].sort(compareMessages)
    }
    if (incoming.length === 0) {
        return [...existing].sort(compareMessages)
    }

    const byId = new Map<string, DecryptedMessage>()
    for (const msg of existing) {
        byId.set(msg.id, msg)
    }
    for (const msg of incoming) {
        const current = byId.get(msg.id)
        if (current) {
            byId.set(msg.id, mergeMessageState(current, msg))
            continue
        }
        byId.set(msg.id, msg)
    }

    let merged = Array.from(byId.values())

    const optimisticByLocalId = new Map<string, DecryptedMessage>()
    for (const msg of merged) {
        if (msg.localId && isOptimisticMessage(msg)) {
            optimisticByLocalId.set(msg.localId, msg)
        }
    }

    if (optimisticByLocalId.size > 0) {
        merged = merged.map((msg) => {
            if (!msg.localId || isOptimisticMessage(msg)) {
                return msg
            }
            const optimistic = optimisticByLocalId.get(msg.localId)
            if (!optimistic) {
                return msg
            }
            return mergeMessageState(optimistic, msg)
        })
    }

    const incomingStoredLocalIds = new Set<string>()
    for (const msg of incoming) {
        if (msg.localId && !isOptimisticMessage(msg)) {
            incomingStoredLocalIds.add(msg.localId)
        }
    }

    // If we received stored messages with a localId, drop any optimistic bubbles with the same localId.
    if (incomingStoredLocalIds.size > 0) {
        merged = merged.filter((msg) => {
            if (!msg.localId || !incomingStoredLocalIds.has(msg.localId)) {
                return true
            }
            return !isOptimisticMessage(msg)
        })
    }

    // Fallback: if an optimistic message was marked as sent but we didn't get a localId echo,
    // drop it when a server user message appears close in time.
    const optimisticMessages = merged.filter((m) => isOptimisticMessage(m))
    const nonOptimisticMessages = merged.filter((m) => !isOptimisticMessage(m))
    const result: DecryptedMessage[] = [...nonOptimisticMessages]

    for (const optimistic of optimisticMessages) {
        if (optimistic.status === 'sent') {
            const hasServerUserMessage = nonOptimisticMessages.some((m) =>
                isUserMessage(m) &&
                Math.abs(m.createdAt - optimistic.createdAt) < 10_000
            )
            if (hasServerUserMessage) {
                continue
            }
        }
        result.push(optimistic)
    }

    result.sort(compareMessages)
    return result
}

export function upsertMessagesInCache(
    data: InfiniteData<MessagesResponse> | undefined,
    incoming: DecryptedMessage[],
): InfiniteData<MessagesResponse> {
    const mergedIncoming = mergeMessages([], incoming)

    if (!data || data.pages.length === 0) {
        return {
            pages: [
                {
                    messages: mergedIncoming,
                    page: {
                        limit: 50,
                        nextBeforeSeq: null,
                        nextBeforeAt: null,
                        hasMore: false,
                    },
                },
            ],
            pageParams: [null],
        }
    }

    const pages = data.pages.slice()
    const first = pages[0]
    pages[0] = {
        ...first,
        messages: mergeMessages(first.messages, mergedIncoming),
    }

    return {
        ...data,
        pages,
    }
}
