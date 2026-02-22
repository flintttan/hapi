import { useCallback, useEffect, useState } from 'react'
import { ApiClient } from '@/api/client'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'
import type { ServerUrlResult } from '@/hooks/useServerUrl'

type ViewMode = 'login' | 'register'
type AuthMethod = 'password' | 'telegram' | 'token'

type LoginPromptProps = {
    mode?: 'login' | 'bind'
    onLogin?: (token: string, user?: { id: number | string; username?: string; firstName?: string; lastName?: string }, refreshToken?: string) => void
    onBind?: (token: string) => Promise<void>
    baseUrl: string
    serverUrl: string | null
    setServerUrl: (input: string) => ServerUrlResult
    clearServerUrl: () => void
    requireServerUrl?: boolean
    error?: string | null
}

export function LoginPrompt(props: LoginPromptProps) {
    const { t } = useTranslation()
    const isBindMode = props.mode === 'bind'
    const [viewMode, setViewMode] = useState<ViewMode>('login')
    const [authMethod, setAuthMethod] = useState<AuthMethod>('password')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [email, setEmail] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [accessToken, setAccessToken] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(props.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)
    const telegramAvailable = typeof window !== 'undefined' && !!window.Telegram?.WebApp

    useEffect(() => {
        if (viewMode === 'register' && authMethod !== 'password') {
            setAuthMethod('password')
        }
        if (!telegramAvailable && authMethod === 'telegram') {
            setAuthMethod('password')
        }
    }, [authMethod, telegramAvailable, viewMode])

    const validateUsername = (input: string): string | null => {
        if (input.length < 3) return 'Username must be at least 3 characters'
        if (input.length > 50) return 'Username must be at most 50 characters'
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
            return 'Username can only contain letters, numbers, underscores, and hyphens'
        }
        return null
    }

    const validatePassword = (input: string): string | null => {
        if (input.length < 6) return 'Password must be at least 6 characters'
        return null
    }

    const validateEmail = (input: string): string | null => {
        if (!input) return null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
            return 'Invalid email format'
        }
        return null
    }

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isBindMode && props.requireServerUrl && !props.serverUrl) {
            setServerError(t('login.server.required'))
            setIsServerDialogOpen(true)
            return
        }
        setIsLoading(true)
        setError(null)

        try {
            if (isBindMode) {
                const trimmedToken = accessToken.trim()
                if (!trimmedToken) {
                    setError(t('login.error.enterToken'))
                    return
                }
                if (!props.onBind) {
                    setError(t('login.error.bindingUnavailable'))
                    return
                }
                await props.onBind(trimmedToken)
            } else if (viewMode === 'register') {
                if (password !== confirmPassword) {
                    setError('Passwords do not match')
                    return
                }

                const usernameError = validateUsername(username)
                const passwordError = validatePassword(password)
                const emailError = validateEmail(email)

                if (usernameError || passwordError || emailError) {
                    setError(usernameError || passwordError || emailError)
                    return
                }

                const client = new ApiClient('', { baseUrl: props.baseUrl })
                const response = await client.register({
                    username,
                    email: email || undefined,
                    password
                })
                if (!props.onLogin) {
                    setError(t('login.error.loginUnavailable'))
                    return
                }
                props.onLogin(response.token, response.user, response.refreshToken)
            } else {
                const client = new ApiClient('', { baseUrl: props.baseUrl })
                let authResponse: { token: string; refreshToken?: string; user: { id: number | string; username?: string; firstName?: string; lastName?: string } }

                switch (authMethod) {
                    case 'password': {
                        const usernameError = validateUsername(username)
                        const passwordError = validatePassword(password)
                        if (usernameError || passwordError) {
                            setError(usernameError || passwordError)
                            return
                        }
                        authResponse = await client.authenticate({ username, password })
                        break
                    }
                    case 'telegram': {
                        if (!window.Telegram?.WebApp?.initData) {
                            setError('Telegram WebApp not available')
                            return
                        }
                        authResponse = await client.authenticate({ initData: window.Telegram.WebApp.initData })
                        break
                    }
                    case 'token': {
                        const trimmedToken = accessToken.trim()
                        if (!trimmedToken) {
                            setError(t('login.error.enterToken'))
                            return
                        }
                        authResponse = await client.authenticate({ accessToken: trimmedToken })
                        break
                    }
                }

                if (!props.onLogin) {
                    setError(t('login.error.loginUnavailable'))
                    return
                }
                props.onLogin(authResponse.token, authResponse.user, authResponse.refreshToken)
            }
        } catch (e) {
            let fallbackMessage = t('login.error.authFailed')
            if (isBindMode) fallbackMessage = t('login.error.bindFailed')
            else if (viewMode === 'register') fallbackMessage = 'Registration failed'
            setError(e instanceof Error ? e.message : fallbackMessage)
        } finally {
            setIsLoading(false)
        }
    }, [
        accessToken,
        username,
        password,
        email,
        confirmPassword,
        viewMode,
        authMethod,
        isBindMode,
        props,
        t
    ])

    useEffect(() => {
        if (!isServerDialogOpen) {
            return
        }
        setServerInput(props.serverUrl ?? '')
    }, [isServerDialogOpen, props.serverUrl])

    const handleSaveServer = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        const result = props.setServerUrl(serverInput)
        if (!result.ok) {
            setServerError(result.error)
            return
        }
        setServerError(null)
        setServerInput(result.value)
        setIsServerDialogOpen(false)
    }, [props, serverInput])

    const handleClearServer = useCallback(() => {
        props.clearServerUrl()
        setServerInput('')
        setServerError(null)
        setIsServerDialogOpen(false)
    }, [props])

    const handleServerDialogOpenChange = useCallback((open: boolean) => {
        setIsServerDialogOpen(open)
        if (!open) {
            setServerError(null)
        }
    }, [])

    const displayError = error || props.error
    const serverSummary = props.serverUrl ?? `${props.baseUrl} ${t('login.server.default')}`
    const title = isBindMode ? t('login.bind.title') : t('login.title')
    const subtitle = isBindMode
        ? 'Enter your access token to bind this Telegram account'
        : viewMode === 'register'
        ? 'Create your account'
        : t('login.subtitle')
    const submitLabel = isBindMode ? t('login.bind.submit') : viewMode === 'register' ? 'Sign Up' : t('login.submit')

    return (
        <div className="relative h-full flex items-center justify-center p-4">
            <div className="absolute top-4 right-4">
                <LanguageSwitcher />
            </div>

            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-2">
                    <div className="text-2xl font-semibold">{title}</div>
                    <div className="text-sm text-[var(--app-hint)]">
                        {subtitle}
                    </div>
                </div>

                {!isBindMode && viewMode === 'login' && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setAuthMethod('password')}
                            className={`px-2 py-2 rounded border ${authMethod === 'password' ? 'border-[var(--app-button)] text-[var(--app-button)]' : 'border-[var(--app-border)] text-[var(--app-hint)]'}`}
                        >
                            Password
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuthMethod('telegram')}
                            disabled={!telegramAvailable}
                            className={`px-2 py-2 rounded border ${authMethod === 'telegram' ? 'border-[var(--app-button)] text-[var(--app-button)]' : 'border-[var(--app-border)] text-[var(--app-hint)]'} ${!telegramAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Telegram
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuthMethod('token')}
                            className={`px-2 py-2 rounded border ${authMethod === 'token' ? 'border-[var(--app-button)] text-[var(--app-button)]' : 'border-[var(--app-border)] text-[var(--app-hint)]'}`}
                        >
                            Token
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {isBindMode ? (
                        <div>
                            <input
                                type="password"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                                placeholder="CLI_API_TOKEN:<namespace>"
                                autoComplete="current-password"
                                disabled={isLoading}
                                className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                            />
                        </div>
                    ) : viewMode === 'register' ? (
                        <>
                            <div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    autoComplete="username"
                                    disabled={isLoading}
                                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email (optional)"
                                    autoComplete="email"
                                    disabled={isLoading}
                                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    autoComplete="new-password"
                                    disabled={isLoading}
                                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm Password"
                                    autoComplete="new-password"
                                    disabled={isLoading}
                                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                        </>
                    ) : authMethod === 'password' ? (
                        <>
                            <div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    autoComplete="username"
                                    disabled={isLoading}
                                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    autoComplete="current-password"
                                    disabled={isLoading}
                                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                        </>
                    ) : authMethod === 'telegram' ? (
                        <div className="text-sm text-[var(--app-hint)] text-center py-4">
                            Telegram authentication will be performed automatically
                        </div>
                    ) : (
                        <div>
                            <input
                                type="password"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                                placeholder="CLI_API_TOKEN[:namespace]"
                                autoComplete="current-password"
                                disabled={isLoading}
                                className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent disabled:opacity-50"
                            />
                        </div>
                    )}

                    {displayError && (
                        <div className="text-sm text-red-500 text-center">
                            {displayError}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        aria-busy={isLoading}
                        className="w-full py-2.5 rounded-lg bg-[var(--app-button)] text-[var(--app-button-text)] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />
                                {isBindMode ? t('login.bind.submitting') : viewMode === 'register' ? 'Signing up...' : t('login.submitting')}
                            </>
                        ) : (
                            submitLabel
                        )}
                    </button>
                </form>

                <div className="text-xs text-[var(--app-hint)] text-center space-y-2">
                    {!isBindMode && (
                        <>
                            {viewMode === 'login' && authMethod === 'password' && (
                                <div>
                                    Don&apos;t have an account?{' '}
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('register')}
                                        className="text-[var(--app-button)] hover:underline"
                                    >
                                        Sign up
                                    </button>
                                </div>
                            )}
                            {viewMode === 'register' && (
                                <div>
                                    Already have an account?{' '}
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('login')}
                                        className="text-[var(--app-button)] hover:underline"
                                    >
                                        Sign in
                                    </button>
                                </div>
                            )}
                            {authMethod === 'token' && (
                                <div>
                                    Use CLI_API_TOKEN[:namespace] from your server configuration.
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!isBindMode && (
                    <div className="flex items-center justify-between text-xs text-[var(--app-hint)]">
                        <a href="https://hapi.run/docs" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--app-fg)]">
                            {t('login.help')}
                        </a>
                        <Dialog open={isServerDialogOpen} onOpenChange={handleServerDialogOpenChange}>
                            <DialogTrigger asChild>
                                <button type="button" className="underline hover:text-[var(--app-fg)]">
                                    Hub {props.serverUrl ? `${t('login.server.custom')}` : `${t('login.server.default')}`}
                                </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>{t('login.server.title')}</DialogTitle>
                                    <DialogDescription>
                                        {t('login.server.description')}
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleSaveServer} className="space-y-4">
                                    <div className="text-xs text-[var(--app-hint)]">
                                        {t('login.server.current')} {serverSummary}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium">{t('login.server.origin')}</label>
                                        <input
                                            type="url"
                                            value={serverInput}
                                            onChange={(e) => {
                                                setServerInput(e.target.value)
                                                setServerError(null)
                                            }}
                                            placeholder={t('login.server.placeholder')}
                                            className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent"
                                        />
                                        <div className="text-[11px] text-[var(--app-hint)]">
                                            {t('login.server.hint')}
                                        </div>
                                    </div>

                                    {serverError && (
                                        <div className="text-sm text-red-500">
                                            {serverError}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-end gap-2">
                                        {props.serverUrl && (
                                            <Button type="button" variant="outline" onClick={handleClearServer}>
                                                {t('login.server.useSameOrigin')}
                                            </Button>
                                        )}
                                        <Button type="submit">
                                            {t('login.server.save')}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}
            </div>
        </div>
    )
}
