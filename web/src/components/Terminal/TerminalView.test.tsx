import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalView } from './TerminalView'

const fitMock = vi.fn()
const disposeMock = vi.fn()
const openMock = vi.fn()
const loadAddonMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@xterm/xterm', () => ({
    Terminal: class {
        cols = 80
        rows = 24
        options = { fontFamily: 'mock-font' }
        open = openMock
        loadAddon = loadAddonMock
        refresh = refreshMock
        dispose = disposeMock
    }
}))

vi.mock('@xterm/addon-fit', () => ({
    FitAddon: class {
        fit = fitMock
        dispose = disposeMock
    }
}))

vi.mock('@xterm/addon-web-links', () => ({
    WebLinksAddon: class {
        dispose = disposeMock
    }
}))

vi.mock('@xterm/addon-canvas', () => ({
    CanvasAddon: class {
        dispose = disposeMock
    }
}))

vi.mock('@/lib/terminalFont', () => ({
    ensureBuiltinFontLoaded: vi.fn(async () => false),
    getFontProvider: () => ({
        getFontFamily: () => 'mock-font'
    })
}))

vi.mock('@/hooks/useTerminalFontSize', () => ({
    getInitialTerminalFontSize: () => 13
}))

describe('TerminalView', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        globalThis.ResizeObserver = class MockResizeObserver {
            constructor(_callback: ResizeObserverCallback) {}
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof ResizeObserver
    })

    it('applies terminal touch scrolling class to the root container', () => {
        render(<TerminalView className="custom-class" />)

        const container = screen.getByTestId('terminal-view')
        expect(container).toHaveClass('terminal-xterm')
        expect(container).toHaveClass('h-full')
        expect(container).toHaveClass('w-full')
        expect(container).toHaveClass('custom-class')
    })
})
