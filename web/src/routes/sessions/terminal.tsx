import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useParams } from '@tanstack/react-router'
import type { Terminal } from '@xterm/xterm'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSession } from '@/hooks/queries/useSession'
import { useTerminalSocket } from '@/hooks/useTerminalSocket'
import { useVisualViewportMetrics } from '@/hooks/useVisualViewportHeight'
import { TerminalView } from '@/components/Terminal/TerminalView'
import { LoadingState } from '@/components/LoadingState'
function BackIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function ConnectionIndicator(props: { status: 'idle' | 'connecting' | 'connected' | 'error' }) {
    const isConnected = props.status === 'connected'
    const isConnecting = props.status === 'connecting'
    const label = isConnected ? 'Connected' : isConnecting ? 'Connecting' : 'Offline'
    const colorClass = isConnected
        ? 'bg-emerald-500'
        : isConnecting
            ? 'bg-amber-400 animate-pulse'
            : 'bg-[var(--app-hint)]'

    return (
        <div className="flex items-center" aria-label={label} title={label} role="status">
            <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
        </div>
    )
}

type QuickInput = {
    label: string
    sequence: string
    description: string
}

const QUICK_INPUTS_PRIMARY: QuickInput[] = [
    { label: 'Esc', sequence: '\u001b', description: 'Escape' },
    { label: 'Tab', sequence: '\t', description: 'Tab' },
    { label: '↑', sequence: '\u001b[A', description: 'Arrow Up' },
    { label: '↓', sequence: '\u001b[B', description: 'Arrow Down' },
    { label: 'Ctrl+C', sequence: '\u0003', description: 'Interrupt (SIGINT)' },
]

const QUICK_INPUTS_SECONDARY: QuickInput[] = [
    { label: '←', sequence: '\u001b[D', description: 'Arrow Left' },
    { label: '→', sequence: '\u001b[C', description: 'Arrow Right' },
    { label: 'Home', sequence: '\u001b[H', description: 'Home' },
    { label: 'End', sequence: '\u001b[F', description: 'End' },
    { label: 'Ctrl+L', sequence: '\u000c', description: 'Clear screen' },
    { label: 'Ctrl+D', sequence: '\u0004', description: 'EOF' },
]

function fallbackCopyToClipboard(text: string): boolean {
    try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.top = '0'
        textarea.style.left = '-9999px'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const ok = document.execCommand('copy')
        textarea.remove()
        return ok
    } catch {
        return false
    }
}

async function writeClipboardText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return fallbackCopyToClipboard(text)
    }
}

async function readClipboardText(): Promise<string | null> {
    try {
        return await navigator.clipboard.readText()
    } catch {
        const manual = window.prompt('Paste text')
        return manual === null ? null : manual
    }
}

