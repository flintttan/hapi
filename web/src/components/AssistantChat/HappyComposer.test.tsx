import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FormEventHandler, ReactNode, TextareaHTMLAttributes } from 'react'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { HappyComposer } from './HappyComposer'

const mocks = vi.hoisted(() => ({
    assistantState: {
        composer: {
            text: '',
            attachments: [],
        },
        thread: {
            isRunning: false,
            isDisabled: false,
        },
    },
    send: vi.fn(),
    setText: vi.fn(),
    addAttachment: vi.fn(),
    cancelRun: vi.fn(),
    suggestions: [] as Suggestion[],
    selectedIndex: -1,
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    clearSuggestions: vi.fn(),
}))

vi.mock('@assistant-ui/react', async () => {
    const React = await import('react')

    return {
        useAssistantApi: () => ({
            composer: () => ({
                send: mocks.send,
                setText: mocks.setText,
                addAttachment: mocks.addAttachment,
            }),
            thread: () => ({
                cancelRun: mocks.cancelRun,
            }),
        }),
        useAssistantState: (selector: (state: typeof mocks.assistantState) => unknown) => selector(mocks.assistantState),
        ComposerPrimitive: {
            Root: ({ children, onSubmit, className }: { children: ReactNode; onSubmit?: FormEventHandler<HTMLFormElement>; className?: string }) => (
                <form className={className} onSubmit={onSubmit}>
                    {children}
                </form>
            ),
            Input: React.forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & {
                submitOnEnter?: boolean
                cancelOnEscape?: boolean
                maxRows?: number
            }>(function MockInput({ submitOnEnter, cancelOnEscape, maxRows: _maxRows, ...props }, ref) {
                return (
                    <textarea
                        {...props}
                        ref={ref}
                        data-testid="composer-input"
                        data-submit-on-enter={String(submitOnEnter)}
                        data-cancel-on-escape={String(cancelOnEscape)}
                    />
                )
            }),
            Attachments: () => null,
        },
    }
})

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
        isTouch: false,
    }),
}))

vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: () => ({
        isStandalone: false,
        isIOS: false,
    }),
}))

vi.mock('@/hooks/useActiveWord', () => ({
    useActiveWord: () => null,
}))

vi.mock('@/hooks/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [
        mocks.suggestions,
        mocks.selectedIndex,
        mocks.moveUp,
        mocks.moveDown,
        mocks.clearSuggestions,
    ],
}))

vi.mock('@/hooks/useComposerDraft', () => ({
    useComposerDraft: vi.fn(),
}))

vi.mock('@/components/ChatInput/FloatingOverlay', () => ({
    FloatingOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ChatInput/Autocomplete', () => ({
    Autocomplete: () => <div data-testid="autocomplete" />,
}))

vi.mock('@/components/AssistantChat/StatusBar', () => ({
    StatusBar: () => <div data-testid="status-bar" />,
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: ({ onSend }: { onSend: () => void }) => (
        <button type="button" data-testid="composer-send" onClick={onSend}>
            send
        </button>
    ),
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null,
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

describe('HappyComposer keyboard behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.assistantState.composer.text = 'hello'
        mocks.assistantState.composer.attachments = []
        mocks.assistantState.thread.isRunning = false
        mocks.assistantState.thread.isDisabled = false
        mocks.suggestions = []
        mocks.selectedIndex = -1
        mocks.setText.mockImplementation((text: string) => {
            mocks.assistantState.composer.text = text
        })
    })

    it('disables submitOnEnter so Enter can default to newline behavior', () => {
        render(<HappyComposer sessionId="session-1" />)

        expect(screen.getByTestId('composer-input')).toHaveAttribute('data-submit-on-enter', 'false')
    })

    it('does not send on plain Enter', () => {
        render(<HappyComposer sessionId="session-1" />)

        fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter' })

        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('sends on Ctrl+Enter', () => {
        render(<HappyComposer sessionId="session-1" />)

        fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter', ctrlKey: true })

        expect(mocks.send).toHaveBeenCalledTimes(1)
    })

    it('sends on Cmd+Enter', () => {
        render(<HappyComposer sessionId="session-1" />)

        fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter', metaKey: true })

        expect(mocks.send).toHaveBeenCalledTimes(1)
    })

    it('uses plain Enter to select suggestions instead of sending', () => {
        mocks.assistantState.composer.text = ''
        mocks.suggestions = [{ text: '/help', source: 'builtin' } as Suggestion]
        mocks.selectedIndex = 0

        render(<HappyComposer sessionId="session-1" />)

        fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter' })

        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.setText).toHaveBeenCalledWith('/help ')
    })
})
