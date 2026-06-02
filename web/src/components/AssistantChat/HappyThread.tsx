import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import type { MessageSearchResult } from '@/lib/message-search'
import { getConversationMessageAnchorId, type ConversationOutlineItem } from '@/chat/outline'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { HappyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { HappyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { HappySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'
import { MessageSearchContext } from '@/components/AssistantChat/messageSearchContext'
import { useToast } from '@/lib/toast-context'

function NewMessagesIndicator(props: { count: number; onClick: () => void }) {
    const { t } = useTranslation()
    if (props.count === 0) return null
    return (
        <button onClick={props.onClick} className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] shadow-lg animate-bounce-in">
            {t('misc.newMessage', { n: props.count })} &#8595;
        </button>
    )
}

function MessageSkeleton() {
    const { t } = useTranslation()
    const rows = [
        { align: 'end', width: 'w-2/3', height: 'h-10' },
        { align: 'start', width: 'w-3/4', height: 'h-12' },
        { align: 'end', width: 'w-1/2', height: 'h-9' },
        { align: 'start', width: 'w-5/6', height: 'h-14' }
    ]
    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{t('misc.loadingMessages')}</span>
            <div className="animate-pulse space-y-3">
                {rows.map((row, index) => (
                    <div key={`skeleton-${index}`} className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`${row.height} ${row.width} rounded-xl bg-[var(--app-subtle-bg)]`} />
                    </div>
                ))}
            </div>
        </div>
    )
}


type ScrollAnchor = {
    id: string
    topOffset: number
}

const MESSAGE_ANCHOR_SELECTOR = '.happy-thread-messages > [id]'

function captureScrollAnchor(viewport: HTMLElement): ScrollAnchor | null {
    const viewportRect = viewport.getBoundingClientRect()
    const messages = Array.from(viewport.querySelectorAll<HTMLElement>(MESSAGE_ANCHOR_SELECTOR))
    for (const message of messages) {
        const rect = message.getBoundingClientRect()
        if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
            return {
                id: message.id,
                topOffset: rect.top - viewportRect.top,
            }
        }
    }
    return null
}

function restoreScrollAnchor(viewport: HTMLElement, anchor: ScrollAnchor): boolean {
    const target = document.getElementById(anchor.id)
    if (!target || !viewport.contains(target)) {
        return false
    }
    const viewportRect = viewport.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    viewport.scrollTop += targetRect.top - viewportRect.top - anchor.topOffset
    return true
}

const THREAD_MESSAGE_COMPONENTS = {
    UserMessage: HappyUserMessage,
    AssistantMessage: HappyAssistantMessage,
    SystemMessage: HappySystemMessage,
} as const

