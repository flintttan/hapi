import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ToolCallBlock } from '@/chat/types'
import type { ToolGroupBlock } from '@/chat/toolGroups'
import { TraceSection, getTraceSummaryText } from '@/components/ToolCard/trace'
import { ToolGroupCard } from '@/components/ToolCard/ToolGroupCard'
import { HappyChatProvider } from '@/components/AssistantChat/context'

vi.mock('@/components/CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>
}))

vi.mock('@/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>
}))

vi.mock('@/lib/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'tool.trace.callsSuffix') return 'calls'
      if (key === 'tool.trace') return 'Trace'
      if (key === 'toolGroup.toolCount') return `${params?.n ?? 0} tools`
      if (key === 'toolGroup.badge.running') return `${params?.n ?? 0} running`
      if (key === 'toolGroup.badge.pending') return `${params?.n ?? 0} pending`
      if (key === 'toolGroup.badge.error') return `${params?.n ?? 0} error`
      if (key === 'toolGroup.badge.files') return `${params?.n ?? 0} files`
      if (key === 'toolGroup.history.partial') return 'Some earlier grouped tool history is not loaded yet.'
      if (key === 'toolGroup.rowStatus.error') return 'Error'
      if (key === 'toolGroup.rowStatus.running') return 'Running'
      if (key === 'toolGroup.rowStatus.pending') return 'Pending'
      if (key === 'toolGroup.summary.mutation') return `${params?.n ?? 0} edits`
      if (key === 'toolGroup.summary.read') return `${params?.n ?? 0} reads`
      if (key === 'toolGroup.summary.command') return `${params?.n ?? 0} commands`
      if (key === 'toolGroup.summary.search') return `${params?.n ?? 0} searches`
      if (key === 'toolGroup.summary.web') return `${params?.n ?? 0} web`
      if (key === 'toolGroup.summary.other') return `${params?.n ?? 0} other`
      if (key === 'toolGroup.title') return 'Tool activity'
      return key
    }
  })
}))

function makeTool(id: string, name: string, state: ToolCallBlock['tool']['state'], input: unknown, result?: unknown): ToolCallBlock {
  return {
    kind: 'tool-call',
    id,
    localId: null,
    createdAt: 1,
    tool: {
      id,
      name,
      state,
      input,
      result,
      createdAt: 1,
      startedAt: state === 'pending' ? null : 2,
      completedAt: state === 'completed' || state === 'error' ? 3 : null,
      description: null,
    },
    children: [],
  }
}

function renderWithChatContext(node: ReactNode, overrides?: Partial<React.ComponentProps<typeof HappyChatProvider>['value']>) {
  const loadOlderMessagesPreservingScroll = overrides?.loadOlderMessagesPreservingScroll ?? vi.fn().mockResolvedValue(true)
  return {
    loadOlderMessagesPreservingScroll,
    ...render(
      <HappyChatProvider
        value={{
          api: { } as any,
          sessionId: 'session-1',
          metadata: null,
          disabled: false,
          onRefresh: vi.fn(),
          hasMoreMessages: false,
          isLoadingMoreMessages: false,
          loadOlderMessagesPreservingScroll,
          ...overrides,
        }}
      >
        {node}
      </HappyChatProvider>
    )
  }
}

describe('TraceSection', () => {
  it('renders codex agent session trace summary and expands child details', async () => {
    const childTool = makeTool('child-tool', 'Read', 'completed', { file_path: 'README.md' }, { text: 'done' })
    const block: ToolCallBlock = {
      ...makeTool('agent-1', 'CodexAgent', 'completed', { prompt: 'delegate' }, {
        totalTokens: 2400,
        totalDurationMs: 4500,
        totalToolUseCount: 3,
      }),
      children: [
        { kind: 'agent-text', id: 'agent-text-1', localId: null, createdAt: 1, text: 'child answer', meta: undefined },
        childTool,
      ],
    }

    render(<TraceSection block={block} metadata={null} />)

    expect(screen.getByText(/Trace/)).toBeInTheDocument()
    expect(screen.getByText(/3 calls/)).toBeInTheDocument()
    expect(screen.getByText(/2.4k tok/)).toBeInTheDocument()
    expect(screen.getByText(/4.5s/)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/README\.md/))

    await waitFor(() => {
      expect(screen.getByText(/"file_path": "README\.md"/)).toBeInTheDocument()
    })
  })

  it('formats trace summary with graceful fallbacks', () => {
    expect(getTraceSummaryText(2, null, null, 'calls')).toBe('2 calls')
    expect(getTraceSummaryText(2, 1550, 2400, 'calls')).toBe('2 calls · 1.6k tok · 2.4s')
  })
})

describe('ToolGroupCard', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('hydrates older history when opened and lists grouped tools', async () => {
    const readTool = makeTool('tool-read', 'Read', 'completed', { file_path: 'src/a.ts' }, { ok: true })
    const editTool = makeTool('tool-edit', 'Edit', 'running', { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' })
    const block: ToolGroupBlock = {
      kind: 'tool-group',
      id: 'group-1',
      createdAt: 1,
      firstToolId: readTool.id,
      lastToolId: editTool.id,
      tools: [readTool, editTool],
      defaultOpen: true,
      historyState: 'needs-older-history',
      needsOlderHistory: true,
      summary: {
        totalTools: 2,
        countsByKind: { read: 1, search: 0, command: 0, mutation: 1, web: 0, other: 0 },
        fileTargets: ['src/a.ts'],
        commandTargets: [],
        searchTargets: [],
        urlTargets: [],
        otherTargets: [],
        errorCount: 0,
        runningCount: 1,
        pendingCount: 0,
      },
    }

    const { loadOlderMessagesPreservingScroll } = renderWithChatContext(
      <ToolGroupCard block={block} metadata={null} />,
      {
        hasMoreMessages: true,
        isLoadingMoreMessages: false,
      }
    )

    await waitFor(() => {
      expect(loadOlderMessagesPreservingScroll).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText(/2 tools/)).toBeInTheDocument()
    expect(screen.getByText(/1 running/)).toBeInTheDocument()
    expect(screen.getAllByText(/src\/a\.ts/)).toHaveLength(2)
    expect(screen.getByText(/Running/)).toBeInTheDocument()
  })
})
