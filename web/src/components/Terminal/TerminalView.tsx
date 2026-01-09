import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { createFontProvider, type ITerminalFontProvider } from '@/lib/terminalFont'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { CheckIcon, CopyIcon } from '@/components/icons'

function resolveThemeColors(): { background: string; foreground: string; selectionBackground: string } {
    const styles = getComputedStyle(document.documentElement)
    const background = styles.getPropertyValue('--app-bg').trim() || '#000000'
    const foreground = styles.getPropertyValue('--app-fg').trim() || '#ffffff'
    const selectionBackground = styles.getPropertyValue('--app-subtle-bg').trim() || 'rgba(255, 255, 255, 0.2)'
    return { background, foreground, selectionBackground }
}

export function TerminalView(props: {
    onMount?: (terminal: Terminal) => void
    onResize?: (cols: number, rows: number) => void
    className?: string
}) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const onMountRef = useRef(props.onMount)
    const onResizeRef = useRef(props.onResize)
    const [fontProvider, setFontProvider] = useState<ITerminalFontProvider | null>(null)
    const { copied, copy } = useCopyToClipboard()
    const selectionTextRef = useRef('')
    const [selectionText, setSelectionText] = useState('')

    useEffect(() => {
        createFontProvider('default').then(setFontProvider)
    }, [])

    useEffect(() => {
        onMountRef.current = props.onMount
    }, [props.onMount])

    useEffect(() => {
        onResizeRef.current = props.onResize
    }, [props.onResize])

    useEffect(() => {
        const container = containerRef.current
        if (!container || !fontProvider) {
            return
        }

        if (selectionTextRef.current) {
            selectionTextRef.current = ''
            setSelectionText('')
        }

        const { background, foreground, selectionBackground } = resolveThemeColors()
        const terminal = new Terminal({
            cursorBlink: true,
            fontFamily: fontProvider.getFontFamily(),
            fontSize: 13,
            theme: {
                background,
                foreground,
                cursor: foreground,
                selectionBackground
            },
            convertEol: true,
            customGlyphs: true
        })

        const fitAddon = new FitAddon()
        const webLinksAddon = new WebLinksAddon()
        terminal.loadAddon(fitAddon)
        terminal.loadAddon(webLinksAddon)
        terminal.open(container)

        const selectionDisposable = terminal.onSelectionChange(() => {
            const text = terminal.getSelection()
            if (!text) {
                if (selectionTextRef.current) {
                    selectionTextRef.current = ''
                    setSelectionText('')
                }
                return
            }

            if (selectionTextRef.current !== text) {
                selectionTextRef.current = text
                setSelectionText(text)
            }
        })

        const resizeTerminal = () => {
            fitAddon.fit()
            onResizeRef.current?.(terminal.cols, terminal.rows)
        }

        const observer = new ResizeObserver(() => {
            requestAnimationFrame(resizeTerminal)
        })
        observer.observe(container)

        requestAnimationFrame(resizeTerminal)
        onMountRef.current?.(terminal)

        return () => {
            selectionDisposable.dispose()
            observer.disconnect()
            terminal.dispose()
        }
    }, [fontProvider])

    const handleCopyPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault()
    }, [])

    const handleCopyMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
    }, [])

    const handleCopySelection = useCallback(() => {
        const text = selectionTextRef.current
        if (!text) {
            return
        }
        void copy(text)
    }, [copy])

    return (
        <div className={`relative h-full w-full ${props.className ?? ''}`}>
            <div
                ref={containerRef}
                className="terminal-xterm h-full w-full"
            />
            {selectionText ? (
                <button
                    type="button"
                    onPointerDown={handleCopyPointerDown}
                    onMouseDown={handleCopyMouseDown}
                    onClick={handleCopySelection}
                    className="absolute right-1.5 top-1.5 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                    title="Copy"
                    aria-label="Copy selection"
                >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                </button>
            ) : null}
        </div>
    )
}
