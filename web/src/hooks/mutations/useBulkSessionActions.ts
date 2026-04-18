import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { clearMessageWindow } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'

export function useBulkSessionActions(api: ApiClient | null): {
    bulkArchiveSessions: (sessionIds: string[]) => Promise<string[]>
    bulkDeleteSessions: (sessionIds: string[]) => Promise<string[]>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const normalizeIds = (sessionIds: string[]) => Array.from(new Set(sessionIds))

    const bulkArchiveMutation = useMutation({
        mutationFn: async (sessionIds: string[]) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            const uniqueIds = normalizeIds(sessionIds)
            if (uniqueIds.length === 0) {
                return []
            }
            const response = await api.bulkArchiveSessions(uniqueIds)
            return response.archivedSessionIds
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        },
    })

    const bulkDeleteMutation = useMutation({
        mutationFn: async (sessionIds: string[]) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            const uniqueIds = normalizeIds(sessionIds)
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
        bulkArchiveSessions: bulkArchiveMutation.mutateAsync,
        bulkDeleteSessions: bulkDeleteMutation.mutateAsync,
        isPending: bulkArchiveMutation.isPending || bulkDeleteMutation.isPending,
    }
}
