import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/lib/i18n-context'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { SessionList } from './SessionList'

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    return {
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        metadata: { path: '/repo/app', machineId: 'machine-1' },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        effort: null,
        ...overrides
    }
}

function renderSessionList(options?: {
    api?: ApiClient | null
    renderHeader?: boolean
    sessions?: SessionSummary[]
}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    const onSelect = vi.fn()
    const onNewSession = vi.fn()
    const onRefresh = vi.fn()
    const sessions = options?.sessions ?? [
        makeSession({ id: 's1', updatedAt: 200 }),
        makeSession({ id: 's2', updatedAt: 100 }),
    ]

    render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <SessionList
                    sessions={sessions}
                    selectedSessionId={null}
                    onSelect={onSelect}
                    onNewSession={onNewSession}
                    onRefresh={onRefresh}
                    isLoading={false}
                    renderHeader={options?.renderHeader ?? false}
                    api={options?.api ?? null}
                    machineLabelsById={{ 'machine-1': 'Local Machine' }}
                />
            </I18nProvider>
        </QueryClientProvider>
    )

    return { onSelect, onNewSession, onRefresh }
}

beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }))
})

describe('SessionList bulk actions', () => {
    it('shows the bulk manage entry when the embedded sidebar header is hidden', () => {
        renderSessionList({ renderHeader: false })

        expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument()
    })

    it('bulk deletes selected visible inactive sessions from the embedded sidebar', async () => {
        const bulkDeleteSessions = vi.fn(async () => ({ ok: true, deletedSessionIds: ['s1', 's2'] }))
        const api = { bulkDeleteSessions } as unknown as ApiClient
        renderSessionList({ api, renderHeader: false })

        fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))

        await waitFor(() => expect(bulkDeleteSessions).toHaveBeenCalledWith(['s1', 's2']))
    })
})
