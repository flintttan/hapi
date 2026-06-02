import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { ToolGroupBlock } from '@/chat/toolGroups'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { MessageSearchContext } from '@/components/AssistantChat/messageSearchContext'

vi.mock('@/components/ToolCard/ToolGroupCard', () => ({
  ToolGroupCard: ({ block }: { block: ToolGroupBlock }) => <button>Grouped tools: {block.tools.length}</button>,
}))

vi.mock('@/components/ToolCard/ToolCard', () => ({
  ToolCard: () => <div>ToolCard</div>,
}))

vi.mock('@/components/CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}))

vi.mock('@/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <HappyChatProvider
      value={{
        api: {} as any,
        sessionId: 'session-1',
        metadata: null,
        disabled: false,
        onRefresh: vi.fn(),
        hasMoreMessages: false,
        isLoadingMoreMessages: false,
        loadOlderMessagesPreservingScroll: vi.fn().mockResolvedValue(false),
      }}
    >
      <MessageSearchContext.Provider value={{ resultIds: new Set(), activeId: null }}>
        {ui}
      </MessageSearchContext.Provider>
    </HappyChatProvider>
  )
}

describe('HappyToolMessage', () => {
  it('renders tool-group artifacts with ToolGroupCard instead of generic fallback', () => {
    const tool = {
      kind: 'tool-call' as const,
      id: 'tool-1',
      localId: null,
      createdAt: 1,
      tool: {
        id: 'tool-1',
        name: 'Read',
        state: 'completed' as const,
        input: { file_path: 'README.md' },
        result: 'ok',
        createdAt: 1,
        startedAt: 1,
        completedAt: 2,
        description: null,
      },
      children: [],
    }
    const group: ToolGroupBlock = {
      kind: 'tool-group',
      id: 'group-1',
      createdAt: 1,
      firstToolId: 'tool-1',
      lastToolId: 'tool-1',
      tools: [tool],
      defaultOpen: true,
      historyState: 'complete',
      needsOlderHistory: false,
      summary: {
        totalTools: 1,
        countsByKind: { read: 1, search: 0, command: 0, mutation: 0, web: 0, other: 0 },
        fileTargets: ['README.md'],
        commandTargets: [],
        searchTargets: [],
        urlTargets: [],
        otherTargets: [],
        errorCount: 0,
        runningCount: 0,
        pendingCount: 0,
      },
    }

    renderWithProviders(
      <HappyToolMessage
        type="tool-call"
        artifact={group}
        toolName="ToolGroup"
        toolCallId="group-1"
        args={{}}
        argsText=""
        result={undefined}
        isError={false}
        addResult={vi.fn()}
        resume={vi.fn()}
        status={{ type: 'complete' } as ToolCallMessagePartProps['status']}
      />
    )

    expect(screen.getByText('Grouped tools: 1')).toBeInTheDocument()
    expect(screen.queryByText('Tool: ToolGroup')).not.toBeInTheDocument()
  })
})
