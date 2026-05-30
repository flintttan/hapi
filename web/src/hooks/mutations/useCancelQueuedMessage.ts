import { useMutation } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage } from '@/types/api'
import { appendOptimisticMessage, removeOptimisticMessage } from '@/lib/message-window-store'

type CancelQueuedMessageInput = {
    sessionId: string
    messageId: string
    localId: string
    snapshot: DecryptedMessage
}

export function useCancelQueuedMessage(api: ApiClient | null) {
    return useMutation({
        mutationFn: async (input: CancelQueuedMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return api.cancelMessage(input.sessionId, input.messageId)
        },
        onMutate: async (input) => {
            removeOptimisticMessage(input.sessionId, input.messageId)
            return { snapshot: input.snapshot, sessionId: input.sessionId }
        },
        onError: (_error, _input, context) => {
            if (context?.snapshot && context.sessionId) {
                appendOptimisticMessage(context.sessionId, context.snapshot)
            }
        },
    })
}
