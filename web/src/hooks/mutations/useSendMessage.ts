import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, DecryptedMessage } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    getMessageWindowState,
    updateMessageStatus,
} from '@/lib/message-window-store'
import { usePlatform } from '@/hooks/usePlatform'
import { normalizeDecryptedMessage } from '@/chat/normalize'

type SendMessageInput = {
    sessionId: string
    text: string
    localId: string
    createdAt: number
    attachments?: AttachmentMetadata[]
    scheduledAt?: number | null
}

type BlockedReason = 'no-api' | 'no-session' | 'pending'

type UseSendMessageOptions = {
    resolveSessionId?: (sessionId: string) => Promise<string>
    onSessionResolved?: (sessionId: string) => void
    onBlocked?: (reason: BlockedReason) => void
    onSuccess?: (sessionId: string) => void
}

function isImmediatePendingUserMessage(message: DecryptedMessage, now: number): boolean {
    if (!message.localId) {
        return false
    }
    if (message.invokedAt != null || message.status === 'failed') {
        return false
    }
    if (message.scheduledAt != null && message.scheduledAt > now) {
        return false
    }
    return true
}

function hasPendingImmediateUserMessage(sessionId: string): boolean {
    const state = getMessageWindowState(sessionId)
    const allMessages = [...state.messages, ...state.pending]
    const now = Date.now()

    return allMessages.some((message) => isImmediatePendingUserMessage(message, now))
}

function shouldQueueOutgoingMessage(sessionId: string, scheduledAt?: number | null): boolean {
    const isFutureScheduled = scheduledAt != null && scheduledAt > Date.now()
    if (isFutureScheduled) {
        return true
    }
    return hasPendingImmediateUserMessage(sessionId)
}

function findMessageByLocalId(
    sessionId: string,
    localId: string,
): DecryptedMessage | null {
    const state = getMessageWindowState(sessionId)
    for (const message of state.messages) {
        if (message.localId === localId) return message
    }
    for (const message of state.pending) {
        if (message.localId === localId) return message
    }
    return null
}

export function useSendMessage(
    api: ApiClient | null,
    sessionId: string | null,
    options?: UseSendMessageOptions
): {
    sendMessage: (text: string, attachments?: AttachmentMetadata[], scheduledAt?: number | null) => Promise<boolean>
    retryMessage: (localId: string) => boolean
    isSending: boolean
} {
    const { haptic } = usePlatform()
    const [isResolving, setIsResolving] = useState(false)
    const resolveGuardRef = useRef(false)

    const mutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            await api.sendMessage(input.sessionId, input.text, input.localId, input.attachments, input.scheduledAt)
        },
        onMutate: async (input) => {
            const shouldQueue = shouldQueueOutgoingMessage(input.sessionId, input.scheduledAt)
            const status = shouldQueue ? 'queued' as const : 'sending' as const
            const optimisticMessage: DecryptedMessage = {
                id: input.localId,
                seq: null,
                localId: input.localId,
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: input.text,
                        attachments: input.attachments
                    }
                },
                createdAt: input.createdAt,
                invokedAt: null,
                scheduledAt: input.scheduledAt ?? null,
                status,
                originalText: input.text,
            }

            appendOptimisticMessage(input.sessionId, optimisticMessage)
            return { status }
        },
        onSuccess: (_, input, context) => {
            updateMessageStatus(input.sessionId, input.localId, context?.status === 'queued' ? 'queued' : 'sent')
            haptic.notification('success')
            options?.onSuccess?.(input.sessionId)
        },
        onError: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'failed')
            haptic.notification('error')
        },
    })

    const sendMessage = async (text: string, attachments?: AttachmentMetadata[], scheduledAt?: number | null): Promise<boolean> => {
        if (!api) {
            options?.onBlocked?.('no-api')
            haptic.notification('error')
            return false
        }
        if (!sessionId) {
            options?.onBlocked?.('no-session')
            haptic.notification('error')
            return false
        }
        if (mutation.isPending || resolveGuardRef.current) {
            options?.onBlocked?.('pending')
            return false
        }
        const localId = makeClientSideId('local')
        const createdAt = Date.now()
        let targetSessionId = sessionId
        if (options?.resolveSessionId) {
            resolveGuardRef.current = true
            setIsResolving(true)
            try {
                const resolved = await options.resolveSessionId(sessionId)
                if (resolved && resolved !== sessionId) {
                    options.onSessionResolved?.(resolved)
                    targetSessionId = resolved
                }
            } catch (error) {
                haptic.notification('error')
                console.error('Failed to resolve session before send:', error)
                return false
            } finally {
                resolveGuardRef.current = false
                setIsResolving(false)
            }
        }
        mutation.mutate({
            sessionId: targetSessionId,
            text,
            localId,
            createdAt,
            attachments,
            scheduledAt,
        })
        return true
    }

    const retryMessage = (localId: string): boolean => {
        if (!api) {
            options?.onBlocked?.('no-api')
            haptic.notification('error')
            return false
        }
        if (!sessionId) {
            options?.onBlocked?.('no-session')
            haptic.notification('error')
            return false
        }
        if (mutation.isPending || resolveGuardRef.current) {
            options?.onBlocked?.('pending')
            return false
        }

        const message = findMessageByLocalId(sessionId, localId)
        if (!message?.originalText) return false
        const normalized = normalizeDecryptedMessage(message)
        const attachments = normalized?.role === 'user' ? normalized.content.attachments : undefined

        updateMessageStatus(
            sessionId,
            localId,
            shouldQueueOutgoingMessage(sessionId, message.scheduledAt ?? null) ? 'queued' : 'sending',
        )

        mutation.mutate({
            sessionId,
            text: message.originalText,
            localId,
            createdAt: message.createdAt,
            attachments,
            scheduledAt: message.scheduledAt ?? null,
        })
        return true
    }

    return {
        sendMessage,
        retryMessage,
        isSending: mutation.isPending || isResolving,
    }
}
