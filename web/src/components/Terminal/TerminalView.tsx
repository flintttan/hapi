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
    const viewportRef = useRef<HTMLElement | null>(null)
    const touchScrollRef = useRef<{
        startY: number
        startScrollTop: number
        startTime: number
        isScrolling: boolean
    } | null>(null)
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

        viewportRef.current = container.querySelector<HTMLElement>('.xterm-viewport')

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                touchScrollRef.current = null
                return
            }
            const viewport = viewportRef.current
            if (!viewport || viewport.scrollHeight <= viewport.clientHeight) {
                touchScrollRef.current = null
                return
            }
            const touch = event.touches[0]
            touchScrollRef.current = {
                startY: touch.clientY,
                startScrollTop: viewport.scrollTop,
                startTime: performance.now(),
                isScrolling: false,
            }
        }

        const handleTouchMove = (event: TouchEvent) => {
            const state = touchScrollRef.current
            const viewport = viewportRef.current
            if (!state || !viewport || viewport.scrollHeight <= viewport.clientHeight) {
                return
            }
            if (event.touches.length !== 1) {
                return
            }
            const selection = document.getSelection()
            if (selection && !selection.isCollapsed) {
                return
            }

            const touch = event.touches[0]
            const deltaY = touch.clientY - state.startY
            if (!state.isScrolling) {
                if (performance.now() - state.startTime > 220) {
                    return
                }
                if (Math.abs(deltaY) < 4) {
                    return
                }
                state.isScrolling = true
            }

            event.preventDefault()
            viewport.scrollTop = state.startScrollTop - deltaY
        }

        const handleTouchEnd = () => {
            touchScrollRef.current = null
        }

        const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
        if (isTouchDevice) {
            container.addEventListener('touchstart', handleTouchStart, { passive: true })
            container.addEventListener('touchmove', handleTouchMove, { passive: false })
            container.addEventListener('touchend', handleTouchEnd, { passive: true })
            container.addEventListener('touchcancel', handleTouchEnd, { passive: true })
        }

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
            observer.disconnect()
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)
            container.removeEventListener('touchcancel', handleTouchEnd)
            viewportRef.current = null
            touchScrollRef.current = null
            terminal.dispose()
        }
    }, [fontProvider])

    const handleSelectionChange = useCallback(() => {
        const container = containerRef.current
        if (!container) {
            return
        }
        const selection = document.getSelection()
        if (!selection || selection.isCollapsed) {
            if (selectionTextRef.current) {
                selectionTextRef.current = ''
                setSelectionText('')
            }
            return
        }

        const anchorNode = selection.anchorNode
        const focusNode = selection.focusNode
        const selectionInside = (anchorNode && container.contains(anchorNode)) || (focusNode && container.contains(focusNode))
        if (!selectionInside) {
            if (selectionTextRef.current) {
                selectionTextRef.current = ''
                setSelectionText('')
            }
            return
        }

        const text = selection.toString()
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
    }, [])

    useEffect(() => {
        document.addEventListener('selectionchange', handleSelectionChange)
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange)
        }
    }, [handleSelectionChange])

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
