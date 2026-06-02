import { useEffect, useState } from 'react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { ChatBlock, CodexReviewBlock, GeneratedImageBlock } from '@/chat/types'
import type { ToolCallBlock } from '@/chat/types'
import { isToolGroupBlock, type ToolGroupBlock } from '@/chat/toolGroups'
import { isObject, safeStringify } from '@hapi/protocol'
import { getEventPresentation } from '@/chat/presentation'
import { CodeBlock } from '@/components/CodeBlock'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { LazyRainbowText } from '@/components/LazyRainbowText'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { ToolGroupCard } from '@/components/ToolCard/ToolGroupCard'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { ImagePreview } from '@/components/ImagePreview'
import { CodexReviewCard } from '@/components/AssistantChat/messages/CodexReviewCard'
import { useMessageSearchContext } from '@/components/AssistantChat/messageSearchContext'

function isGeneratedImageBlock(value: unknown): value is GeneratedImageBlock {
    if (!isObject(value)) return false
    if (value.kind != 'generated-image') return false
    if (typeof value.id != 'string') return false
    if (typeof value.imageId != 'string') return false
    if (typeof value.fileName != 'string') return false
    return true
}

function isCodexReviewBlock(value: unknown): value is CodexReviewBlock {
    if (!isObject(value)) return false
    if (value.kind != 'codex-review') return false
    if (typeof value.id != 'string') return false
    return true
}

function isToolCallBlock(value: unknown): value is ToolCallBlock {
    if (!isObject(value)) return false
    if (value.kind !== 'tool-call') return false
    if (typeof value.id !== 'string') return false
    if (value.localId !== null && typeof value.localId !== 'string') return false
    if (typeof value.createdAt !== 'number') return false
    if (!Array.isArray(value.children)) return false
    if (!isObject(value.tool)) return false
    if (typeof value.tool.name !== 'string') return false
    if (!('input' in value.tool)) return false
    if (value.tool.description !== null && typeof value.tool.description !== 'string') return false
    if (value.tool.state !== 'pending' && value.tool.state !== 'running' && value.tool.state !== 'completed' && value.tool.state !== 'error') return false
    return true
}

function isToolGroupArtifact(value: unknown): value is ToolGroupBlock {
    return isObject(value) && isToolGroupBlock(value as never) && Array.isArray((value as { tools?: unknown }).tools)
}

function GeneratedImageCard(props: { block: GeneratedImageBlock }) {
    const ctx = useHappyChatContext()
    const [objectUrl, setObjectUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let disposed = false
        let nextObjectUrl: string | null = null

        setObjectUrl(null)
        setError(null)
        void ctx.api.getGeneratedImageBlob(ctx.sessionId, props.block.imageId)
            .then((blob) => {
                if (disposed) return
                nextObjectUrl = URL.createObjectURL(blob)
                setObjectUrl(nextObjectUrl)
            })
            .catch((err: unknown) => {
                if (disposed) return
                setError(err instanceof Error ? err.message : 'Failed to load generated image')
            })

        return () => {
            disposed = true
            if (nextObjectUrl) {
                URL.revokeObjectURL(nextObjectUrl)
            }
        }
    }, [ctx.api, ctx.sessionId, props.block.imageId])

    return (
        <div className="max-w-[92%] rounded-2xl border border-[var(--app-border)] bg-[var(--app-tool-card-bg)] p-3">
            <div className="mb-2 min-w-0 truncate text-xs font-medium text-[var(--app-hint)]">
                Generated image · {props.block.fileName}
            </div>
            {objectUrl ? (
                <ImagePreview
                    src={objectUrl}
                    fileName={props.block.fileName}
                    label={props.block.fileName}
                    buttonClassName="block max-w-full cursor-zoom-in rounded-xl text-left"
                    imageClassName="max-h-[min(28rem,60vh)] max-w-full rounded-xl object-contain"
                />
            ) : error ? (
                <div className="text-sm text-[var(--app-hint)]">
                    Generated image is unavailable. {error}
                </div>
            ) : (
                <div className="h-48 w-72 max-w-full animate-pulse rounded-xl bg-[var(--app-subtle-bg)]" />
            )}
        </div>
    )
}

function isPendingPermissionBlock(block: ChatBlock): boolean {
    return block.kind === 'tool-call' && block.tool.permission?.status === 'pending'
}

