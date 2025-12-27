import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import type { AuthResponse } from '@/types/api'
import { Spinner } from '@/components/Spinner'

type UserMenuProps = {
    user: AuthResponse['user']
    onLogout?: () => void
}

type CliToken = {
    id: string
    name: string | null
    created_at: number
    last_used_at: number | null
}

export function UserMenu({ user, onLogout }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false)
    const [newTokenName, setNewTokenName] = useState('')
    const [generatedToken, setGeneratedToken] = useState<{ token: string; name: string | null } | null>(null)
    const { api } = useAppContext()
    const queryClient = useQueryClient()

    // Fetch user's CLI tokens
    const { data: tokensData, isLoading: isLoadingTokens } = useQuery({
        queryKey: ['cli-tokens'],
        queryFn: async () => {
            if (!api) throw new Error('No API client')
            const response = await fetch(`${api.baseUrl}/api/cli-tokens`, {
                headers: {
                    'Authorization': `Bearer ${api.token}`
                }
            })
            if (!response.ok) throw new Error('Failed to fetch tokens')
            return response.json() as Promise<{ tokens: CliToken[] }>
        },
        enabled: isTokenDialogOpen && Boolean(api)
    })

    // Generate new CLI token
    const generateTokenMutation = useMutation({
        mutationFn: async (name: string) => {
            if (!api) throw new Error('No API client')
            const response = await fetch(`${api.baseUrl}/api/cli-tokens`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${api.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: name || undefined })
            })
            if (!response.ok) throw new Error('Failed to generate token')
            return response.json() as Promise<{ id: string; token: string; name: string | null; created_at: number }>
        },
        onSuccess: (data) => {
            setGeneratedToken({ token: data.token, name: data.name })
            setNewTokenName('')
            queryClient.invalidateQueries({ queryKey: ['cli-tokens'] })
        }
    })

    // Revoke CLI token
    const revokeTokenMutation = useMutation({
        mutationFn: async (tokenId: string) => {
            if (!api) throw new Error('No API client')
            const response = await fetch(`${api.baseUrl}/api/cli-tokens/${tokenId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${api.token}`
                }
            })
            if (!response.ok) throw new Error('Failed to revoke token')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cli-tokens'] })
        }
    })

    const handleGenerateToken = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        generateTokenMutation.mutate(newTokenName.trim())
    }, [newTokenName, generateTokenMutation])

    const handleCopyToken = useCallback(async (token: string) => {
        try {
            await navigator.clipboard.writeText(token)
            // Could add a toast notification here
        } catch (err) {
            console.error('Failed to copy token:', err)
        }
    }, [])

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString()
    }

    return (
        <>
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--app-hover)] transition-colors"
                >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--app-button)] text-[var(--app-button-text)] text-sm font-medium">
                        {user.username?.[0]?.toUpperCase() ?? user.firstName?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div className="text-left hidden sm:block">
                        <div className="text-sm font-medium">{user.username || user.firstName || 'User'}</div>
                        <div className="text-xs text-[var(--app-hint)]">{user.id}</div>
                    </div>
                </button>

                {isOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />
                        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-64 bg-[var(--app-bg)] border border-[var(--app-border)] rounded-lg shadow-lg z-50 overflow-hidden">
                            <div className="p-4 border-b border-[var(--app-border)]">
                                <div className="font-medium">{user.username || user.firstName || 'User'}</div>
                                <div className="text-xs text-[var(--app-hint)] mt-1">ID: {user.id}</div>
                            </div>

                            <div className="p-2">
                                <button
                                    onClick={() => {
                                        setIsTokenDialogOpen(true)
                                        setIsOpen(false)
                                    }}
                                    className="w-full text-left px-3 py-2 rounded hover:bg-[var(--app-hover)] transition-colors text-sm"
                                >
                                    Manage CLI Tokens
                                </button>
                                {onLogout && (
                                    <button
                                        onClick={() => {
                                            onLogout()
                                            setIsOpen(false)
                                        }}
                                        className="w-full text-left px-3 py-2 rounded hover:bg-[var(--app-hover)] transition-colors text-sm text-red-600"
                                    >
                                        Logout
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* CLI Tokens Management Dialog */}
            <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>CLI API Tokens</DialogTitle>
                        <DialogDescription>
                            Generate personal tokens for CLI access. Each token provides isolated authentication.
                        </DialogDescription>
                    </DialogHeader>

                    {generatedToken && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg space-y-3">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-medium text-sm">New Token Generated</div>
                                    {generatedToken.name && (
                                        <div className="text-xs text-[var(--app-hint)] mt-1">Name: {generatedToken.name}</div>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setGeneratedToken(null)}
                                >
                                    Dismiss
                                </Button>
                            </div>
                            <div className="font-mono text-xs bg-white dark:bg-gray-900 p-3 rounded border break-all">
                                {generatedToken.token}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => handleCopyToken(generatedToken.token)}
                                >
                                    Copy Token
                                </Button>
                                <div className="text-xs text-red-600">
                                    ⚠️ Save this token now - it won't be shown again!
                                </div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleGenerateToken} className="space-y-3">
                        <div>
                            <label className="text-sm font-medium block mb-2">Generate New Token</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newTokenName}
                                    onChange={(e) => setNewTokenName(e.target.value)}
                                    placeholder="Token name (e.g., my-laptop)"
                                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)]"
                                />
                                <Button
                                    type="submit"
                                    disabled={generateTokenMutation.isPending}
                                >
                                    {generateTokenMutation.isPending ? (
                                        <Spinner size="sm" label={null} />
                                    ) : (
                                        'Generate'
                                    )}
                                </Button>
                            </div>
                            <div className="text-xs text-[var(--app-hint)] mt-1">
                                Name is optional but helps identify the token
                            </div>
                        </div>
                    </form>

                    <div className="space-y-3">
                        <div className="text-sm font-medium">Your Tokens</div>
                        {isLoadingTokens ? (
                            <div className="text-center py-8">
                                <Spinner size="sm" label="Loading tokens..." />
                            </div>
                        ) : tokensData?.tokens.length === 0 ? (
                            <div className="text-center py-8 text-sm text-[var(--app-hint)]">
                                No tokens yet. Generate one above to get started.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {tokensData?.tokens.map((token) => (
                                    <div
                                        key={token.id}
                                        className="flex items-center justify-between p-3 border border-[var(--app-border)] rounded-lg"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">
                                                {token.name || 'Unnamed Token'}
                                            </div>
                                            <div className="text-xs text-[var(--app-hint)] mt-1">
                                                Created: {formatDate(token.created_at)}
                                            </div>
                                            {token.last_used_at && (
                                                <div className="text-xs text-[var(--app-hint)]">
                                                    Last used: {formatDate(token.last_used_at)}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => revokeTokenMutation.mutate(token.id)}
                                            disabled={revokeTokenMutation.isPending}
                                            className="ml-3"
                                        >
                                            Revoke
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="text-xs text-[var(--app-hint)] border-t border-[var(--app-border)] pt-3">
                        <div className="font-medium mb-2">Using Tokens:</div>
                        <div className="space-y-1">
                            <div>• Set the token in your CLI configuration</div>
                            <div>• Each token provides independent authentication</div>
                            <div>• Revoke tokens that are no longer needed</div>
                            <div>• Tokens are hashed and stored securely</div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