function ConversationOutlinePanel(props: {
    title: string
    items: readonly ConversationOutlineItem[]
    onSelect: (item: ConversationOutlineItem) => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    return (
        <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[24rem] flex-col border-l border-[var(--app-border)] bg-[var(--app-bg)] shadow-2xl sm:w-[24rem]">
            <div className="flex items-start gap-3 border-b border-[var(--app-border)] p-3">
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{t('session.outline.title')}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--app-hint)]">{props.title}</div>
                </div>
                <button type="button" onClick={props.onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]" aria-label={t('button.close')} title={t('button.close')}>×</button>
            </div>
            <div className="app-scroll-y min-h-0 flex-1 p-2">
                {props.items.length === 0 ? (
                    <div className="px-2 py-8 text-center text-sm text-[var(--app-hint)]">{t('session.outline.empty')}</div>
                ) : (
                    <div className="space-y-1">
                        {props.items.map((item) => (
                            <button key={item.id} type="button" onClick={() => props.onSelect(item)} className="group flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]">
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--app-button)]" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[11px] font-medium uppercase text-[var(--app-hint)]">{t('session.outline.kind.user')}</span>
                                    <span className="line-clamp-2 text-sm leading-snug text-[var(--app-fg)]">{item.label}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    )
}

export function HappyThread(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    isLoadingMessages: boolean
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => Promise<unknown>
    pendingCount: number
    rawMessagesCount: number
    normalizedMessagesCount: number
    messagesVersion: number
    forceScrollToken: number
    searchResults?: MessageSearchResult[]
    activeSearchResult?: MessageSearchResult | null
    outlineOpen?: boolean
    outlineTitle?: string
    outlineItems?: readonly ConversationOutlineItem[]
    onOutlineOpenChange?: (open: boolean) => void
    onOutlineItemClick?: (item: ConversationOutlineItem) => void
    onLocateMessage?: (messageId: string) => Promise<boolean>
    viewportLayoutKey?: string
}) {
    const { t } = useTranslation()
    const { addToast } = useToast()
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const messagesContainerRef = useRef<HTMLDivElement | null>(null)
    const topSentinelRef = useRef<HTMLDivElement | null>(null)
    const loadLockRef = useRef(false)
    const pendingScrollRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)
    const initialScrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevLoadingMoreRef = useRef(false)
    const loadStartedRef = useRef(false)
    const isLoadingMoreRef = useRef(props.isLoadingMoreMessages)
    const hasMoreMessagesRef = useRef(props.hasMoreMessages)
    const isLoadingMessagesRef = useRef(props.isLoadingMessages)
    const onLoadMoreRef = useRef(props.onLoadMore)
    const handleLoadMoreRef = useRef<() => void>(() => {})
    const atBottomRef = useRef(true)
    const onAtBottomChangeRef = useRef(props.onAtBottomChange)
    const onFlushPendingRef = useRef(props.onFlushPending)
    const forceScrollTokenRef = useRef(props.forceScrollToken)
    const pendingInitialScrollRef = useRef(true)
    const searchResultsById = new Set((props.searchResults ?? []).map((result) => result.id))
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
    const autoScrollEnabledRef = useRef(autoScrollEnabled)
    const outlineNavigationRef = useRef(false)
    const outlineSelectionInFlightRef = useRef(false)

    useEffect(() => {
        autoScrollEnabledRef.current = autoScrollEnabled
    }, [autoScrollEnabled])
    useEffect(() => {
        onAtBottomChangeRef.current = props.onAtBottomChange
    }, [props.onAtBottomChange])
    useEffect(() => {
        onFlushPendingRef.current = props.onFlushPending
    }, [props.onFlushPending])
    useEffect(() => {
        hasMoreMessagesRef.current = props.hasMoreMessages
    }, [props.hasMoreMessages])
    useEffect(() => {
        isLoadingMessagesRef.current = props.isLoadingMessages
    }, [props.isLoadingMessages])
    useEffect(() => {
        onLoadMoreRef.current = props.onLoadMore
    }, [props.onLoadMore])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        const THRESHOLD_PX = 120
        const handleScroll = () => {
            const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
            const isNearBottom = distanceFromBottom < THRESHOLD_PX
            if (isNearBottom) {
                if (!autoScrollEnabledRef.current) {
                    autoScrollEnabledRef.current = true
                    setAutoScrollEnabled(true)
                }
            } else if (autoScrollEnabledRef.current) {
                autoScrollEnabledRef.current = false
                setAutoScrollEnabled(false)
            }
            if (isNearBottom !== atBottomRef.current) {
                atBottomRef.current = isNearBottom
                onAtBottomChangeRef.current(isNearBottom)
                if (isNearBottom) onFlushPendingRef.current()
            }
        }
        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, [])

    const syncViewportToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        const viewport = viewportRef.current
        if (!viewport) return
        if (behavior === 'auto') {
            viewport.scrollTop = viewport.scrollHeight
            return
        }
        viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    }, [])

    const clearInitialScrollSettleTimer = useCallback(() => {
        if (initialScrollSettleTimerRef.current !== null) {
            clearTimeout(initialScrollSettleTimerRef.current)
            initialScrollSettleTimerRef.current = null
        }
    }, [])

    const scheduleInitialScrollSettle = useCallback(() => {
        if (!pendingInitialScrollRef.current || isLoadingMessagesRef.current) {
            return
        }
        clearInitialScrollSettleTimer()
        initialScrollSettleTimerRef.current = setTimeout(() => {
            pendingInitialScrollRef.current = false
            initialScrollSettleTimerRef.current = null
        }, 250)
    }, [clearInitialScrollSettleTimer])

    const scrollToBottom = useCallback(() => {
        syncViewportToBottom('smooth')
        autoScrollEnabledRef.current = true
        setAutoScrollEnabled(true)
        if (!atBottomRef.current) {
            atBottomRef.current = true
            onAtBottomChangeRef.current(true)
        }
        onFlushPendingRef.current()
    }, [syncViewportToBottom])

    useEffect(() => {
        pendingInitialScrollRef.current = true
        clearInitialScrollSettleTimer()
        autoScrollEnabledRef.current = true
        setAutoScrollEnabled(true)
        atBottomRef.current = true
        onAtBottomChangeRef.current(true)
        forceScrollTokenRef.current = props.forceScrollToken
        syncViewportToBottom()
        requestAnimationFrame(() => {
            syncViewportToBottom()
            scheduleInitialScrollSettle()
        })
        onFlushPendingRef.current()
    }, [props.sessionId, clearInitialScrollSettleTimer, scheduleInitialScrollSettle, syncViewportToBottom])

    useEffect(() => {
        if (forceScrollTokenRef.current === props.forceScrollToken) return
        forceScrollTokenRef.current = props.forceScrollToken
        scrollToBottom()
    }, [props.forceScrollToken, scrollToBottom])

    useEffect(() => {
        const activeId = props.activeSearchResult?.id
        if (!activeId) return
        const viewport = viewportRef.current
        const target = viewport?.querySelector<HTMLElement>(`[data-message-search-id="${CSS.escape(activeId)}"]`)
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [props.activeSearchResult?.id])

    const scrollMessageIntoView = useCallback((target: HTMLElement) => {
        outlineNavigationRef.current = true
        autoScrollEnabledRef.current = false
        setAutoScrollEnabled(false)
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => {
            outlineNavigationRef.current = false
        }, 500)
    }, [])

    const handleOutlineItemSelect = useCallback(async (item: ConversationOutlineItem) => {
        if (outlineSelectionInFlightRef.current) {
            return
        }
        outlineSelectionInFlightRef.current = true
        const anchorId = getConversationMessageAnchorId(item.targetMessageId)
        const viewport = viewportRef.current
        const findTarget = () => viewport?.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`) ?? null
        try {
            let target = findTarget()
            if (!target && props.onLocateMessage) {
                const currentViewport = viewportRef.current
                const anchor = currentViewport ? captureScrollAnchor(currentViewport) : null
                const located = await props.onLocateMessage(item.targetMessageId)
                if (located && currentViewport && anchor) {
                    restoreScrollAnchor(currentViewport, anchor)
                }
                target = findTarget()
            }

            if (target) {
                scrollMessageIntoView(target)
                props.onOutlineItemClick?.(item)
                props.onOutlineOpenChange?.(false)
                return
            }

            addToast({
                title: t('session.outline.title'),
                body: t('session.outline.empty'),
                sessionId: props.sessionId,
                url: `/sessions/${props.sessionId}`,
            })
        } finally {
            outlineSelectionInFlightRef.current = false
        }
    }, [addToast, props.onLocateMessage, props.onOutlineItemClick, props.onOutlineOpenChange, props.sessionId, scrollMessageIntoView, t])

    const handleLoadMore = useCallback(() => {
        if (pendingInitialScrollRef.current) return
        if (isLoadingMessagesRef.current || !hasMoreMessagesRef.current || isLoadingMoreRef.current || loadLockRef.current) return
        const viewport = viewportRef.current
        if (!viewport) return
        pendingScrollRef.current = { scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight }
        loadLockRef.current = true
        loadStartedRef.current = false
        let loadPromise: Promise<unknown>
        try {
            loadPromise = onLoadMoreRef.current()
        } catch (error) {
            pendingScrollRef.current = null
            loadLockRef.current = false
            throw error
        }
        void loadPromise.catch((error) => {
            pendingScrollRef.current = null
            loadLockRef.current = false
            console.error('Failed to load older messages:', error)
        }).finally(() => {
            if (!loadStartedRef.current && !isLoadingMoreRef.current && pendingScrollRef.current) {
                pendingScrollRef.current = null
                loadLockRef.current = false
            }
        })
    }, [])

    useEffect(() => {
        handleLoadMoreRef.current = handleLoadMore
    }, [handleLoadMore])

    useEffect(() => {
        const sentinel = topSentinelRef.current
        const viewport = viewportRef.current
        if (!sentinel || !viewport || !props.hasMoreMessages || props.isLoadingMessages) return
        if (typeof IntersectionObserver === 'undefined') return
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) handleLoadMoreRef.current()
            }
        }, { root: viewport, rootMargin: '200px 0px 0px 0px' })
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [props.hasMoreMessages, props.isLoadingMessages])

    useLayoutEffect(() => {
        isLoadingMoreRef.current = props.isLoadingMoreMessages
        if (!prevLoadingMoreRef.current && props.isLoadingMoreMessages) loadStartedRef.current = true
        if (prevLoadingMoreRef.current && !props.isLoadingMoreMessages) {
            const viewport = viewportRef.current
            const pending = pendingScrollRef.current
            if (viewport && pending) {
                const delta = viewport.scrollHeight - pending.scrollHeight
                viewport.scrollTop = pending.scrollTop + delta
            }
            pendingScrollRef.current = null
            loadLockRef.current = false
        }
        prevLoadingMoreRef.current = props.isLoadingMoreMessages
    }, [props.isLoadingMoreMessages, props.messagesVersion])

    useLayoutEffect(() => {
        if (!autoScrollEnabledRef.current) return
        syncViewportToBottom()
    }, [props.messagesVersion, autoScrollEnabled, syncViewportToBottom])

    useLayoutEffect(() => {
        if (!atBottomRef.current) return
        syncViewportToBottom()
        requestAnimationFrame(() => {
            if (atBottomRef.current) {
                syncViewportToBottom()
            }
        })
    }, [props.viewportLayoutKey, syncViewportToBottom])

    useLayoutEffect(() => {
        if (!pendingInitialScrollRef.current || !autoScrollEnabledRef.current) return
        syncViewportToBottom()
        if (props.isLoadingMessages) {
            return
        }
        requestAnimationFrame(() => {
            syncViewportToBottom()
            scheduleInitialScrollSettle()
        })
    }, [
        props.sessionId,
        props.isLoadingMessages,
        props.rawMessagesCount,
        props.normalizedMessagesCount,
        props.messagesVersion,
        scheduleInitialScrollSettle,
        syncViewportToBottom,
    ])

    useEffect(() => {
        const viewport = viewportRef.current
        const messagesContainer = messagesContainerRef.current
        if (!viewport || !messagesContainer) {
            return
        }

        let frameId: number | null = null
        const keepPinnedToBottom = () => {
            if (!pendingInitialScrollRef.current && !atBottomRef.current) {
                return
            }
            if (frameId !== null) {
                cancelAnimationFrame(frameId)
            }
            frameId = requestAnimationFrame(() => {
                frameId = null
                if (pendingInitialScrollRef.current || atBottomRef.current) {
                    syncViewportToBottom()
                    scheduleInitialScrollSettle()
                }
            })
        }

        let resizeObserver: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                keepPinnedToBottom()
            })
            resizeObserver.observe(messagesContainer)
            resizeObserver.observe(viewport)
        }

        let mutationObserver: MutationObserver | null = null
        if (typeof MutationObserver !== 'undefined') {
            mutationObserver = new MutationObserver(() => {
                keepPinnedToBottom()
            })
            mutationObserver.observe(messagesContainer, {
                childList: true,
                subtree: true,
                characterData: true,
            })
        }

        return () => {
            resizeObserver?.disconnect()
            mutationObserver?.disconnect()
            if (frameId !== null) {
                cancelAnimationFrame(frameId)
            }
            clearInitialScrollSettleTimer()
        }
    }, [clearInitialScrollSettleTimer, props.sessionId, scheduleInitialScrollSettle, syncViewportToBottom])

    return (
        <div className="relative min-h-0 flex-1">
            <HappyChatProvider value={{ api: props.api, sessionId: props.sessionId, metadata: props.metadata, disabled: props.disabled, onRefresh: props.onRefresh, onRetryMessage: props.onRetryMessage, hasMoreMessages: props.hasMoreMessages, isLoadingMoreMessages: props.isLoadingMoreMessages, loadOlderMessagesPreservingScroll: async () => {
                if (pendingInitialScrollRef.current) {
                    return false
                }
                if (isLoadingMessagesRef.current || !hasMoreMessagesRef.current || isLoadingMoreRef.current || loadLockRef.current) {
                    return false
                }
                const viewport = viewportRef.current
                if (!viewport) {
                    return false
                }
                const anchor = captureScrollAnchor(viewport)
                pendingScrollRef.current = { scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight }
                loadLockRef.current = true
                loadStartedRef.current = false
                try {
                    await onLoadMoreRef.current()
                } catch (error) {
                    pendingScrollRef.current = null
                    loadLockRef.current = false
                    throw error
                }
                requestAnimationFrame(() => {
                    const nextViewport = viewportRef.current
                    if (!nextViewport) return
                    if (anchor && restoreScrollAnchor(nextViewport, anchor)) return
                    const pending = pendingScrollRef.current
                    if (!pending) return
                    const delta = nextViewport.scrollHeight - pending.scrollHeight
                    nextViewport.scrollTop = pending.scrollTop + delta
                })
                return true
            } }}>
                <MessageSearchContext.Provider value={{ resultIds: searchResultsById, activeId: props.activeSearchResult?.id ?? null }}>
                    <ThreadPrimitive.Root className="relative flex h-full min-h-0 flex-col">
                        <div ref={viewportRef} className="app-scroll-y flex-1 px-3 py-3">
                            <div ref={messagesContainerRef} className="mx-auto flex w-full max-w-content flex-col gap-3 happy-thread-messages">
                                <div ref={topSentinelRef} className="h-px w-full" />
                                {props.hasMoreMessages ? (
                                    <div className="flex justify-center pt-1">
                                        <Button variant="outline" size="sm" onClick={() => void props.onLoadMore()} disabled={props.isLoadingMoreMessages} className="gap-2 text-xs">
                                            {props.isLoadingMoreMessages ? <Spinner size="sm" label={null} className="text-current" /> : null}
                                            {props.isLoadingMoreMessages ? t('misc.loading') : t('misc.loadOlderMessages')}
                                        </Button>
                                    </div>
                                ) : null}
                                {props.isLoadingMessages && props.rawMessagesCount === 0 ? <MessageSkeleton /> : null}
                                <ThreadPrimitive.Messages components={THREAD_MESSAGE_COMPONENTS} />
                                {props.messagesWarning ? <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{props.messagesWarning}</div> : null}
                            </div>
                        </div>
                        <NewMessagesIndicator count={props.pendingCount} onClick={scrollToBottom} />
                    </ThreadPrimitive.Root>
                </MessageSearchContext.Provider>
            </HappyChatProvider>
            {props.outlineOpen ? (
                <ConversationOutlinePanel
                    title={props.outlineTitle ?? ''}
                    items={props.outlineItems ?? []}
                    onSelect={(item) => {
                        void handleOutlineItemSelect(item)
                    }}
                    onClose={() => props.onOutlineOpenChange?.(false)}
                />
            ) : null}
        </div>
    )
}
