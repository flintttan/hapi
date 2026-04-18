import type { ChatBlock } from '@/chat/types'

export type MessageSearchResult = {
    id: string
    text: string
    index: number
}

function normalizeQuery(query: string): string {
    return query.trim().toLocaleLowerCase()
}

function getBlockSearchText(block: ChatBlock): string {
    switch (block.kind) {
        case 'user-text':
        case 'agent-text':
        case 'agent-reasoning':
        case 'cli-output':
            return block.text
        case 'agent-event':
            return `${block.event.type} ${'message' in block.event ? block.event.message : ''} ${'title' in block.event ? block.event.title : ''}`
        case 'tool-call':
            return [
                block.tool.name,
                block.tool.description ?? '',
                JSON.stringify(block.tool.input ?? ''),
                block.children.map(getBlockSearchText).join('\n')
            ].join('\n')
    }
}

export function getSearchableBlockId(block: ChatBlock): string {
    return `${block.kind}:${block.id}`
}

export function searchChatBlocks(blocks: readonly ChatBlock[], query: string): MessageSearchResult[] {
    const normalizedQuery = normalizeQuery(query)
    if (!normalizedQuery) {
        return []
    }

    const results: MessageSearchResult[] = []
    blocks.forEach((block) => {
        const text = getBlockSearchText(block)
        if (!text.toLocaleLowerCase().includes(normalizedQuery)) {
            return
        }
        results.push({
            id: getSearchableBlockId(block),
            text,
            index: results.length
        })
    })
    return results
}
