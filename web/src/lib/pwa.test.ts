import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBaseAssetUrl, getBasePath, getInstallDismissed, pwaInstallStorage, setInstallDismissed } from '@/lib/pwa'

describe('pwa helpers', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.stubEnv('BASE_URL', '/app/')
    })

    afterEach(() => {
        localStorage.clear()
        vi.unstubAllEnvs()
    })

    it('builds base-relative paths', () => {
        expect(getBasePath()).toBe('/app/')
        expect(getBasePath('sessions/abc')).toBe('/app/sessions/abc')
    })

    it('builds absolute asset urls from base path', () => {
        expect(getBaseAssetUrl('pwa-192x192.png')).toBe('http://localhost:3000/app/pwa-192x192.png')
    })

    it('stores install dismissal with ttl', () => {
        const now = Date.UTC(2026, 5, 2)
        setInstallDismissed(now)
        expect(localStorage.getItem(pwaInstallStorage.key)).toBe(String(now + pwaInstallStorage.ttlMs))
        expect(getInstallDismissed(now + 1000)).toBe(true)
    })

    it('expires install dismissal after ttl', () => {
        const now = Date.UTC(2026, 5, 2)
        localStorage.setItem(pwaInstallStorage.key, String(now - 1))
        expect(getInstallDismissed(now)).toBe(false)
        expect(localStorage.getItem(pwaInstallStorage.key)).toBeNull()
    })
})
