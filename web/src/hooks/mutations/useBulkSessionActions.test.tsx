import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useBulkSessionActions } from './useBulkSessionActions'
import type { ApiClient } from '@/api/client'
import { clearMessageWindow } from '@/lib/message-window-store'

vi.mock('@/lib/message-window-store', () => ({
    clearMessageWindow: vi.fn(),
}))

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    })
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
}

describe('useBulkSessionActions', () => {
    it('deduplicates ids and clears deleted session windows', async () => {
        const bulkDeleteSessions = vi.fn(async () => ({ ok: true, deletedSessionIds: ['s1', 's2'] }))
        const api = { bulkDeleteSessions } as unknown as ApiClient

        const { result } = renderHook(() => useBulkSessionActions(api), { wrapper: createWrapper() })

        let deleted: string[] = []
        await act(async () => {
            deleted = await result.current.bulkDeleteSessions(['s1', 's1', 's2'])
        })

        await waitFor(() => {
            expect(bulkDeleteSessions).toHaveBeenCalledWith(['s1', 's2'])
        })
        expect(deleted).toEqual(['s1', 's2'])
        expect(clearMessageWindow).toHaveBeenCalledWith('s1')
        expect(clearMessageWindow).toHaveBeenCalledWith('s2')
    })
})
