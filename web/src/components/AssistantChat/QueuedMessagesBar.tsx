import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useAssistantApi } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import { EMPTY_STATE } from '@/hooks/queries/useMessages'
import { subscribeMessageWindow, getMessageWindowState, removeOptimisticMessage } from '@/lib/message-window-store'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { useCancelQueuedMessage } from '@/hooks/mutations/useCancelQueuedMessage'
import type { DecryptedMessage } from '@/types/api'
import type { PendingSchedule } from '@/components/AssistantChat/ScheduleTimePicker'
import { useTranslation } from '@/lib/use-translation'

function ClockIcon() {
    return (
        <svg className="h-[14px] w-[14px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function isQueuedForInvocation(message: DecryptedMessage): boolean {
    const isUser = normalizeDecryptedMessage(message)?.role === 'user'
    return isUser && message.invokedAt === null && message.status !== 'failed'
}

export function sortQueuedMessages(msgs: DecryptedMessage[]): DecryptedMessage[] {
    return [...msgs].sort((a, b) => {
        const aSched = a.scheduledAt != null
        const bSched = b.scheduledAt != null
        if (aSched !== bSched) return aSched ? 1 : -1
        if (aSched && bSched) return (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)
        return (a.createdAt ?? 0) - (b.createdAt ?? 0)
    })
}

export function computeEditPendingSchedule(scheduledAt: number | null | undefined, now: number): PendingSchedule | null {
    if (scheduledAt == null || scheduledAt <= now) return null
    return { type: 'absolute', ms: scheduledAt }
}

export function computeCanCancel({ id, localId, isPending }: { id: string; localId: string | null | undefined; isPending: boolean }): boolean {
    return Boolean(id) && !isPending
}

function formatScheduledTime(scheduledAt: number): string {
    const date = new Date(scheduledAt)
    const now = new Date()
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    if (date.getFullYear() !== now.getFullYear()) {
        opts.year = 'numeric'
    }
    return date.toLocaleString(undefined, opts)
}

function getTextFromMessage(msg: DecryptedMessage): string {
    const normalized = normalizeDecryptedMessage(msg)
    if (!normalized || normalized.role !== 'user') {
        return ''
    }
    const text = (normalized.content.text ?? '').trim()
    if (text) return text
    const attachments = normalized.content.attachments ?? []
    return attachments.map((a) => a.filename ?? 'attachment').join(', ')
}

function useQueuedMessages(sessionId: string): DecryptedMessage[] {
    const state = useSyncExternalStore(
        useCallback((listener) => subscribeMessageWindow(sessionId, listener), [sessionId]),
        useCallback(() => getMessageWindowState(sessionId), [sessionId]),
        () => EMPTY_STATE
    )
    return useMemo(() => sortQueuedMessages([...state.messages, ...state.pending].filter(isQueuedForInvocation)), [state])
}

export function QueuedMessagesBar(props: {
    sessionId: string
    api: ApiClient | null
    onEdit?: (params: { text: string; pendingSchedule: PendingSchedule | null }) => void
}) {
    const queued = useQueuedMessages(props.sessionId)
    const assistantApi = useAssistantApi()
    const cancelMutation = useCancelQueuedMessage(props.api)
    const { t } = useTranslation()

    const handleLocalEdit = useCallback((msg: DecryptedMessage, text: string) => {
        removeOptimisticMessage(props.sessionId, msg.id)
        if (text) {
            assistantApi.composer().setText(text)
        }
        props.onEdit?.({ text, pendingSchedule: computeEditPendingSchedule(msg.scheduledAt, Date.now()) })
    }, [props.sessionId, assistantApi, props.onEdit])

    const handleLocalCancel = useCallback((msg: DecryptedMessage) => {
        removeOptimisticMessage(props.sessionId, msg.id)
    }, [props.sessionId])

    if (queued.length === 0) return null

    return (
        <div role="status" className="mx-auto mb-1 w-full max-w-content">
            <div className="px-3 py-2 text-sm text-[var(--app-fg-muted)]">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--app-hint)]">
                    <ClockIcon />
                    <span>{t('queuedMessages.title')}</span>
                </div>
                <ul className="flex max-h-32 flex-col gap-1.5 overflow-y-auto sm:max-h-48" aria-label="Queued messages">
                    {queued.map((msg) => {
                        const text = getTextFromMessage(msg)
                        const localId = msg.localId ?? msg.id
                        const isPending = cancelMutation.isPending && cancelMutation.variables?.localId === localId
                        const canCancel = computeCanCancel({ id: msg.id, localId: msg.localId, isPending })
                        const hasServerEcho = msg.localId ? msg.id !== msg.localId : true
                        return (
                            <li key={msg.localId ?? msg.id} className="flex min-w-0 items-start gap-2 rounded-lg bg-[var(--app-secondary-bg)] px-3 py-2 shadow-sm">
                                <div className="min-w-0 flex-1">
                                    <span className="line-clamp-3 whitespace-pre-wrap break-words text-[var(--app-fg)]">{text}</span>
                                    {msg.scheduledAt != null && msg.scheduledAt > Date.now() ? (
                                        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--app-hint)]">
                                            <ClockIcon />
                                            <span>{t('queuedMessages.scheduledFor', { time: formatScheduledTime(msg.scheduledAt) })}</span>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        aria-label={t('queuedMessages.edit')}
                                        disabled={!canCancel}
                                        onClick={() => {
                                            if (!canCancel) return
                                            if (!hasServerEcho) {
                                                handleLocalEdit(msg, text)
                                                return
                                            }
                                            cancelMutation.mutate({ sessionId: props.sessionId, messageId: msg.id, localId, snapshot: msg }, {
                                                onSuccess: (result) => {
                                                    if (result.status === 'invoked') return
                                                    if (text) {
                                                        assistantApi.composer().setText(text)
                                                    }
                                                    props.onEdit?.({ text, pendingSchedule: computeEditPendingSchedule(msg.scheduledAt, Date.now()) })
                                                }
                                            })
                                        }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--app-hint)] transition-colors hover:bg-[var(--app-border)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ✎
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={t('queuedMessages.cancel')}
                                        disabled={!canCancel}
                                        onClick={() => {
                                            if (!canCancel) return
                                            if (!hasServerEcho) {
                                                handleLocalCancel(msg)
                                                return
                                            }
                                            cancelMutation.mutate({ sessionId: props.sessionId, messageId: msg.id, localId, snapshot: msg })
                                        }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--app-hint)] transition-colors hover:bg-[var(--app-border)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}
