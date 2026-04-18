import { useAssistantState } from '@assistant-ui/react'
import { getEventPresentation } from '@/chat/presentation'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { useMessageSearchContext } from '@/components/AssistantChat/messageSearchContext'

export function HappySystemMessage() {
    const search = useMessageSearchContext()
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'system') return ''
        return message.content[0]?.type === 'text' ? message.content[0].text : ''
    })
    const icon = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event ? getEventPresentation(event).icon : null
    })
    const searchId = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.searchId ?? null
    })

    if (role !== 'system') return null
    const isSearchMatch = typeof searchId === 'string' && search.resultIds.has(searchId)
    const isActiveSearchMatch = typeof searchId === 'string' && search.activeId === searchId
    const searchAttrs = searchId ? { 'data-message-search-id': searchId } : {}

    return (
        <div
            className={`py-1 rounded-lg ${isSearchMatch ? (isActiveSearchMatch ? 'ring-2 ring-amber-400 bg-amber-400/15' : 'ring-1 ring-amber-300/70 bg-amber-300/10') : ''}`}
            {...searchAttrs}
        >
            <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                <span className="inline-flex items-center gap-1">
                    {icon ? <span aria-hidden="true">{icon}</span> : null}
                    <span>{text}</span>
                </span>
            </div>
        </div>
    )
}
