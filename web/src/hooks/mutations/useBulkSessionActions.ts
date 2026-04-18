import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { clearMessageWindow } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'

export function useBulkSessionActions(api: ApiClient | null): {
    bulkDeleteSessions: (sessionIds: string[]) => Promise<string[]>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const bulkDeleteMutation = useMutation({
        mutationFn: async (sessionIds: string[]) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            const uniqueIds = Array.from(new Set(sessionIds))
            if (uniqueIds.length === 0) {
                return []
            }
            const response = await api.bulkDeleteSessions(uniqueIds)
            return response.deletedSessionIds
        },
        onSuccess: async (deletedSessionIds) => {
            for (const sessionId of deletedSessionIds) {
                queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) })
                clearMessageWindow(sessionId)
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        },
    })

    return {
        bulkDeleteSessions: bulkDeleteMutation.mutateAsync,
        isPending: bulkDeleteMutation.isPending,
    }
}
