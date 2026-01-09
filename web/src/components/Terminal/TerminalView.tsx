import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { createFontProvider, type ITerminalFontProvider } from '@/lib/terminalFont'
import { getTerminalContextMenuMode, getTerminalCopyMode } from '@/lib/terminalFlags'
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

        const prefersTouch = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
        const contextMenuMode = getTerminalContextMenuMode()

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

        let disposeTouchFeatures: (() => void) | undefined
        if (prefersTouch && terminal.element) {
            const touchTarget = terminal.element
            const scrollThresholdPx = 8
            const decayPerMs = 0.004
            const minVelocityPxPerMs = 0.08

            let startTouchX = 0
            let startTouchY = 0
            let lastTouchY = 0
            let lastTouchTime = 0
            let isTouchScrolling = false

            let rowHeightPx = 0
            let scrollOffsetPx = 0
            let pendingOffsetPx = 0
            let lastVelocityPxPerMs = 0
            let inertiaAnimationFrame: number | null = null
            let pendingScrollAnimationFrame: number | null = null
            let translateTargets: HTMLElement[] | null = null

            const resolveTranslateTargets = () => {
                if (translateTargets) {
                    return translateTargets
                }
                const targets: HTMLElement[] = []
                const rows = touchTarget.querySelector<HTMLElement>('.xterm-rows')
                if (rows) {
                    targets.push(rows)
                }
                const selection = touchTarget.querySelector<HTMLElement>('.xterm-selection')
                if (selection) {
                    targets.push(selection)
                }
                translateTargets = targets
                return targets
            }

            const setTranslatePx = (offsetPx: number) => {
                const targets = resolveTranslateTargets()
                const transform = offsetPx ? `translate3d(0, ${offsetPx}px, 0)` : ''
                for (const target of targets) {
                    if (transform) {
                        target.style.transform = transform
                    } else {
                        target.style.removeProperty('transform')
                    }
                }
            }

            const getRowHeightPx = () => {
                const rowElement = touchTarget.querySelector<HTMLElement>('.xterm-rows > div')
                if (rowElement) {
                    const height = Number.parseFloat(getComputedStyle(rowElement).height)
                    if (Number.isFinite(height) && height > 0) {
                        return height
                    }
                }
                const rect = touchTarget.getBoundingClientRect()
                const rows = terminal.rows || 24
                return rect.height / rows
            }

            const isDomSelectionActiveInsideTerminal = () => {
                const selection = document.getSelection()
                if (!selection || selection.isCollapsed) {
                    return false
                }
                const anchorNode = selection.anchorNode
                const focusNode = selection.focusNode
                return (anchorNode && touchTarget.contains(anchorNode)) || (focusNode && touchTarget.contains(focusNode))
            }

            const cancelInertia = () => {
                if (inertiaAnimationFrame !== null) {
                    cancelAnimationFrame(inertiaAnimationFrame)
                    inertiaAnimationFrame = null
                }
            }

            const cancelPendingScrollFlush = () => {
                if (pendingScrollAnimationFrame !== null) {
                    cancelAnimationFrame(pendingScrollAnimationFrame)
                    pendingScrollAnimationFrame = null
                }
            }

            const flushScroll = (snapToNearestLine: boolean) => {
                cancelPendingScrollFlush()
                if (pendingOffsetPx !== 0) {
                    scrollOffsetPx += pendingOffsetPx
                    pendingOffsetPx = 0
                }

                const height = rowHeightPx || getRowHeightPx()
                rowHeightPx = height

                if (height > 0) {
                    const ratio = scrollOffsetPx / height
                    const lineDelta = snapToNearestLine ? Math.round(ratio) : Math.trunc(ratio)
                    const linesToScroll = -lineDelta
                    if (linesToScroll !== 0) {
                        terminal.scrollLines(linesToScroll)
                    }
                }

                if (snapToNearestLine) {
                    scrollOffsetPx = 0
                } else if (height > 0) {
                    scrollOffsetPx += -Math.trunc(scrollOffsetPx / height) * height
                }

                setTranslatePx(scrollOffsetPx)
            }

            const scheduleFlushScroll = () => {
                if (pendingScrollAnimationFrame !== null) {
                    return
                }
                pendingScrollAnimationFrame = requestAnimationFrame(() => {
                    pendingScrollAnimationFrame = null
                    flushScroll(false)
                })
            }

            const startInertia = (initialVelocityPxPerMs: number) => {
                cancelInertia()
                let velocityPxPerMs = initialVelocityPxPerMs
                let lastFrameTime = Date.now()

                const tick = () => {
                    const now = Date.now()
                    const dt = Math.max(now - lastFrameTime, 1)
                    lastFrameTime = now

                    velocityPxPerMs *= Math.exp(-decayPerMs * dt)
                    pendingOffsetPx += velocityPxPerMs * dt
                    flushScroll(false)

                    if (Math.abs(velocityPxPerMs) < minVelocityPxPerMs) {
                        inertiaAnimationFrame = null
                        flushScroll(true)
                        return
                    }

                    inertiaAnimationFrame = requestAnimationFrame(tick)
                }

                inertiaAnimationFrame = requestAnimationFrame(tick)
            }

            const onTouchStart = (event: TouchEvent) => {
                if (event.touches.length !== 1) {
                    return
                }
                cancelInertia()
                flushScroll(true)

                const touch = event.touches[0]
                startTouchX = touch.clientX
                startTouchY = touch.clientY
                lastTouchY = touch.clientY
                lastTouchTime = Date.now()
                isTouchScrolling = false
                pendingOffsetPx = 0
                lastVelocityPxPerMs = 0
                rowHeightPx = getRowHeightPx()
            }

            const onTouchMove = (event: TouchEvent) => {
                if (event.touches.length !== 1) {
                    return
                }
                if (isDomSelectionActiveInsideTerminal()) {
                    return
                }

                const touch = event.touches[0]
                const dxTotal = touch.clientX - startTouchX
                const dyTotal = touch.clientY - startTouchY

                if (!isTouchScrolling) {
                    if (Math.abs(dyTotal) < scrollThresholdPx || Math.abs(dyTotal) < Math.abs(dxTotal)) {
                        return
                    }
                    isTouchScrolling = true
                }

                if (event.cancelable) {
                    event.preventDefault()
                }

                const now = Date.now()
                const dt = Math.max(now - lastTouchTime, 1)
                const dy = touch.clientY - lastTouchY

                pendingOffsetPx += dy
                scheduleFlushScroll()

                lastVelocityPxPerMs = dy / dt
                lastTouchY = touch.clientY
                lastTouchTime = now
            }

            const onTouchEnd = () => {
                if (!isTouchScrolling) {
                    return
                }
                isTouchScrolling = false
                cancelPendingScrollFlush()
                flushScroll(false)
                if (Math.abs(lastVelocityPxPerMs) >= minVelocityPxPerMs) {
                    startInertia(lastVelocityPxPerMs)
                } else {
                    flushScroll(true)
                }
            }

            const onContextMenuCapture = (event: MouseEvent) => {
                event.stopImmediatePropagation()
            }

            if (contextMenuMode === 'native') {
                touchTarget.addEventListener('contextmenu', onContextMenuCapture, true)
            }

            touchTarget.addEventListener('touchstart', onTouchStart, { passive: true })
            touchTarget.addEventListener('touchmove', onTouchMove, { passive: false })
            touchTarget.addEventListener('touchend', onTouchEnd, { passive: true })
            touchTarget.addEventListener('touchcancel', onTouchEnd, { passive: true })

            disposeTouchFeatures = () => {
                cancelInertia()
                cancelPendingScrollFlush()
                scrollOffsetPx = 0
                pendingOffsetPx = 0
                setTranslatePx(0)
                touchTarget.removeEventListener('touchstart', onTouchStart)
                touchTarget.removeEventListener('touchmove', onTouchMove)
                touchTarget.removeEventListener('touchend', onTouchEnd)
                touchTarget.removeEventListener('touchcancel', onTouchEnd)
                if (contextMenuMode === 'native') {
                    touchTarget.removeEventListener('contextmenu', onContextMenuCapture, true)
                }
            }
        }

        const copyMode = getTerminalCopyMode()
        let disposeSelection: (() => void) | undefined
        if (copyMode === 'xterm') {
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
            disposeSelection = () => selectionDisposable.dispose()
        } else {
            const handleSelectionChange = () => {
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
            }
            document.addEventListener('selectionchange', handleSelectionChange)
            disposeSelection = () => document.removeEventListener('selectionchange', handleSelectionChange)
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
            disposeSelection?.()
            disposeTouchFeatures?.()
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
