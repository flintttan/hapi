import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'hapi-sidebar-width'
const MIN_WIDTH = 280
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 420

function clamp(value: number): number {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value))
}

function loadWidth(): number {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
        const parsed = Number(stored)
        if (Number.isFinite(parsed)) return clamp(parsed)
    }
    return DEFAULT_WIDTH
}

export function useSidebarResize() {
    const [width, setWidth] = useState(loadWidth)
    const [isDragging, setIsDragging] = useState(false)
    const startXRef = useRef(0)
    const startWidthRef = useRef(0)

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        startXRef.current = e.clientX
        startWidthRef.current = width
        setIsDragging(true)
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }, [width])

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return
        const delta = e.clientX - startXRef.current
        setWidth(clamp(startWidthRef.current + delta))
    }, [isDragging])

    const onPointerUp = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)
    }, [isDragging])

    // Persist width to localStorage when drag ends
    useEffect(() => {
        if (!isDragging) {
            localStorage.setItem(STORAGE_KEY, String(width))
        }
    }, [isDragging, width])

    // Prevent text selection while dragging
    useEffect(() => {
        if (isDragging) {
            document.body.style.userSelect = 'none'
            document.body.style.cursor = 'col-resize'
        } else {
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
        }
        return () => {
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
        }
    }, [isDragging])

    return { width, isDragging, onPointerDown, onPointerMove, onPointerUp }
}
