export type TerminalCopyMode = 'xterm' | 'document'
export type TerminalContextMenuMode = 'xterm' | 'native'
export type TerminalViewportOffsetMode = 'top' | 'transform'

const QUERY_PARAM_COPY_MODE = 'terminal_copy'
const QUERY_PARAM_CONTEXT_MENU_MODE = 'terminal_contextmenu'
const QUERY_PARAM_VIEWPORT_OFFSET_MODE = 'terminal_offset'

const STORAGE_KEY_COPY_MODE = 'hapi:terminal.copyMode'
const STORAGE_KEY_CONTEXT_MENU_MODE = 'hapi:terminal.contextMenuMode'
const STORAGE_KEY_VIEWPORT_OFFSET_MODE = 'hapi:terminal.viewportOffsetMode'

function getQueryParam(name: string): string | null {
    if (typeof window === 'undefined') {
        return null
    }
    const value = new URLSearchParams(window.location.search).get(name)
    return value?.trim() || null
}

function getLocalStorageItem(key: string): string | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function getStringFlag(queryParam: string, storageKey: string): string | null {
    return getQueryParam(queryParam) ?? getLocalStorageItem(storageKey)
}

export function getTerminalCopyMode(): TerminalCopyMode {
    const mode = getStringFlag(QUERY_PARAM_COPY_MODE, STORAGE_KEY_COPY_MODE)
    if (mode === 'document') {
        return 'document'
    }
    if (mode === 'xterm') {
        return 'xterm'
    }

    const prefersTouch = typeof window !== 'undefined' ? (window.matchMedia?.('(pointer: coarse)')?.matches ?? false) : false
    if (prefersTouch) {
        return 'document'
    }
    return 'xterm'
}

export function getTerminalContextMenuMode(): TerminalContextMenuMode {
    const mode = getStringFlag(QUERY_PARAM_CONTEXT_MENU_MODE, STORAGE_KEY_CONTEXT_MENU_MODE)
    if (mode === 'native') {
        return 'native'
    }
    if (mode === 'xterm') {
        return 'xterm'
    }

    const prefersTouch = typeof window !== 'undefined' ? (window.matchMedia?.('(pointer: coarse)')?.matches ?? false) : false
    if (prefersTouch) {
        return 'native'
    }
    return 'xterm'
}

export function getTerminalViewportOffsetMode(): TerminalViewportOffsetMode {
    const mode = getStringFlag(QUERY_PARAM_VIEWPORT_OFFSET_MODE, STORAGE_KEY_VIEWPORT_OFFSET_MODE)
    if (mode === 'transform') {
        return 'transform'
    }
    return 'top'
}
