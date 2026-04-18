import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { I18nContext } from '@/lib/i18n-context'
import { en } from '@/lib/locales'
import { SessionHeader } from '@/components/SessionHeader'

vi.mock('@/hooks/useTelegram', () => ({
  isTelegramApp: () => false,
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
  useSessionActions: () => ({
    archiveSession: vi.fn(),
    renameSession: vi.fn(),
    deleteSession: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/lib/sessionModelLabel', () => ({
  getSessionModelLabel: () => null,
}))

vi.mock('@/components/SessionActionMenu', () => ({
  SessionActionMenu: () => null,
}))

vi.mock('@/components/RenameSessionDialog', () => ({
  RenameSessionDialog: () => null,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}))

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const translations = en as Record<string, string>
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nContext.Provider value={{ t: (key: string) => translations[key] ?? key, locale: 'en', setLocale: vi.fn() }}>
        {ui}
      </I18nContext.Provider>
    </QueryClientProvider>
  )
}

const session = {
  id: 'session-1',
  namespace: 'user-1',
  seq: 0,
  createdAt: 0,
  updatedAt: 0,
  active: true,
  activeAt: 0,
  metadata: {
    path: '/tmp/project',
    host: 'test-host',
    flavor: 'codex',
  },
  metadataVersion: 1,
  agentState: null,
  agentStateVersion: 1,
  thinking: false,
  thinkingAt: 0,
  permissionMode: undefined,
  collaborationMode: undefined,
  model: null,
  modelReasoningEffort: null,
  effort: null,
}

describe('SessionHeader search UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state text and disables navigation when query is blank', () => {
    renderWithProviders(
      <SessionHeader
        session={session}
        onBack={vi.fn()}
        api={null}
        searchOpen
        searchQuery=""
        searchResultCount={0}
        activeSearchIndex={0}
        onSearchOpenChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSearchPrev={vi.fn()}
        onSearchNext={vi.fn()}
      />
    )

    expect(screen.getByText('Type to search')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous result' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next result' })).toBeDisabled()
  })

  it('shows no-results text when query has no matches', () => {
    renderWithProviders(
      <SessionHeader
        session={session}
        onBack={vi.fn()}
        api={null}
        searchOpen
        searchQuery="missing"
        searchResultCount={0}
        activeSearchIndex={0}
        onSearchOpenChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSearchPrev={vi.fn()}
        onSearchNext={vi.fn()}
      />
    )

    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('routes Enter and Shift+Enter to next/previous search navigation', () => {
    const onSearchPrev = vi.fn()
    const onSearchNext = vi.fn()

    renderWithProviders(
      <SessionHeader
        session={session}
        onBack={vi.fn()}
        api={null}
        searchOpen
        searchQuery="result"
        searchResultCount={2}
        activeSearchIndex={0}
        onSearchOpenChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSearchPrev={onSearchPrev}
        onSearchNext={onSearchNext}
      />
    )

    const input = screen.getByRole('searchbox', { name: 'Search messages' })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(onSearchNext).toHaveBeenCalledTimes(1)
    expect(onSearchPrev).toHaveBeenCalledTimes(1)
  })
})
