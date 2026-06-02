const INSTALL_DISMISSED_KEY = 'pwa_install_dismissed_until'
const INSTALL_DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7

function normalizeBase(baseUrl: string): string {
    if (!baseUrl || baseUrl === '/') {
        return '/'
    }

    const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function getOrigin(): string {
    if (typeof self !== 'undefined' && 'location' in self && self.location?.origin) {
        return self.location.origin
    }
    if (typeof window !== 'undefined') {
        return window.location.origin
    }
    return ''
}

export function getBaseUrl(): string {
    return normalizeBase(import.meta.env.BASE_URL || '/')
}

export function getBasePath(path = ''): string {
    const base = getBaseUrl()
    if (!path) {
        return base
    }

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path
    return `${base}${normalizedPath}`
}

export function getBaseAssetUrl(path: string): string {
    if (!path) {
        return getBaseUrl()
    }

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path
    return new URL(normalizedPath, `${getOrigin()}${getBaseUrl()}`).toString()
}

export function getInstallDismissed(now = Date.now()): boolean {
    try {
        const raw = localStorage.getItem(INSTALL_DISMISSED_KEY)
        if (!raw) {
            return false
        }

        const dismissedUntil = Number(raw)
        if (!Number.isFinite(dismissedUntil)) {
            localStorage.removeItem(INSTALL_DISMISSED_KEY)
            return false
        }

        if (dismissedUntil <= now) {
            localStorage.removeItem(INSTALL_DISMISSED_KEY)
            return false
        }

        return true
    } catch {
        return false
    }
}

export function setInstallDismissed(now = Date.now()): void {
    try {
        localStorage.setItem(INSTALL_DISMISSED_KEY, String(now + INSTALL_DISMISS_TTL_MS))
    } catch {
        // Ignore storage errors
    }
}

export const pwaInstallStorage = {
    key: INSTALL_DISMISSED_KEY,
    ttlMs: INSTALL_DISMISS_TTL_MS
}
