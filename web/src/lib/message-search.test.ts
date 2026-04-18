import { describe, expect, it } from 'vitest'
import { getSearchableBlockId, searchChatBlocks } from './message-search'
import type { ChatBlock } from '@/chat/types'

function userBlock(id: string, text: string): ChatBlock {
    return {
        kind: 'user-text',
        id,
        localId: null,
        createdAt: 1,
        text,
    }
}

function agentBlock(id: string, text: string): ChatBlock {
    return {
        kind: 'agent-text',
        id,
        localId: null,
        createdAt: 2,
        text,
    }
}

describe('message search', () => {
    it('finds matching chat blocks case-insensitively', () => {
        const results = searchChatBlocks([
            userBlock('u1', 'Hello World'),
            agentBlock('a1', 'another response'),
        ], 'world')

        expect(results).toEqual([{ id: 'user-text:u1', text: 'Hello World', index: 0 }])
    })

    it('returns empty results for blank query', () => {
        expect(searchChatBlocks([userBlock('u1', 'Hello')], '  ')).toEqual([])
    })

    it('uses stable searchable IDs', () => {
        expect(getSearchableBlockId(agentBlock('a1', 'text'))).toBe('agent-text:a1')
    })
})
