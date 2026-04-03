import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import type { GitCommandResponse } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { queryKeys } from '@/lib/query-keys'
import { langAlias, useShikiHighlighter } from '@/lib/shiki'
import {
    getTabularFileDelimiter,
    parseTabularDiffPreview,
    parseTabularPreview,
    TABULAR_PREVIEW_COLUMN_LIMIT,
    TABULAR_PREVIEW_ROW_LIMIT,
    type TabularDiffPreview,
    type TabularPreview
} from '@/lib/tabularPreview'
import { decodeBase64 } from '@/lib/utils'

const MAX_COPYABLE_FILE_BYTES = 1_000_000

function decodePath(value: string): string {
    if (!value) return ''
    const decoded = decodeBase64(value)
    return decoded.ok ? decoded.text : value
}

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function DiffDisplay(props: { diffContent: string }) {
    const lines = props.diffContent.split('\n')

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {lines.map((line, index) => {
                const isAdd = line.startsWith('+') && !line.startsWith('+++ ')
                const isRemove = line.startsWith('-') && !line.startsWith('--- ')
                const isHunk = line.startsWith('@@')
                const isHeader = line.startsWith('+++ ') || line.startsWith('--- ')

                const className = [
                    'whitespace-pre-wrap px-3 py-0.5 text-xs font-mono',
                    isAdd ? 'bg-[var(--app-diff-added-bg)] text-[var(--app-diff-added-text)]' : '',
                    isRemove ? 'bg-[var(--app-diff-removed-bg)] text-[var(--app-diff-removed-text)]' : '',
                    isHunk ? 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] font-semibold' : '',
                    isHeader ? 'text-[var(--app-hint)] font-semibold' : ''
                ].filter(Boolean).join(' ')

                const style = isAdd
                    ? { borderLeft: '2px solid var(--app-git-staged-color)' }
                    : isRemove
                        ? { borderLeft: '2px solid var(--app-git-deleted-color)' }
                        : undefined

                return (
                    <div key={`${index}-${line}`} className={className} style={style}>
                        {line || ' '}
                    </div>
                )
            })}
        </div>
    )
}

function FileContentSkeleton() {
    const widths = ['w-full', 'w-11/12', 'w-5/6', 'w-3/4', 'w-2/3', 'w-4/5']

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">Loading file…</span>
            <div className="animate-pulse space-y-2 rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3">
                {Array.from({ length: 12 }).map((_, index) => (
                    <div key={`file-skeleton-${index}`} className={`h-3 ${widths[index % widths.length]} rounded bg-[var(--app-subtle-bg)]`} />
                ))}
            </div>
        </div>
    )
}

function resolveLanguage(path: string): string | undefined {
    const parts = path.split('.')
    if (parts.length <= 1) return undefined
    const ext = parts[parts.length - 1]?.toLowerCase()
    if (!ext) return undefined
    return langAlias[ext] ?? ext
}

function getUtf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length
}

function isBinaryContent(content: string): boolean {
    if (!content) return false
    if (content.includes('\0')) return true
    const nonPrintable = content.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return code < 32 && code !== 9 && code !== 10 && code !== 13
    }).length
    return nonPrintable / content.length > 0.1
}

function extractCommandError(result: GitCommandResponse | undefined): string | null {
    if (!result) return null
    if (result.success) return null
    return result.error ?? result.stderr ?? 'Failed to load diff'
}

function TabularPreviewNotice(props: { preview: TabularPreview }) {
    const limitLabel = `Showing up to ${TABULAR_PREVIEW_ROW_LIMIT} rows and ${TABULAR_PREVIEW_COLUMN_LIMIT} columns.`
    const truncatedLabel = props.preview.truncatedRows || props.preview.truncatedColumns
        ? `Only previewing the first ${TABULAR_PREVIEW_ROW_LIMIT} rows and ${TABULAR_PREVIEW_COLUMN_LIMIT} columns.`
        : limitLabel

    return (
        <div className="rounded-md border border-[var(--app-divider)] bg-[var(--app-subtle-bg)] px-3 py-2 text-xs text-[var(--app-hint)]">
            {truncatedLabel}
        </div>
    )
}

