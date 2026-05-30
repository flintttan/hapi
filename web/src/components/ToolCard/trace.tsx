/**
 * TraceSection — shows child tool calls inside a Task/Agent tool dialog.
 * Placed between Input and Result sections.
 */
import { useState } from 'react'
import { isObject } from '@hapi/protocol'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import type { SessionMetadataSummary } from '@/types/api'
import { getToolFullViewComponent } from '@/components/ToolCard/views/_all'
import { getToolResultViewComponent } from '@/components/ToolCard/views/_results'
import { CodeBlock } from '@/components/CodeBlock'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { getEventPresentation } from '@/chat/presentation'
import { useTranslation } from '@/lib/use-translation'
import { getToolPresentation } from '@/components/ToolCard/knownTools'

function isSubagentLikeToolName(name: string): boolean {
    return name === 'Task' || name === 'Agent' || name === 'CodexAgent'
}

type TaskToolResultSummary = {
    totalTokens?: number
    totalDurationMs?: number
    totalToolUseCount?: number
}

function readSummaryFields(result: unknown): {
    totalTokens: number | null
    totalDurationMs: number | null
    totalToolUseCount: number | null
} {
    if (!isObject(result)) {
        return { totalTokens: null, totalDurationMs: null, totalToolUseCount: null }
    }
    const r = result as Record<string, unknown>
    return {
        totalTokens: typeof r.totalTokens === 'number' ? r.totalTokens : null,
        totalDurationMs: typeof r.totalDurationMs === 'number' ? r.totalDurationMs : null,
        totalToolUseCount: typeof r.totalToolUseCount === 'number' ? r.totalToolUseCount : null,
    }
}

type _TaskToolResultSummary = TaskToolResultSummary

function formatTaskChildLabel(child: ToolCallBlock, metadata: SessionMetadataSummary | null): string {
    const presentation = getToolPresentation({
        toolName: child.tool.name,
        input: child.tool.input,
        result: child.tool.result,
        childrenCount: child.children.length,
        description: child.tool.description,
        metadata,
    })
    return presentation.subtitle ? `${presentation.title}: ${presentation.subtitle}` : presentation.title
}

function TaskStateIcon(props: { state: ToolCallBlock['tool']['state'] }) {
    if (props.state === 'completed') return <span className="text-emerald-600">✓</span>
    if (props.state === 'error') return <span className="text-red-600">✕</span>
    if (props.state === 'pending') return <span className="text-amber-600">🔐</span>
    return <span className="animate-pulse text-amber-600">●</span>
}

export function getTaskTraceChildren(block: ToolCallBlock): ToolCallBlock[] | null {
    if (!isSubagentLikeToolName(block.tool.name)) return null
    const children = block.children.filter((c): c is ToolCallBlock => c.kind === 'tool-call')
    return children.length === 0 ? null : children
}

function getTraceChildren(block: ToolCallBlock): ChatBlock[] | null {
    if (block.tool.name === 'CodexAgent') {
        return block.children.length === 0 ? null : block.children
    }
    return getTaskTraceChildren(block)
}

export function getTraceSummaryText(
    calls: number,
    totalTokens: number | null,
    totalDurationMs: number | null,
    callsSuffix: string,
): string {
    const parts: string[] = [`${calls} ${callsSuffix}`]

    if (totalTokens !== null) {
        const k = totalTokens / 1000
        parts.push(`${k.toFixed(1)}k tok`)
    }

    if (totalDurationMs !== null) {
        const s = totalDurationMs / 1000
        parts.push(`${s.toFixed(1)}s`)
    }

    return parts.join(' · ')
}

export function TraceSection(props: { block: ToolCallBlock; metadata: SessionMetadataSummary | null }) {
    const { t } = useTranslation()
    const children = getTraceChildren(props.block)
    if (!children) return null

    const state = props.block.tool.state
    const isCodexAgentTrace = props.block.tool.name === 'CodexAgent'
    const defaultOpen = isCodexAgentTrace || state === 'running' || state === 'error' || state === 'pending'
    const fixedHeight = isCodexAgentTrace
    const mode = isCodexAgentTrace ? 'session' : 'trace'

    const { totalTokens, totalDurationMs, totalToolUseCount } = readSummaryFields(props.block.tool.result)
    const callCount = totalToolUseCount !== null ? totalToolUseCount : children.length
    const summaryText = getTraceSummaryText(callCount, totalTokens, totalDurationMs, t('tool.trace.callsSuffix'))

    return (
        <TraceSectionInner
            items={children}
            metadata={props.metadata}
            defaultOpen={defaultOpen}
            summaryText={summaryText}
            fixedHeight={fixedHeight}
            mode={mode}
        />
    )
}

function TraceSectionInner(props: { items: ChatBlock[]; metadata: SessionMetadataSummary | null; defaultOpen: boolean; summaryText: string; fixedHeight: boolean; mode: 'trace' | 'session' }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(props.defaultOpen)

    return (
        <div className="flex flex-col gap-1">
            <button
                type="button"
                className="flex items-center gap-1 text-left text-xs font-medium text-[var(--app-hint)] transition-colors hover:text-[var(--app-fg)]"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                <span className="w-3 text-center select-none">{open ? '▾' : '▸'}</span>
                <span>{t('tool.trace')}</span>
                <span className="font-mono font-normal opacity-70">({props.summaryText})</span>
            </button>

            {open ? (
                <div className={props.fixedHeight ? 'min-h-[260px] max-h-[45vh] overflow-y-auto pr-1' : undefined}>
                    <TraceChildList items={props.items} metadata={props.metadata} mode={props.mode} />
                </div>
            ) : null}
        </div>
    )
}

