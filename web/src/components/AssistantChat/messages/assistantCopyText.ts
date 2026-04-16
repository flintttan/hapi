import type { ThreadAssistantMessagePart } from '@assistant-ui/react'

export function getAssistantCopyText(parts: readonly ThreadAssistantMessagePart[]): string {
    return parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text.trim())
        .filter((text) => text.length > 0)
        .join('\n\n')
}