function TabularFilePreview(props: { preview: TabularPreview }) {
    if (props.preview.rows.length === 0) {
        return <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
    }

    const [headerRow, ...bodyRows] = props.preview.rows
    const columnCount = Math.max(headerRow.length, props.preview.previewedColumnCount)

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            <div className="overflow-auto">
                <table className="min-w-full w-max border-separate border-spacing-0 text-xs">
                    <thead>
                        <tr>
                            {Array.from({ length: columnCount }).map((_, index) => (
                                <th
                                    key={`header-${index}`}
                                    className="sticky top-0 z-10 border-b border-r border-[var(--app-border)] bg-[var(--app-code-bg)] px-3 py-2 text-left font-semibold text-[var(--app-fg)] last:border-r-0"
                                >
                                    <div className="min-w-24 max-w-96 whitespace-pre-wrap break-words">
                                        {headerRow[index] || '\u00a0'}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {bodyRows.map((row, rowIndex) => (
                            <tr
                                key={`row-${rowIndex}`}
                                className={rowIndex % 2 === 0 ? 'bg-[var(--app-bg)]' : 'bg-[var(--app-subtle-bg)]'}
                            >
                                {Array.from({ length: columnCount }).map((_, columnIndex) => (
                                    <td
                                        key={`row-${rowIndex}-col-${columnIndex}`}
                                        className="border-b border-r border-[var(--app-divider)] px-3 py-2 align-top text-[var(--app-fg)] last:border-r-0"
                                    >
                                        <div className="min-w-24 max-w-96 whitespace-pre-wrap break-words">
                                            {row[columnIndex] || '\u00a0'}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function TabularDiffPreviewNotice(props: { preview: TabularDiffPreview }) {
    const limitLabel = `Showing up to ${TABULAR_PREVIEW_ROW_LIMIT} rows and ${TABULAR_PREVIEW_COLUMN_LIMIT} columns from the diff.`
    const truncatedLabel = props.preview.truncatedRows || props.preview.truncatedColumns
        ? `Only previewing the first ${TABULAR_PREVIEW_ROW_LIMIT} rows and ${TABULAR_PREVIEW_COLUMN_LIMIT} columns from the diff.`
        : limitLabel

    return (
        <div className="rounded-md border border-[var(--app-divider)] bg-[var(--app-subtle-bg)] px-3 py-2 text-xs text-[var(--app-hint)]">
            {truncatedLabel}
        </div>
    )
}

function TabularDiffPreviewTable(props: { preview: TabularDiffPreview }) {
    if (props.preview.rows.length === 0) {
        return <div className="text-sm text-[var(--app-hint)]">No rows to preview.</div>
    }

    const columnCount = Math.max(1, props.preview.previewedColumnCount)

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            <div className="overflow-auto">
                <table className="min-w-full w-max border-separate border-spacing-0 text-xs">
                    <thead>
                        <tr>
                            <th className="sticky top-0 z-10 border-b border-r border-[var(--app-border)] bg-[var(--app-code-bg)] px-2 py-2 text-left font-semibold text-[var(--app-fg)]">
                                Δ
                            </th>
                            {Array.from({ length: columnCount }).map((_, index) => (
                                <th
                                    key={`diff-col-${index}`}
                                    className="sticky top-0 z-10 border-b border-r border-[var(--app-border)] bg-[var(--app-code-bg)] px-3 py-2 text-left font-semibold text-[var(--app-fg)] last:border-r-0"
                                >
                                    <span className="text-[var(--app-hint)]">#{index + 1}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {props.preview.rows.map((row, rowIndex) => {
                            const rowClassName = row.kind === 'add'
                                ? 'bg-[var(--app-diff-added-bg)] text-[var(--app-diff-added-text)]'
                                : row.kind === 'remove'
                                  ? 'bg-[var(--app-diff-removed-bg)] text-[var(--app-diff-removed-text)]'
                                  : rowIndex % 2 === 0
                                    ? 'bg-[var(--app-bg)]'
                                    : 'bg-[var(--app-subtle-bg)]'

                            const indicator = row.kind === 'add'
                                ? { label: '+', color: 'var(--app-git-staged-color)' }
                                : row.kind === 'remove'
                                  ? { label: '-', color: 'var(--app-git-deleted-color)' }
                                  : { label: '·', color: 'var(--app-hint)' }

                            return (
                                <tr key={`diff-row-${rowIndex}`} className={rowClassName}>
                                    <td className="border-b border-r border-[var(--app-divider)] px-2 py-2 align-top font-mono last:border-r-0">
                                        <span className="font-semibold" style={{ color: indicator.color }}>
                                            {indicator.label}
                                        </span>
                                    </td>
                                    {Array.from({ length: columnCount }).map((_, columnIndex) => (
                                        <td
                                            key={`diff-row-${rowIndex}-col-${columnIndex}`}
                                            className="border-b border-r border-[var(--app-divider)] px-3 py-2 align-top last:border-r-0"
                                        >
                                            <div className="min-w-24 max-w-96 whitespace-pre-wrap break-words">
                                                {row.cells[columnIndex] || '\u00a0'}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function RawFilePreview(props: {
    content: string
    highlighted: ReactNode
    canCopyContent: boolean
    copied: boolean
    onCopy: () => void
}) {
    return (
        <div className="relative">
            {props.canCopyContent ? (
                <button
                    type="button"
                    onClick={props.onCopy}
                    className="absolute right-2 top-2 z-10 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                    title="Copy file content"
                >
                    {props.copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                </button>
            ) : null}
            <pre className="shiki overflow-auto rounded-md bg-[var(--app-code-bg)] p-3 pr-8 text-xs font-mono">
                <code>{props.highlighted ?? props.content}</code>
            </pre>
        </div>
    )
}

export default function FilePage() {
    const { api } = useAppContext()
    const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
    const { copied: contentCopied, copy: copyContent } = useCopyToClipboard()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/file' })
    const search = useSearch({ from: '/sessions/$sessionId/file' })
    const encodedPath = typeof search.path === 'string' ? search.path : ''
    const staged = search.staged

    const filePath = useMemo(() => decodePath(encodedPath), [encodedPath])
    const fileName = filePath.split('/').pop() || filePath || 'File'

    const diffQuery = useQuery({
        queryKey: queryKeys.gitFileDiff(sessionId, filePath, staged),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.getGitDiffFile(sessionId, filePath, staged)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const fileQuery = useQuery({
        queryKey: queryKeys.sessionFile(sessionId, filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.readSessionFile(sessionId, filePath)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const diffContent = diffQuery.data?.success ? (diffQuery.data.stdout ?? '') : ''
    const diffError = extractCommandError(diffQuery.data)
    const diffSuccess = diffQuery.data?.success === true
    const diffFailed = diffQuery.data?.success === false

    const fileContentResult = fileQuery.data
    const decodedContentResult = fileContentResult?.success && fileContentResult.content
        ? decodeBase64(fileContentResult.content)
        : { text: '', ok: true }
    const decodedContent = decodedContentResult.text
    const binaryFile = fileContentResult?.success
        ? !decodedContentResult.ok || isBinaryContent(decodedContent)
        : false

    const language = useMemo(() => resolveLanguage(filePath), [filePath])
    const highlighted = useShikiHighlighter(decodedContent, language)
    const tabularDelimiter = useMemo(() => getTabularFileDelimiter(filePath), [filePath])
    const tabularPreview = useMemo(() => {
        if (!tabularDelimiter || !fileContentResult?.success || binaryFile || !decodedContent) {
            return null
        }
        return parseTabularPreview(decodedContent, { delimiter: tabularDelimiter })
    }, [tabularDelimiter, fileContentResult?.success, binaryFile, decodedContent])
    const tabularDiffPreview = useMemo(() => {
        if (!tabularDelimiter || !diffContent) {
            return null
        }
        return parseTabularDiffPreview(diffContent, { delimiter: tabularDelimiter })
    }, [tabularDelimiter, diffContent])
    const contentSizeBytes = useMemo(
        () => (decodedContent ? getUtf8ByteLength(decodedContent) : 0),
        [decodedContent]
    )
    const canCopyContent = fileContentResult?.success === true
        && !binaryFile
        && decodedContent.length > 0
        && contentSizeBytes <= MAX_COPYABLE_FILE_BYTES

    const [displayMode, setDisplayMode] = useState<'diff' | 'file'>('diff')
    const [fileViewMode, setFileViewMode] = useState<'table' | 'raw'>('raw')
    const [diffViewMode, setDiffViewMode] = useState<'table' | 'raw'>('raw')

    useEffect(() => {
        if (diffSuccess && !diffContent) {
            setDisplayMode('file')
            return
        }
        if (diffFailed) {
            setDisplayMode('file')
        }
    }, [diffSuccess, diffFailed, diffContent])

    useEffect(() => {
        const defaultMode = tabularDelimiter ? 'table' : 'raw'
        setFileViewMode(defaultMode)
        setDiffViewMode(defaultMode)
    }, [filePath, tabularDelimiter])

    const loading = diffQuery.isLoading || fileQuery.isLoading
    const fileError = fileContentResult && !fileContentResult.success
        ? (fileContentResult.error ?? 'Failed to read file')
        : null
    const missingPath = !filePath
    const diffErrorMessage = diffError ? `Diff unavailable: ${diffError}` : null

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{fileName}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{filePath || 'Unknown path'}</div>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--app-bg)]">
                <div className="mx-auto w-full max-w-content px-3 py-2 flex items-center gap-2 border-b border-[var(--app-divider)]">
                    <FileIcon fileName={fileName} size={20} />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-hint)]">{filePath}</span>
                    <button
                        type="button"
                        onClick={() => copyPath(filePath)}
                        className="shrink-0 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                        title="Copy path"
                    >
                        {pathCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            {diffContent ? (
                <div className="bg-[var(--app-bg)]">
                    <div className="mx-auto w-full max-w-content px-3 py-2 flex flex-wrap items-center gap-2 border-b border-[var(--app-divider)]">
                        <button
                            type="button"
                            onClick={() => setDisplayMode('diff')}
                            className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'diff' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                        >
                            Diff
                        </button>
                        <button
                            type="button"
                            onClick={() => setDisplayMode('file')}
                            className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'file' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                        >
                            File
                        </button>
                        {displayMode === 'diff' && tabularDelimiter ? (
                            <div className="ml-auto inline-flex rounded-md bg-[var(--app-subtle-bg)] p-1">
                                <button
                                    type="button"
                                    onClick={() => setDiffViewMode('table')}
                                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${diffViewMode === 'table' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'text-[var(--app-hint)]'}`}
                                >
                                    Table
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDiffViewMode('raw')}
                                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${diffViewMode === 'raw' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'text-[var(--app-hint)]'}`}
                                >
                                    Raw
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content p-4">
                    {diffErrorMessage ? (
                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs text-[var(--app-hint)]">
                            {diffErrorMessage}
                        </div>
                    ) : null}
                    {missingPath ? (
                        <div className="text-sm text-[var(--app-hint)]">No file path provided.</div>
                    ) : loading ? (
                        <FileContentSkeleton />
                    ) : fileError ? (
                        <div className="text-sm text-[var(--app-hint)]">{fileError}</div>
                    ) : binaryFile ? (
                        <div className="text-sm text-[var(--app-hint)]">
                            This looks like a binary file. It cannot be displayed.
                        </div>
                    ) : displayMode === 'diff' && diffContent ? (
                        tabularDelimiter && diffViewMode === 'table' && tabularDiffPreview ? (
                            <div className="space-y-3">
                                <TabularDiffPreviewNotice preview={tabularDiffPreview} />
                                <TabularDiffPreviewTable preview={tabularDiffPreview} />
                            </div>
                        ) : (
                            <DiffDisplay diffContent={diffContent} />
                        )
                    ) : displayMode === 'diff' && diffError ? (
                        <div className="text-sm text-[var(--app-hint)]">{diffError}</div>
                    ) : displayMode === 'file' ? (
                        decodedContent ? (
                            <div className="space-y-3">
                                {tabularPreview ? (
                                    <>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="inline-flex rounded-md bg-[var(--app-subtle-bg)] p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setFileViewMode('table')}
                                                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${fileViewMode === 'table' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'text-[var(--app-hint)]'}`}
                                                >
                                                    Table
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFileViewMode('raw')}
                                                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${fileViewMode === 'raw' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'text-[var(--app-hint)]'}`}
                                                >
                                                    Raw
                                                </button>
                                            </div>
                                            {canCopyContent ? (
                                                <button
                                                    type="button"
                                                    onClick={() => copyContent(decodedContent)}
                                                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                                                    title="Copy file content"
                                                >
                                                    {contentCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                                                    <span>{contentCopied ? 'Copied' : 'Copy raw'}</span>
                                                </button>
                                            ) : null}
                                        </div>
                                        {fileViewMode === 'table' ? (
                                            <>
                                                <TabularPreviewNotice preview={tabularPreview} />
                                                <TabularFilePreview preview={tabularPreview} />
                                            </>
                                        ) : (
                                            <RawFilePreview
                                                content={decodedContent}
                                                highlighted={highlighted}
                                                canCopyContent={false}
                                                copied={contentCopied}
                                                onCopy={() => copyContent(decodedContent)}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <RawFilePreview
                                        content={decodedContent}
                                        highlighted={highlighted}
                                        canCopyContent={canCopyContent}
                                        copied={contentCopied}
                                        onCopy={() => copyContent(decodedContent)}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
                        )
                    ) : (
                        <div className="text-sm text-[var(--app-hint)]">No changes to display.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
