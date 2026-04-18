import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { SessionSummary } from '@/types/api'
import { I18nContext } from '@/lib/i18n-context'
import { en } from '@/lib/locales'
import { SessionList, deduplicateSessionsByAgentId } from './SessionList'

vi.mock('@/hooks/mutations/useBulkSessionActions', () => ({
    useBulkSessionActions: () => ({
        bulkDeleteSessions: vi.fn(async () => ['inactive-1']),
        isPending: false,
    }),
}))

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        isPending: false,
    }),
}))

vi.mock('@/components/SessionActionMenu', () => ({ SessionActionMenu: () => null }))
vi.mock('@/components/RenameSessionDialog', () => ({ RenameSessionDialog: () => null }))

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    return {
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        metadata: null,
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        effort: null,
        ...overrides
    }
}

function renderWithProviders(ui: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const translations = en as Record<string, string>
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nContext.Provider value={{
                t: (key: string, params?: Record<string, string | number>) => {
                    const value = translations[key] ?? key
                    return params ? value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)) : value
                },
                locale: 'en',
                setLocale: vi.fn()
            }}>
                {ui}
            </I18nContext.Provider>
        </QueryClientProvider>
    )
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

describe('deduplicateSessionsByAgentId', () => {
    it('deduplicates sessions with the same agentSessionId', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('b')
    })

    it('keeps active session over inactive duplicate', () => {
        const sessions = [
            makeSession({ id: 'a', active: true, metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('a')
    })

    it('prefers selected session among inactive duplicates', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions, 'a')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('a')
    })

    it('active always wins over selected inactive', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 }),
            makeSession({ id: 'b', active: true, metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 })
        ]
        const result = deduplicateSessionsByAgentId(sessions, 'a')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('b')
    })

    it('passes through sessions without agentSessionId', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p' } }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' } }),
            makeSession({ id: 'c', metadata: null })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(3)
    })

    it('deduplicates independently across different agentSessionIds', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 }),
            makeSession({ id: 'c', metadata: { path: '/p', agentSessionId: 'thread-2' }, updatedAt: 100 }),
            makeSession({ id: 'd', metadata: { path: '/p', agentSessionId: 'thread-2' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(2)
        expect(result.map(s => s.id).sort()).toEqual(['b', 'd'])
    })
})

describe('SessionList bulk selection', () => {
    it('enters selection mode via long press when header is visible', async () => {
        const sessions = [
            makeSession({ id: 'inactive-1', active: false, metadata: { path: '/root/p1' } }),
            makeSession({ id: 'active-1', active: true, metadata: { path: '/root/p2' } }),
        ]

        renderWithProviders(
            <SessionList
                sessions={sessions}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                api={null}
                renderHeader
            />
        )

        await triggerLongPress(screen.getByTestId('session-item-inactive-1'))

        expect(await screen.findByRole('button', { name: 'Select all' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
        })
    })

    it('toggles selection from the checkbox button', async () => {
        const sessions = [
            makeSession({ id: 'inactive-1', active: false, metadata: { path: '/root/p1' } }),
        ]

        renderWithProviders(
            <SessionList
                sessions={sessions}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                api={null}
                renderHeader
            />
        )

        await triggerLongPress(screen.getByTestId('session-item-inactive-1'))

        const toggle = await screen.findByTestId('session-item-toggle-inactive-1')
        expect(toggle).toHaveAttribute('aria-pressed', 'true')

        fireEvent.click(toggle)

        await waitFor(() => {
            expect(toggle).toHaveAttribute('aria-pressed', 'false')
        })
    })
})
