import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { getAssistantCopyText } from '@/components/AssistantChat/messages/assistantCopyText'
import { useMessageSearchContext } from '@/components/AssistantChat/messageSearchContext'

const TOOL_COMPONENTS = {
    Fallback: HappyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

export function HappyAssistantMessage() {
    const { copied, copy } = useCopyToClipboard()
    const search = useMessageSearchContext()
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const toolOnly = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        const parts = message.content
        return parts.length > 0 && parts.every((part) => part.type === 'tool-call')
    })
    const copyText = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return ''
        return getAssistantCopyText(message.content)
    })
    const searchId = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.searchId ?? null
    })
    const isSearchMatch = typeof searchId === 'string' && search.resultIds.has(searchId)
    const isActiveSearchMatch = typeof searchId === 'string' && search.activeId === searchId
    const searchAttrs = searchId ? { 'data-message-search-id': searchId } : {}
    const searchClass = isSearchMatch
        ? (isActiveSearchMatch ? 'rounded-lg ring-2 ring-amber-400 bg-amber-400/15' : 'rounded-lg ring-1 ring-amber-300/70 bg-amber-300/10')
        : ''
    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className={`px-1 min-w-0 max-w-full overflow-x-hidden ${searchClass}`} {...searchAttrs}>
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root className={`${rootClass} ${copyText ? 'group/msg' : ''} ${searchClass}`} {...searchAttrs}>
            <div className="min-w-0">
                <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
            </div>
            {copyText && (
                <div className="hidden sm:flex justify-end mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                    <button
                        type="button"
                        title="Copy"
                        className="p-0.5 rounded hover:bg-[var(--app-subtle-bg)] transition-colors"
                        onClick={() => copy(copyText)}
                    >
                        {copied
                            ? <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                            : <CopyIcon className="h-3.5 w-3.5 text-[var(--app-hint)]" />}
                    </button>
                </div>
            )}
        </MessagePrimitive.Root>
    )
}