export default function TerminalPage() {
    const { sessionId } = useParams({ from: '/sessions/$sessionId/terminal' })
    const { api, token } = useAppContext()
    const goBack = useAppGoBack()
    const { session } = useSession(api, sessionId)
    const visualViewportMetrics = useVisualViewportMetrics()
    const terminalId = useMemo(() => {
        if (typeof crypto?.randomUUID === 'function') {
            return crypto.randomUUID()
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }, [sessionId])
    const terminalRef = useRef<Terminal | null>(null)
    const inputDisposableRef = useRef<{ dispose: () => void } | null>(null)
    const connectOnceRef = useRef(false)
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
    const [exitInfo, setExitInfo] = useState<{ code: number | null; signal: string | null } | null>(null)
    const [showAllQuickInputs, setShowAllQuickInputs] = useState(false)
    const [copyMode, setCopyMode] = useState(false)
    const longPressTimeoutRef = useRef<number | null>(null)
    const touchGestureRef = useRef<{
        startX: number
        startY: number
        lastY: number
        accumulatedY: number
        isScrolling: boolean
    } | null>(null)

    const {
        state: terminalState,
        connect,
        write,
        resize,
        close,
        disconnect,
        onOutput,
        onExit
    } = useTerminalSocket({
        token,
        sessionId,
        terminalId
    })

    useEffect(() => {
        onOutput((data) => {
            terminalRef.current?.write(data)
        })
    }, [onOutput])

    useEffect(() => {
        onExit((code, signal) => {
            setExitInfo({ code, signal })
            terminalRef.current?.write(`\r\n[process exited${code !== null ? ` with code ${code}` : ''}]`)
        })
    }, [onExit])

    const handleRetry = useCallback(() => {
        const size = lastSizeRef.current
        if (!size) {
            return
        }
        setExitInfo(null)
        connectOnceRef.current = true
        connect(size.cols, size.rows)
    }, [connect])

    const handleTerminalMount = useCallback((terminal: Terminal) => {
        terminalRef.current = terminal
        inputDisposableRef.current?.dispose()
        inputDisposableRef.current = terminal.onData((data) => {
            write(data)
        })
    }, [write])

    const handleResize = useCallback((cols: number, rows: number) => {
        lastSizeRef.current = { cols, rows }
        if (!session?.active) {
            return
        }
        if (!connectOnceRef.current) {
            connectOnceRef.current = true
            connect(cols, rows)
        } else {
            resize(cols, rows)
        }
    }, [session?.active, connect, resize])

    useEffect(() => {
        if (!session?.active) {
            return
        }
        if (connectOnceRef.current) {
            return
        }
        const size = lastSizeRef.current
        if (!size) {
            return
        }
        connectOnceRef.current = true
        connect(size.cols, size.rows)
    }, [session?.active, connect])

    useEffect(() => {
        connectOnceRef.current = false
        setExitInfo(null)
        setCopyMode(false)
        close()
        disconnect()
    }, [sessionId, close, disconnect])

    useEffect(() => {
        return () => {
            inputDisposableRef.current?.dispose()
            connectOnceRef.current = false
            close()
            disconnect()
        }
    }, [close, disconnect])

    useEffect(() => {
        if (session?.active === false) {
            disconnect()
            connectOnceRef.current = false
        }
    }, [session?.active, disconnect])

    useEffect(() => {
        if (terminalState.status === 'error') {
            return
        }
        if (terminalState.status === 'connecting' || terminalState.status === 'connected') {
            setExitInfo(null)
        }
    }, [terminalState.status])

    const quickInputDisabled = !session?.active || terminalState.status !== 'connected'
    const handleQuickInput = useCallback((sequence: string) => {
        if (quickInputDisabled) {
            return
        }
        write(sequence)
        terminalRef.current?.focus()
    }, [quickInputDisabled, write])

    const clearLongPress = useCallback(() => {
        if (longPressTimeoutRef.current !== null) {
            window.clearTimeout(longPressTimeoutRef.current)
            longPressTimeoutRef.current = null
        }
        touchGestureRef.current = null
    }, [])

    const handleTerminalTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
        if (copyMode) {
            return
        }
        if (event.touches.length !== 1) {
            return
        }
        const touch = event.touches[0]
        if (!touch) {
            return
        }

        touchGestureRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            lastY: touch.clientY,
            accumulatedY: 0,
            isScrolling: false
        }
        if (longPressTimeoutRef.current !== null) {
            window.clearTimeout(longPressTimeoutRef.current)
        }

        longPressTimeoutRef.current = window.setTimeout(() => {
            longPressTimeoutRef.current = null
            setCopyMode(true)
        }, 550)
    }, [copyMode])

    const handleTerminalTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
        if (copyMode) {
            return
        }
        const gesture = touchGestureRef.current
        const touch = event.touches[0]
        if (!gesture || !touch) {
            return
        }

        const totalDx = touch.clientX - gesture.startX
        const totalDy = touch.clientY - gesture.startY
        const movedEnoughToCancelLongPress = Math.abs(totalDx) > 12 || Math.abs(totalDy) > 12

        if (movedEnoughToCancelLongPress) {
            if (longPressTimeoutRef.current !== null) {
                window.clearTimeout(longPressTimeoutRef.current)
                longPressTimeoutRef.current = null
            }
        }

        if (!gesture.isScrolling) {
            if (Math.abs(totalDy) <= 12) {
                return
            }
            if (Math.abs(totalDy) <= Math.abs(totalDx)) {
                return
            }
            gesture.isScrolling = true
        }

        const terminal = terminalRef.current
        if (!terminal) {
            return
        }

        const dy = touch.clientY - gesture.lastY
        gesture.lastY = touch.clientY
        gesture.accumulatedY += dy

        const elementHeight = terminal.element?.getBoundingClientRect().height ?? 0
        const estimatedLineHeight = terminal.rows > 0 && elementHeight > 0 ? elementHeight / terminal.rows : 0
        const lineHeight = estimatedLineHeight > 4 ? estimatedLineHeight : 16

        const lines = Math.trunc(gesture.accumulatedY / lineHeight)
        if (lines !== 0) {
            terminal.scrollLines(-lines)
            gesture.accumulatedY -= lines * lineHeight
        }

        event.preventDefault()
    }, [copyMode])

    const handleTerminalTouchEnd = useCallback(() => {
        clearLongPress()
    }, [clearLongPress])

    const handleCopy = useCallback(async () => {
        const terminal = terminalRef.current
        if (!terminal) return

        const selection = window.getSelection()
        const domText = selection?.toString() ?? ''
        const selectionInTerminal =
            !!selection &&
            !!terminal.element &&
            ((selection.anchorNode && terminal.element.contains(selection.anchorNode)) ||
                (selection.focusNode && terminal.element.contains(selection.focusNode)))

        let text = selectionInTerminal ? domText : terminal.getSelection()
        if (!text) {
            terminal.selectAll()
            text = terminal.getSelection()
        }
        if (!text) return

        await writeClipboardText(text)
        setCopyMode(false)
    }, [])

    const handlePaste = useCallback(async () => {
        if (quickInputDisabled) return
        const text = await readClipboardText()
        if (!text) return

        write(text)
        terminalRef.current?.focus()
        setCopyMode(false)
    }, [quickInputDisabled, write])

    const handleSelectAll = useCallback(() => {
        const terminal = terminalRef.current
        const selection = window.getSelection()
        const accessibilityTree = terminal?.element?.querySelector('.xterm-accessibility-tree')

        if (selection && accessibilityTree) {
            selection.removeAllRanges()
            const range = document.createRange()
            range.selectNodeContents(accessibilityTree)
            selection.addRange(range)
            return
        }

        terminal?.selectAll()
    }, [])

    const handleClearSelection = useCallback(() => {
        try {
            window.getSelection()?.removeAllRanges()
        } catch {
            // ignore
        }
        terminalRef.current?.clearSelection()
    }, [])

    const handleCloseCopyMode = useCallback(() => {
        setCopyMode(false)
    }, [])

    if (!session) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    const subtitle = session.metadata?.path ?? sessionId
    const status = terminalState.status
    const errorMessage = terminalState.status === 'error' ? terminalState.error : null
    const viewportHeight = visualViewportMetrics?.height
    const viewportOffsetTop = visualViewportMetrics?.offsetTop ?? 0

    return (
        <div
            className="flex h-full flex-col"
            // Prefer VisualViewport height so the bottom quick keys stay above mobile keyboards.
            // Also compensate `offsetTop` (iOS/WebViews can pan the visual viewport when the keyboard is open).
            style={{
                height: viewportHeight ? `${viewportHeight}px` : 'var(--tg-viewport-height, 100dvh)',
                transform: viewportOffsetTop ? `translateY(${viewportOffsetTop}px)` : undefined,
            }}
        >
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">Terminal</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{subtitle}</div>
                    </div>
                    <ConnectionIndicator status={status} />
                </div>
            </div>

            {session.active ? null : (
                <div className="px-3 pt-3">
                    <div className="mx-auto w-full max-w-content rounded-md bg-[var(--app-subtle-bg)] p-3 text-sm text-[var(--app-hint)]">
                        Session is inactive. Terminal is unavailable.
                    </div>
                </div>
            )}

            {errorMessage ? (
                <div className="mx-auto w-full max-w-content px-3 pt-3">
                    <div className="rounded-md border border-[var(--app-badge-error-border)] bg-[var(--app-badge-error-bg)] p-3 text-xs text-[var(--app-badge-error-text)]">
                        {errorMessage}
                    </div>
                    {session.active ? (
                        <div className="mt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="rounded-md bg-[var(--app-link)] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                                Retry
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {exitInfo ? (
                <div className="mx-auto w-full max-w-content px-3 pt-3">
                    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3 text-xs text-[var(--app-hint)]">
                        Terminal exited{exitInfo.code !== null ? ` with code ${exitInfo.code}` : ''}{exitInfo.signal ? ` (${exitInfo.signal})` : ''}.
                    </div>
                </div>
            ) : null}

            <div className="flex-1 overflow-hidden bg-[var(--app-bg)]">
                <div
                    className={`mx-auto h-full w-full max-w-content p-3 relative ${copyMode ? 'terminal-copy-mode' : ''}`}
                    onContextMenu={(event) => {
                        // Keep desktop right-click behavior; avoid iOS long-press callout.
                        if (!copyMode && navigator.maxTouchPoints > 0) {
                            event.preventDefault()
                        }
                    }}
                >
                    <div
                        className="h-full w-full"
                        onTouchStartCapture={handleTerminalTouchStart}
                        onTouchMoveCapture={handleTerminalTouchMove}
                        onTouchEndCapture={handleTerminalTouchEnd}
                        onTouchCancelCapture={handleTerminalTouchEnd}
                    >
                        <TerminalView
                            onMount={handleTerminalMount}
                            onResize={handleResize}
                            className="h-full w-full"
                        />
                    </div>

                    {copyMode ? (
                        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
                            <div className="pointer-events-auto rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg">
                                <div className="flex items-center gap-1 p-1">
                                    <button
                                        type="button"
                                        onClick={handleCloseCopyMode}
                                        className="rounded px-3 py-1.5 text-sm font-medium text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                                    >
                                        Close
                                    </button>
                                    <div className="h-6 w-px bg-[var(--app-border)]" aria-hidden="true" />
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        className="rounded px-3 py-1.5 text-sm font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                                    >
                                        Copy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePaste}
                                        disabled={quickInputDisabled}
                                        className="rounded px-3 py-1.5 text-sm font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Paste
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSelectAll}
                                        className="rounded px-3 py-1.5 text-sm font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                                    >
                                        Select all
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearSelection}
                                        className="rounded px-3 py-1.5 text-sm font-medium text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="bg-[var(--app-bg)] border-t border-[var(--app-border)] pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto w-full max-w-content px-3">
                    <div className="py-3">
                        <div className="rounded-md bg-[var(--app-border)] p-px">
                            <div className="grid grid-cols-6 gap-px">
                                {QUICK_INPUTS_PRIMARY.map((input) => (
                                    <button
                                        key={input.label}
                                        type="button"
                                        onClick={() => handleQuickInput(input.sequence)}
                                        disabled={quickInputDisabled}
                                        className="flex items-center justify-center bg-[var(--app-secondary-bg)] px-2 py-1.5 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--app-secondary-bg)]"
                                        aria-label={input.description}
                                        title={input.description}
                                    >
                                        {input.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setShowAllQuickInputs((prev) => !prev)}
                                    className="flex items-center justify-center bg-[var(--app-secondary-bg)] px-2 py-1.5 text-sm font-medium text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] focus-visible:ring-inset"
                                    aria-label={showAllQuickInputs ? 'Hide more keys' : 'Show more keys'}
                                    title={showAllQuickInputs ? 'Hide more keys' : 'Show more keys'}
                                >
                                    {showAllQuickInputs ? 'Less' : 'More'}
                                </button>
                            </div>
                        </div>

                        {showAllQuickInputs ? (
                            <div className="mt-2 rounded-md bg-[var(--app-border)] p-px">
                                <div className="grid grid-cols-6 gap-px">
                                    {QUICK_INPUTS_SECONDARY.map((input) => (
                                        <button
                                            key={input.label}
                                            type="button"
                                            onClick={() => handleQuickInput(input.sequence)}
                                            disabled={quickInputDisabled}
                                            className="flex items-center justify-center bg-[var(--app-secondary-bg)] px-2 py-1.5 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--app-secondary-bg)]"
                                            aria-label={input.description}
                                            title={input.description}
                                        >
                                            {input.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}
