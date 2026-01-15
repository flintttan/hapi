import { useMutation } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    getMessageWindowState,
    updateMessageStatus,
} from '@/lib/message-window-store'
import { usePlatform } from '@/hooks/usePlatform'

type SendMessageInput = {
    sessionId: string
    text: string
    localId: string
    createdAt: number
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

export function useSendMessage(api: ApiClient | null, sessionId: string | null): {
    sendMessage: (text: string) => void
    retryMessage: (localId: string) => void
    isSending: boolean
} {
    const { haptic } = usePlatform()

    const mutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            await api.sendMessage(input.sessionId, input.text, input.localId)
        },
        onMutate: async (input) => {
            const optimisticMessage: DecryptedMessage = {
                id: input.localId,
                seq: null,
                localId: input.localId,
                content: { role: 'user', content: input.text },
                createdAt: input.createdAt,
                status: 'sending',
                originalText: input.text,
            }

            appendOptimisticMessage(input.sessionId, optimisticMessage)
        },
        onSuccess: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'sent')
            haptic.notification('success')
        },
        onError: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'failed')
            haptic.notification('error')
        },
    })

    const sendMessage = (text: string) => {
        if (!api || !sessionId) return
        if (mutation.isPending) return
        const localId = makeClientSideId('local')
        mutation.mutate({
            sessionId,
            text,
            localId,
            createdAt: Date.now(),
        })
    }

    const retryMessage = (localId: string) => {
        if (!api || !sessionId) return
        if (mutation.isPending) return

        const message = findMessageByLocalId(sessionId, localId)
        if (!message?.originalText) return

        updateMessageStatus(sessionId, localId, 'sending')

        mutation.mutate({
            sessionId,
            text: message.originalText,
            localId,
            createdAt: message.createdAt,
        })
    }

    return {
        sendMessage,
        retryMessage,
        isSending: mutation.isPending,
    }
}
