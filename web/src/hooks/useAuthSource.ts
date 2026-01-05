import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTelegramWebApp, isTelegramEnvironment } from './useTelegram'
import type { AuthSource } from './useAuth'

const ACCESS_TOKEN_PREFIX = 'hapi_access_token::'
const JWT_TOKEN_PREFIX = 'hapi_jwt_token::'
const JWT_USER_PREFIX = 'hapi_jwt_user::'

function getTelegramInitData(): string | null {
    const tg = getTelegramWebApp()
    if (tg?.initData) {
        return tg.initData
    }

    // Fallback: check URL parameters (for testing or alternative flows)
    const query = new URLSearchParams(window.location.search)
    const tgWebAppData = query.get('tgWebAppData')
    if (tgWebAppData) {
        return tgWebAppData
    }

    const initData = query.get('initData')
    return initData || null
}

function getAccessTokenKey(baseUrl: string): string {
    return `${ACCESS_TOKEN_PREFIX}${baseUrl}`
}

function getJwtTokenKey(baseUrl: string): string {
    return `${JWT_TOKEN_PREFIX}${baseUrl}`
}

function getJwtUserKey(baseUrl: string): string {
    return `${JWT_USER_PREFIX}${baseUrl}`
}

function getStoredAccessToken(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function getStoredJwtToken(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function storeJwtToken(key: string, token: string): void {
    try {
        localStorage.setItem(key, token)
    } catch {
        // Ignore storage errors
    }
}

function storeJwtUser(key: string, user: { id: number; username?: string; firstName?: string; lastName?: string }): void {
    try {
        localStorage.setItem(key, JSON.stringify(user))
    } catch {
        // Ignore storage errors
    }
}

function getStoredJwtUser(key: string): { id: number; username?: string; firstName?: string; lastName?: string } | null {
    try {
        const stored = localStorage.getItem(key)
        if (!stored) return null
        return JSON.parse(stored)
    } catch {
        return null
    }
}

function clearStoredJwtToken(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function clearStoredJwtUser(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function storeAccessToken(key: string, token: string): void {
    try {
        localStorage.setItem(key, token)
    } catch {
        // Ignore storage errors
    }
}

function clearStoredAccessToken(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function isJwtTokenValid(token: string): boolean {
    try {
        const parts = token.split('.')
        if (parts.length < 2) return false

        const payloadBase64Url = parts[1] ?? ''
        const payloadBase64 = payloadBase64Url
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(Math.ceil(payloadBase64Url.length / 4) * 4, '=')

        const decoded = globalThis.atob(payloadBase64)
        const payload = JSON.parse(decoded) as { exp?: unknown }
        if (typeof payload.exp !== 'number') return false

        // Check if token expires in more than 1 minute
        const expMs = payload.exp * 1000
        return expMs > Date.now() + 60_000
    } catch {
        return false
    }
}

export function useAuthSource(baseUrl: string): {
    authSource: AuthSource | null
    storedUser: { id: number; username?: string; firstName?: string; lastName?: string } | null
    isLoading: boolean
    isTelegram: boolean
    setAccessToken: (token: string, user?: { id: number; username?: string; firstName?: string; lastName?: string }) => void
    setPasswordAuth: (username: string, password: string) => void
    clearAuth: () => void
} {
    const [authSource, setAuthSource] = useState<AuthSource | null>(null)
    const [storedUser, setStoredUser] = useState<{ id: number; username?: string; firstName?: string; lastName?: string } | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isTelegram, setIsTelegram] = useState(false)
    const retryCountRef = useRef(0)
    const accessTokenKey = useMemo(() => getAccessTokenKey(baseUrl), [baseUrl])
    const jwtTokenKey = useMemo(() => getJwtTokenKey(baseUrl), [baseUrl])
    const jwtUserKey = useMemo(() => getJwtUserKey(baseUrl), [baseUrl])

    // Initialize auth source on mount, with retry for delayed Telegram initData
    useEffect(() => {
        retryCountRef.current = 0
        setAuthSource(null)
        setIsTelegram(false)
        setIsLoading(true)

        const telegramInitData = getTelegramInitData()

        if (telegramInitData) {
            // Telegram Mini App environment
            setAuthSource({ type: 'telegram', initData: telegramInitData })
            setIsTelegram(true)
            setIsLoading(false)
            return
        }

        // Check for stored JWT token first (from previous password login)
        const storedJwt = getStoredJwtToken(jwtTokenKey)
        if (storedJwt && isJwtTokenValid(storedJwt)) {
            // Valid JWT token found - create auth source to trigger useAuth
            const user = getStoredJwtUser(jwtUserKey)
            setStoredUser(user)
            setAuthSource({ type: 'accessToken', token: storedJwt })
            setIsLoading(false)
            return
        }

        // Check for stored access token as fallback
        const storedToken = getStoredAccessToken(accessTokenKey)
        if (storedToken) {
            setAuthSource({ type: 'accessToken', token: storedToken })
            setIsLoading(false)
            return
        }

        // Check if we're in a Telegram environment before polling
        if (!isTelegramEnvironment()) {
            // Plain browser - show login prompt immediately
            setIsLoading(false)
            return
        }

        // Telegram environment detected - poll for delayed initData
        // Telegram WebApp SDK may initialize slightly after page mount
        const maxRetries = 20
        const retryInterval = 250 // ms

        const interval = setInterval(() => {
            retryCountRef.current += 1
            const initData = getTelegramInitData()

            if (initData) {
                setAuthSource({ type: 'telegram', initData })
                setIsTelegram(true)
                setIsLoading(false)
                clearInterval(interval)
            } else if (retryCountRef.current >= maxRetries) {
                // Give up - show login prompt for browser access
                setIsLoading(false)
                clearInterval(interval)
            }
        }, retryInterval)

        return () => {
            clearInterval(interval)
        }
    }, [accessTokenKey, jwtTokenKey])

    const setAccessToken = useCallback((token: string, user?: { id: number; username?: string; firstName?: string; lastName?: string }) => {
        // Determine if this is a JWT token (from password auth) or CLI_API_TOKEN
        const isJwt = token.split('.').length === 3

        if (isJwt) {
            // Store as JWT token and clear any old access token
            storeJwtToken(jwtTokenKey, token)
            if (user) {
                storeJwtUser(jwtUserKey, user)
                setStoredUser(user)
            }
            clearStoredAccessToken(accessTokenKey)
        } else {
            // Store as access token and clear any old JWT token
            storeAccessToken(accessTokenKey, token)
            clearStoredJwtToken(jwtTokenKey)
            clearStoredJwtUser(jwtUserKey)
            setStoredUser(null)
        }

        setAuthSource({ type: 'accessToken', token })
    }, [accessTokenKey, jwtTokenKey, jwtUserKey])

    const setPasswordAuth = useCallback((username: string, password: string) => {
        // Store username for potential reuse, password is never stored
        setAuthSource({ type: 'password', username, password })
    }, [])

    const clearAuth = useCallback(() => {
        clearStoredAccessToken(accessTokenKey)
        clearStoredJwtToken(jwtTokenKey)
        clearStoredJwtUser(jwtUserKey)
        setAuthSource(null)
    }, [accessTokenKey, jwtTokenKey, jwtUserKey])

    return {
        authSource,
        storedUser,
        isLoading,
        isTelegram,
        setAccessToken,
        setPasswordAuth,
        clearAuth
    }
}
