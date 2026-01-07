import { useCallback, useEffect, useState } from 'react'
import { ApiClient } from '@/api/client'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
    error?: string | null
}

export function LoginPrompt(props: LoginPromptProps) {
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

    // Form validation functions
    const validateUsername = (username: string): string | null => {
        if (username.length < 3) return 'Username must be at least 3 characters'
        if (username.length > 50) return 'Username must be at most 50 characters'
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return 'Username can only contain letters, numbers, underscores, and hyphens'
        }
        return null
    }

    const validatePassword = (password: string): string | null => {
        if (password.length < 6) return 'Password must be at least 6 characters'
        return null
    }

    const validateEmail = (email: string): string | null => {
        if (!email) return null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return 'Invalid email format'
        }
        return null
    }

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            if (isBindMode) {
                const trimmedToken = accessToken.trim()
                if (!trimmedToken) {
                    setError('Please enter an access token')
                    return
                }
                if (!props.onBind) {
                    setError('Binding is unavailable.')
                    return
                }
                await props.onBind(trimmedToken)
            } else if (viewMode === 'register') {
                // Registration flow
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
                    setError('Login is unavailable.')
                    return
                }
                props.onLogin(response.token, response.user, response.refreshToken)
            } else {
                // Login flow
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
                            setError('Please enter an access token')
                            return
                        }
                        authResponse = await client.authenticate({ accessToken: trimmedToken })
                        break
                    }
                }

                if (!props.onLogin) {
                    setError('Login is unavailable.')
                    return
                }
                // Pass JWT token and user info from authentication response
                props.onLogin(authResponse.token, authResponse.user, authResponse.refreshToken)
            }
        } catch (e) {
            let fallbackMessage = 'Authentication failed'
            if (isBindMode) fallbackMessage = 'Binding failed'
            else if (viewMode === 'register') fallbackMessage = 'Registration failed'
            setError(e instanceof Error ? e.message : fallbackMessage)
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, username, password, email, confirmPassword, viewMode, authMethod, isBindMode, props, validateUsername, validatePassword, validateEmail])

    useEffect(() => {
        if (!isServerDialogOpen) {
            return
        }
        setServerInput(props.serverUrl ?? '')
        setServerError(null)
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

    const displayError = error || props.error
    const serverSummary = props.serverUrl ?? `${props.baseUrl} (same origin)`
    const title = isBindMode ? 'Bind Telegram' : 'HAPI'
    const subtitle = isBindMode
        ? 'Enter your access token to bind this Telegram account'
        : viewMode === 'register'
        ? 'Create your account'
        : 'Sign in to your account'
    const submitLabel = isBindMode ? 'Bind' : viewMode === 'register' ? 'Sign Up' : 'Sign In'
    const telegramAvailable = typeof window !== 'undefined' && !!window.Telegram?.WebApp

    return (
        <div className="relative h-full flex items-center justify-center p-4">
            {!isBindMode && (
                <div className="absolute right-4 top-4 z-10">
                    <Dialog open={isServerDialogOpen} onOpenChange={setIsServerDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                Server
                                <span className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                    {props.serverUrl ? 'Custom' : 'Default'}
                                </span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Server URL</DialogTitle>
                                <DialogDescription>
                                    Set the hapi server origin for API and live updates.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSaveServer} className="space-y-4">
                                <div className="text-xs text-[var(--app-hint)]">
                                    Current: {serverSummary}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium">Server origin</label>
                                    <input
                                        type="url"
                                        value={serverInput}
                                        onChange={(e) => {
                                            setServerInput(e.target.value)
                                            setServerError(null)
                                        }}
                                        placeholder="https://hapi.example.com"
                                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent"
                                    />
                                    <div className="text-[11px] text-[var(--app-hint)]">
                                        Use http(s) only. Any path is ignored.
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
                                            Use same origin
                                        </Button>
                                    )}
                                    <Button type="submit">
                                        Save server
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            )}
            <div className="w-full max-w-sm space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="text-2xl font-semibold">{title}</div>
                    <div className="text-sm text-[var(--app-hint)]">
                        {subtitle}
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Form Fields */}
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
                                {isBindMode ? 'Binding...' : viewMode === 'register' ? 'Signing up...' : 'Signing in...'}
                            </>
                        ) : (
                            submitLabel
                        )}
                    </button>
                </form>

                {/* View Toggle and Help Text */}
                <div className="text-xs text-[var(--app-hint)] text-center space-y-2">
                    {!isBindMode && (
                        <>
                            {viewMode === 'login' && authMethod === 'password' && (
                                <div>
                                    Don't have an account?{' '}
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
                            {viewMode === 'login' && authMethod === 'password' && (
                                <div>
                                    Or use{' '}
                                    <button
                                        type="button"
                                        onClick={() => setAuthMethod('token')}
                                        className="text-[var(--app-button)] hover:underline"
                                    >
                                        CLI_API_TOKEN
                                    </button>
                                    {' '}to sign in
                                </div>
                            )}
                            {viewMode === 'login' && authMethod === 'token' && (
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setAuthMethod('password')}
                                        className="text-[var(--app-button)] hover:underline"
                                    >
                                        ← Back to password login
                                    </button>
                                    <div className="mt-2">
                                        Use CLI_API_TOKEN[:namespace] from your server configuration
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
