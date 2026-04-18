import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

async function triggerLongPress(element: HTMLElement) {
    vi.useFakeTimers()
    fireEvent.mouseDown(element, { button: 0 })
    await act(async () => {
        vi.advanceTimersByTime(550)
    })
    fireEvent.mouseUp(element, { button: 0 })
    await act(async () => {
        await Promise.resolve()
    })
    vi.useRealTimers()
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

afterEach(() => {
    vi.useRealTimers()
})

describe('SessionList bulk actions', () => {
    it('does not show manage button before entering selection mode', () => {
        renderSessionList({ renderHeader: false })

        expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument()
    })

    it('bulk deletes selected visible inactive sessions from the embedded sidebar', async () => {
        const bulkDeleteSessions = vi.fn(async () => ({ ok: true, deletedSessionIds: ['s1', 's2'] }))
        const api = { bulkDeleteSessions } as unknown as ApiClient
        renderSessionList({ api, renderHeader: false })

        await triggerLongPress(screen.getByTestId('session-item-s1'))

        fireEvent.click(await screen.findByRole('button', { name: 'Select all' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))

        await waitFor(() => expect(bulkDeleteSessions).toHaveBeenCalledWith(['s1', 's2']))
    })

    it('bulk archives selected active sessions after long press enters selection mode', async () => {
        const bulkArchiveSessions = vi.fn(async () => ({ ok: true, archivedSessionIds: ['s1', 's2'] }))
        const api = { bulkArchiveSessions } as unknown as ApiClient
        renderSessionList({
            api,
            renderHeader: false,
            sessions: [
                makeSession({ id: 's1', active: true, updatedAt: 200 }),
                makeSession({ id: 's2', active: true, updatedAt: 100 }),
            ]
        })

        await triggerLongPress(screen.getByTestId('session-item-s1'))

        fireEvent.click(await screen.findByRole('button', { name: 'Select all' }))
        fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
        fireEvent.click(screen.getByRole('button', { name: 'Archive selected', hidden: true }))

        await waitFor(() => {
            expect(bulkArchiveSessions).toHaveBeenCalledWith(['s1', 's2'])
        })
    })
})
