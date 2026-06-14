import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import FilePage from './file'

const getGitDiffFileMock = vi.fn(async () => ({ success: true, stdout: '' }))
const readSessionFileMock = vi.fn(async () => ({
    success: true,
    content: btoa('name,age\nAda,30\nBob,40')
}))

vi.mock('@tanstack/react-router', () => ({
    useParams: () => ({ sessionId: 'session-1' }),
    useSearch: () => ({ path: 'report.csv', staged: false })
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: {
            getGitDiffFile: getGitDiffFileMock,
            readSessionFile: readSessionFileMock
        }
    })
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => vi.fn()
}))

vi.mock('@/lib/shiki', () => ({
    langAlias: {},
    useShikiHighlighter: () => null
}))

function renderWithProviders() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <FilePage />
            </I18nProvider>
        </QueryClientProvider>
    )
}

describe('FilePage', () => {
    it('renders csv file previews as a table', async () => {
        renderWithProviders()

        const table = await screen.findByRole('table')
        expect(table).toBeInTheDocument()
        expect(await screen.findByRole('columnheader', { name: 'name' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'age' })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: 'Ada' })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: '30' })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: 'Bob' })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: '40' })).toBeInTheDocument()
    })
})
