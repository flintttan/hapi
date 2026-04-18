import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nContext } from '@/lib/i18n-context'

const mockUseAppContext = vi.fn(() => ({ api: {} }))
const mockUseSession = vi.fn(() => ({ session: null, isLoading: false, error: 'not found', refetch: vi.fn() }))
const mockUseMessages = vi.fn(() => ({
  messages: [], warning: null, isLoading: false, isLoadingMore: false, hasMore: false,
  pendingCount: 0, messagesVersion: 0, loadMore: vi.fn(), refetch: vi.fn(), flushPending: vi.fn(), setAtBottom: vi.fn(),
}))
const mockUseSendMessage = vi.fn(() => ({ sendMessage: vi.fn(), retryMessage: vi.fn(), isSending: false }))
const mockUseSessions = vi.fn(() => ({ sessions: [], isLoading: false, error: null, refetch: vi.fn() }))
const mockUseMachines = vi.fn(() => ({ machines: [], isLoading: false, error: null, refetch: vi.fn() }))
const mockUseSlashCommands = vi.fn(() => ({ commands: [], getSuggestions: vi.fn(async () => []) }))
const mockUseSkills = vi.fn(() => ({ getSuggestions: vi.fn(async () => []) }))
const mockUseLocation = vi.fn(({ select }: { select: (v: { pathname: string }) => string }) => select({ pathname: '/sessions/s1' }))
const mockUseParams = vi.fn(() => ({ sessionId: 's1' }))

vi.mock('@/lib/app-context', () => ({ useAppContext: () => mockUseAppContext() }))
vi.mock('@/App', () => ({ App: () => <div data-testid="app-root" /> }))
vi.mock('@/hooks/useAppGoBack', () => ({ useAppGoBack: () => vi.fn() }))
vi.mock('@/hooks/useTelegram', () => ({
  isTelegramApp: () => false,
  getTelegramWebApp: () => null,
}))
vi.mock('@/hooks/useSidebarResize', () => ({ useSidebarResize: () => ({ width: 320, isDragging: false, onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn() }) }))
vi.mock('@/hooks/queries/useSession', () => ({ useSession: () => mockUseSession() }))
vi.mock('@/hooks/queries/useMessages', () => ({ useMessages: () => mockUseMessages() }))
vi.mock('@/hooks/mutations/useSendMessage', () => ({ useSendMessage: () => mockUseSendMessage() }))
vi.mock('@/hooks/queries/useSessions', () => ({ useSessions: () => mockUseSessions() }))
vi.mock('@/hooks/queries/useMachines', () => ({ useMachines: () => mockUseMachines() }))
vi.mock('@/hooks/queries/useSlashCommands', () => ({ useSlashCommands: () => mockUseSlashCommands() }))
vi.mock('@/hooks/queries/useSkills', () => ({ useSkills: () => mockUseSkills() }))
vi.mock('@/lib/toast-context', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/components/SessionChat', () => ({ SessionChat: () => <div>session chat</div> }))
vi.mock('@/components/SessionList', () => ({ SessionList: () => <div>session list</div> }))
vi.mock('@/components/NewSession', () => ({ NewSession: () => <div>new session</div> }))
vi.mock('@/routes/sessions/files', () => ({ default: () => <div>files</div> }))
vi.mock('@/routes/sessions/file', () => ({ default: () => <div>file</div> }))
vi.mock('@/routes/sessions/terminal', () => ({ default: () => <div>terminal</div> }))
vi.mock('@/routes/settings', () => ({ default: () => <div>settings</div> }))
vi.mock('@/lib/message-window-store', () => ({ fetchLatestMessages: vi.fn(), seedMessageWindowFromSession: vi.fn() }))
vi.mock('@/lib/clearDraftsAfterSend', () => ({ clearDraftsAfterSend: vi.fn() }))
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return { ...actual, useQueryClient: () => ({ prefetchQuery: vi.fn(), setQueryData: vi.fn() }) }
})
vi.mock('@tanstack/react-router', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const createMockRoute = (config: Record<string, unknown> = {}) => ({
    ...config,
    addChildren(children: unknown[]) {
      return {
        ...this,
        children,
      }
    },
  })
  return {
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
    Outlet: () => <div data-testid="outlet" />,
    createRootRoute: (config?: Record<string, unknown>) => createMockRoute(config),
    createRoute: (config: Record<string, unknown>) => createMockRoute(config),
    createRouter: (config: unknown) => config,
    useLocation: (arg: unknown) => mockUseLocation(arg as never),
    useMatchRoute: () => vi.fn(() => ({ sessionId: 's1' })),
    useNavigate: () => vi.fn(),
    useParams: () => mockUseParams(),
  }
})

import { routeTree } from '@/router'

describe('router SessionPage fallback', () => {
  it('redirects to /sessions when session is missing after load', () => {
    const SessionComponent = (routeTree as any).children.find((route: any) => route.path === '/sessions')
      .children.find((route: any) => route.path === '$sessionId').component

    render(
      <I18nContext.Provider value={{ t: (key: string) => key, locale: 'en', setLocale: vi.fn() }}>
        <SessionComponent />
      </I18nContext.Provider>
    )

    expect(screen.getByTestId('navigate')).toHaveTextContent('/sessions')
  })
})
