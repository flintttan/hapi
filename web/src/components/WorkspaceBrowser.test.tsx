import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/lib/i18n-context'
import { WorkspaceBrowser } from './WorkspaceBrowser'

function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                {ui}
            </I18nProvider>
        </QueryClientProvider>
    )
}

describe('WorkspaceBrowser', () => {
    it('shows precise guidance when workspace browsing is disabled for the selected machine', async () => {
        const api = {
            listMachineDirectory: vi.fn(),
        } as any

        renderWithProviders(
            <WorkspaceBrowser
                api={api}
                machines={[
                    {
                        id: 'm1',
                        metadata: {
                            host: 'devbox',
                            displayName: 'Dev Box',
                            workspaceRoots: [],
                        },
                    } as any,
                ]}
                machinesLoading={false}
                onStartSession={vi.fn()}
                initialMachineId="m1"
            />
        )

        expect(await screen.findByText('Workspace browsing is off')).toBeInTheDocument()
        expect(screen.getByText(/Restart the runner with one or more workspace roots/i)).toBeInTheDocument()
        expect(screen.getByText(/New Session” page by entering a directory manually/i)).toBeInTheDocument()
        expect(screen.getByText(/new sessions must stay within those allowed roots/i)).toBeInTheDocument()
    })
})
