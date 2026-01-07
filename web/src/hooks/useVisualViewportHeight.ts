import { useEffect, useState } from 'react'

/**
 * Returns the current VisualViewport height (rounded px) when available.
 * Useful for keeping bottom UI above mobile keyboards that overlay the layout viewport.
 */
export function useVisualViewportHeight(): number | null {
    const [height, setHeight] = useState<number | null>(null)

    useEffect(() => {
        const viewport = window.visualViewport
        if (!viewport) {
            setHeight(null)
            return
        }

        const update = () => {
            const next = Math.max(0, Math.round(viewport.height))
            setHeight((prev) => (prev === next ? prev : next))
        }

        update()
        viewport.addEventListener('resize', update)
        viewport.addEventListener('scroll', update)
        window.addEventListener('resize', update)

        return () => {
            viewport.removeEventListener('resize', update)
            viewport.removeEventListener('scroll', update)
            window.removeEventListener('resize', update)
        }
    }, [])

    return height
}