function TraceChildList(props: { items: ChatBlock[]; metadata: SessionMetadataSummary | null; mode: 'trace' | 'session' }) {
    const [expandedId, setExpandedId] = useState<string | null>(null)

    return (
        <div className={props.mode === 'session' ? 'flex flex-col gap-3' : 'flex flex-col gap-1 border-l border-[var(--app-border)] pl-4'}>
            {props.items.map((child) => (
                <TraceChildRow
                    key={child.id}
                    child={child}
                    metadata={props.metadata}
                    expanded={expandedId === child.id}
                    onToggle={() => setExpandedId((prev) => (prev === child.id ? null : child.id))}
                    mode={props.mode}
                />
            ))}
        </div>
    )
}

function TraceChildRow(props: { child: ChatBlock; metadata: SessionMetadataSummary | null; expanded: boolean; onToggle?: () => void; mode: 'trace' | 'session' }) {
    const isSessionMode = props.mode === 'session'
    const rowClassName = isSessionMode
        ? 'flex flex-col gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-2'
        : 'flex flex-col gap-1'
    const detailClassName = isSessionMode
        ? 'rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm'
        : 'ml-8 rounded border border-[var(--app-border)] p-2 text-sm'
    const detailPlainClassName = isSessionMode ? '' : 'ml-8'
    const chevron = props.onToggle
        ? <span className="w-3 text-center select-none">{props.expanded ? '▾' : '▸'}</span>
        : <span className="w-3 text-center select-none text-[var(--app-hint)]">•</span>

    if (props.child.kind === 'agent-text' || props.child.kind === 'agent-reasoning') {
        const label = props.child.kind === 'agent-reasoning' ? 'Reasoning' : 'Message'
        const preview = props.child.text.trim().split('\n')[0] ?? ''
        return (
            <div className={rowClassName}>
                <button type="button" className="flex items-center gap-2 text-left text-xs text-[var(--app-hint)] transition-colors hover:text-[var(--app-fg)] disabled:pointer-events-none" onClick={props.onToggle} disabled={!props.onToggle}>
                    {chevron}
                    <span className="font-medium">{label}</span>
                    <span className="min-w-0 truncate">{preview}</span>
                </button>
                {props.expanded ? <div className={detailClassName}><MarkdownRenderer content={props.child.text} /></div> : null}
            </div>
        )
    }

    if (props.child.kind === 'cli-output') {
        return (
            <div className={rowClassName}>
                <button type="button" className="flex items-center gap-2 text-left text-xs text-[var(--app-hint)] transition-colors hover:text-[var(--app-fg)] disabled:pointer-events-none" onClick={props.onToggle} disabled={!props.onToggle}>
                    {chevron}
                    <span className="font-medium">Output</span>
                    <span className="min-w-0 truncate">{props.child.text.trim().split('\n')[0]}</span>
                </button>
                {props.expanded ? <div className={detailPlainClassName}><CodeBlock code={props.child.text} language="text" /></div> : null}
            </div>
        )
    }

    if (props.child.kind === 'agent-event') {
        const presentation = getEventPresentation(props.child.event)
        return (
            <div className={isSessionMode ? 'flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-2 text-xs text-[var(--app-hint)]' : 'flex items-center gap-2 text-xs text-[var(--app-hint)]'}>
                <span className="w-3 text-center select-none">•</span>
                {presentation.icon ? <span aria-hidden="true">{presentation.icon}</span> : null}
                <span>{presentation.text}</span>
            </div>
        )
    }

    if (props.child.kind !== 'tool-call') {
        return null
    }

    const label = formatTaskChildLabel(props.child, props.metadata)
    const FullInputView = getToolFullViewComponent(props.child.tool.name)
    const ResultView = getToolResultViewComponent(props.child.tool.name)

    return (
        <div className={rowClassName}>
            <button type="button" className="flex items-center gap-2 text-left text-xs text-[var(--app-hint)] transition-colors hover:text-[var(--app-fg)] disabled:pointer-events-none" onClick={props.onToggle} disabled={!props.onToggle}>
                {chevron}
                <span className="w-4 shrink-0 text-center"><TaskStateIcon state={props.child.tool.state} /></span>
                <span className={isSessionMode ? 'min-w-0 truncate font-mono' : 'break-all font-mono'}>{label}</span>
            </button>
            {props.expanded ? (
                <div className={detailClassName}>
                    <div className="flex flex-col gap-2">
                        {FullInputView ? <FullInputView block={props.child} metadata={props.metadata} /> : isObject(props.child.tool.input) ? <CodeBlock code={JSON.stringify(props.child.tool.input, null, 2)} language="json" /> : null}
                        {ResultView && props.child.tool.result !== undefined ? <ResultView block={props.child} metadata={props.metadata} /> : null}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