function splitTaskChildren(block: ToolCallBlock): { pending: ChatBlock[]; rest: ChatBlock[] } {
    const pending: ChatBlock[] = []
    const rest: ChatBlock[] = []

    for (const child of block.children) {
        if (isPendingPermissionBlock(child)) {
            pending.push(child)
        } else {
            rest.push(child)
        }
    }

    return { pending, rest }
}

function HappyNestedBlockList(props: {
    blocks: ChatBlock[]
}) {
    const ctx = useHappyChatContext()

    return (
        <div className="flex flex-col gap-3">
            {props.blocks.map((block) => {
                if (block.kind === 'user-text') {
                    const userBubbleClass = 'w-fit max-w-[92%] ml-auto rounded-xl bg-[var(--app-secondary-bg)] px-3 py-2 text-[var(--app-fg)] shadow-sm'
                    const status = block.status
                    const canRetry = status === 'failed' && typeof block.localId === 'string' && Boolean(ctx.onRetryMessage)
                    const onRetry = canRetry ? () => ctx.onRetryMessage!(block.localId!) : undefined

                    return (
                        <div key={`user:${block.id}`} className={userBubbleClass}>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <LazyRainbowText text={block.text} />
                                </div>
                                {status ? (
                                    <div className="shrink-0 self-end pb-0.5">
                                        <MessageStatusIndicator status={status} onRetry={onRetry} />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )
                }

                if (block.kind === 'agent-text') {
                    return (
                        <div key={`agent:${block.id}`} className="px-1">
                            <MarkdownRenderer content={block.text} />
                        </div>
                    )
                }

                if (block.kind === 'cli-output') {
                    const alignClass = block.source === 'user' ? 'ml-auto w-full max-w-[92%]' : ''
                    return (
                        <div key={`cli:${block.id}`} className="px-1 min-w-0 max-w-full overflow-x-hidden">
                            <div className={alignClass}>
                                <CliOutputBlock text={block.text} />
                            </div>
                        </div>
                    )
                }

                if (block.kind === 'generated-image') {
                    return (
                        <div key={`generated-image:${block.id}`} className="px-1">
                            <GeneratedImageCard block={block} />
                        </div>
                    )
                }

                if (block.kind === 'codex-review') {
                    return (
                        <div key={`codex-review:${block.id}`} className="px-1">
                            <CodexReviewCard review={block.review} />
                        </div>
                    )
                }

                if (block.kind === 'agent-event') {
                    const presentation = getEventPresentation(block.event)
                    return (
                        <div key={`event:${block.id}`} className="py-1">
                            <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                                <span className="inline-flex items-center gap-1">
                                    {presentation.icon ? <span aria-hidden="true">{presentation.icon}</span> : null}
                                    <span>{presentation.text}</span>
                                </span>
                            </div>
                        </div>
                    )
                }

                if (block.kind === 'tool-call') {
                    const isTask = block.tool.name === 'Task'
                    const taskChildren = isTask ? splitTaskChildren(block) : null

                    return (
                        <div key={`tool:${block.id}`} className="py-1">
                            <ToolCard
                                api={ctx.api}
                                sessionId={ctx.sessionId}
                                metadata={ctx.metadata}
                                disabled={ctx.disabled}
                                onDone={ctx.onRefresh}
                                block={block}
                            />
                            {block.children.length > 0 ? (
                                isTask ? (
                                    <>
                                        {taskChildren && taskChildren.pending.length > 0 ? (
                                            <div className="mt-2 pl-3">
                                                <HappyNestedBlockList blocks={taskChildren.pending} />
                                            </div>
                                        ) : null}
                                        {taskChildren && taskChildren.rest.length > 0 ? (
                                            <details className="mt-2">
                                                <summary className="cursor-pointer text-xs text-[var(--app-hint)]">
                                                    Task details ({taskChildren.rest.length})
                                                </summary>
                                                <div className="mt-2 pl-3">
                                                    <HappyNestedBlockList blocks={taskChildren.rest} />
                                                </div>
                                            </details>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className="mt-2 pl-3">
                                        <HappyNestedBlockList blocks={block.children} />
                                    </div>
                                )
                            ) : null}
                        </div>
                    )
                }

                return null
            })}
        </div>
    )
}

export function HappyToolMessage(props: ToolCallMessagePartProps) {
    const ctx = useHappyChatContext()
    const search = useMessageSearchContext()
    const artifact = props.artifact

    if (isGeneratedImageBlock(artifact)) {
        return (
            <div className="py-1 min-w-0 max-w-full overflow-x-hidden">
                <GeneratedImageCard block={artifact} />
            </div>
        )
    }

    if (isCodexReviewBlock(artifact)) {
        return (
            <div className="py-1 min-w-0 max-w-full overflow-x-hidden">
                <CodexReviewCard review={artifact.review} />
            </div>
        )
    }

    if (isToolGroupArtifact(artifact)) {
        const searchId = `tool-call:${artifact.firstToolId}`
        const isSearchMatch = search.resultIds.has(searchId)
        const isActiveSearchMatch = search.activeId === searchId
        const searchClass = isSearchMatch
            ? (isActiveSearchMatch ? 'rounded-lg ring-2 ring-amber-400 bg-amber-400/15' : 'rounded-lg ring-1 ring-amber-300/70 bg-amber-300/10')
            : ''

        return (
            <div className={`py-1 min-w-0 max-w-full overflow-x-hidden ${searchClass}`} data-message-search-id={searchId}>
                <ToolGroupCard block={artifact} metadata={ctx.metadata} />
            </div>
        )
    }

    if (!isToolCallBlock(artifact)) {
        const argsText = typeof props.argsText === 'string' ? props.argsText.trim() : ''
        const hasArgsText = argsText.length > 0
        const hasResult = props.result !== undefined
        const resultText = hasResult ? safeStringify(props.result) : ''

        const searchId = typeof props.toolCallId === 'string' && props.toolCallId.length > 0
            ? `tool-call:${props.toolCallId}`
            : null
        const isSearchMatch = typeof searchId === 'string' && search.resultIds.has(searchId)
        const isActiveSearchMatch = typeof searchId === 'string' && search.activeId === searchId
        const searchAttrs = searchId ? { 'data-message-search-id': searchId } : {}
        const searchClass = isSearchMatch
            ? (isActiveSearchMatch ? 'rounded-lg ring-2 ring-amber-400 bg-amber-400/15' : 'rounded-lg ring-1 ring-amber-300/70 bg-amber-300/10')
            : ''

        return (
            <div className={`py-1 min-w-0 max-w-full overflow-x-hidden ${searchClass}`} {...searchAttrs}>
                <div className="rounded-xl bg-[var(--app-secondary-bg)] p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs">
                        <div className="font-mono text-[var(--app-hint)]">
                            Tool: {props.toolName}
                        </div>
                        {props.isError ? (
                            <span className="text-red-500">Error</span>
                        ) : null}
                        {props.status.type === 'running' && !hasResult ? (
                            <span className="text-[var(--app-hint)]">Running…</span>
                        ) : null}
                    </div>

                    {hasArgsText ? (
                        <div className="mt-2">
                            <CodeBlock code={argsText} language="json" />
                        </div>
                    ) : null}

                    {hasResult ? (
                        <div className="mt-2">
                            <CodeBlock code={resultText} language={typeof props.result === 'string' ? 'text' : 'json'} />
                        </div>
                    ) : null}
                </div>
            </div>
        )
    }

    const block = artifact
    const isTask = block.tool.name === 'Task'
    const taskChildren = isTask ? splitTaskChildren(block) : null
    const searchId = `tool-call:${block.id}`
    const isSearchMatch = search.resultIds.has(searchId)
    const isActiveSearchMatch = search.activeId === searchId
    const searchClass = isSearchMatch
        ? (isActiveSearchMatch ? 'rounded-lg ring-2 ring-amber-400 bg-amber-400/15' : 'rounded-lg ring-1 ring-amber-300/70 bg-amber-300/10')
        : ''

    return (
        <div className={`py-1 min-w-0 max-w-full overflow-x-hidden ${searchClass}`} data-message-search-id={searchId}>
            <ToolCard
                api={ctx.api}
                sessionId={ctx.sessionId}
                metadata={ctx.metadata}
                disabled={ctx.disabled}
                onDone={ctx.onRefresh}
                block={block}
            />
            {block.children.length > 0 ? (
                isTask ? (
                    <>
                        {taskChildren && taskChildren.pending.length > 0 ? (
                            <div className="mt-2 pl-3">
                                <HappyNestedBlockList blocks={taskChildren.pending} />
                            </div>
                        ) : null}
                        {taskChildren && taskChildren.rest.length > 0 ? (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-[var(--app-hint)]">
                                    Task details ({taskChildren.rest.length})
                                </summary>
                                <div className="mt-2 pl-3">
                                    <HappyNestedBlockList blocks={taskChildren.rest} />
                                </div>
                            </details>
                        ) : null}
                    </>
                ) : (
                    <div className="mt-2 pl-3">
                        <HappyNestedBlockList blocks={block.children} />
                    </div>
                )
            ) : null}
        </div>
    )
}
