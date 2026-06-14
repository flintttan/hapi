import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir, hostname, platform } from 'node:os'
import { AGENT_MESSAGE_PAYLOAD_TYPE } from '@hapi/protocol'
import {
    buildImportedSessionMetadata as buildImportedSessionMetadataShared,
    parseCodexLocalSessionContent,
    parseCodexTranscriptImportData as parseCodexTranscriptImportDataShared,
    type CodexLocalSessionSummary,
    type CodexTranscriptImportData
} from '@hapi/protocol/codexImport'
import type { Hono } from 'hono'
import { Hono as HonoRuntime } from 'hono'
import type { WebAppEnv } from '../middleware/auth'
import type { Store, StoredMessage } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import type { CodexImportedMessageContent } from '@hapi/protocol/codexImport'

type ScriptLogKind = 'sync' | 'restart'

const DIRECT_IMPORT_COMMAND = 'direct-import'
const RESTART_SCRIPT_ENV_NAME = 'HAPI_CODEX_RESTART_SCRIPT'
const RESTART_SCRIPT_DEFAULT_FILE = 'Restart-CodexDesktop.ps1'
const RESTART_SCRIPT_ARGS = ['-Apply']
const RESTART_SCRIPT_MESSAGE = 'Codex Desktop restart script started'

type ScriptLaunchResponse = {
    success: true
    message: string
    pid: number
    command: string
    script?: string
    cwd: string
    output?: string
    codexDesktopRunning?: boolean
    codexClientAvailable?: boolean
    syncedCount?: number
    sessionIds?: string[]
    hapiSessionId?: string
} | {
    success: false
    error: string
    script?: string
    cwd: string
    output?: string
    codexDesktopRunning?: boolean
    codexClientAvailable?: boolean
    syncedCount?: number
    sessionIds?: string[]
    hapiSessionId?: string
}

type CodexDesktopStatus = {
    running: boolean
    clientAvailable: boolean
}

type CodexDesktopStatusResponse = {
    success: true
    codexDesktopRunning: boolean
    codexClientAvailable: boolean
    codexTranscriptImportAvailable: boolean
}

type CodexLocalSessionsResponse = {
    success: true
    sessions: CodexLocalSessionSummary[]
}

type ImportCandidate = {
    sessionId: string
    active: boolean
    updatedAt: number
    metadata: Record<string, unknown> | null
}

type ImportTargetSelection = {
    sessionId: string | null
    comparablePrefixCount: number
}

type SyncSessionRequestParseResult = {
    sessionIds: string[]
    error?: string
}

type CodexDuplicateSessionGroup = {
    codexSessionId: string
    hapiSessionIds: string[]
    canonicalSessionId?: string
    removedSessionIds?: string[]
}

type CodexDuplicateSessionsResponse = {
    success: true
    duplicates: CodexDuplicateSessionGroup[]
} | {
    success: false
    error: string
}

type CodexMergeDuplicateSessionsResponse = {
    success: true
    merged: CodexDuplicateSessionGroup[]
    mergedCount: number
} | {
    success: false
    error: string
}

type DuplicateSessionGroupCandidate = {
    codexSessionId: string
    sessions: ImportCandidate[]
}

const CODEX_DESKTOP_NOT_FOUND_ERROR = '尝试重启Codex失败，未找到可用的 Codex CLI 或 Codex App'
const SCRIPT_TIMEOUT_ERROR = '执行超时'
const NO_SYNC_SESSION_SELECTED_ERROR = '未选择需要导入的 Codex 会话'
const RPC_HANDLER_NOT_REGISTERED_PREFIX = 'RPC handler not registered:'
const DEFAULT_SCRIPT_TIMEOUT_MS = 60_000
const DEFAULT_CODEX_SESSION_SCAN_LIMIT = 2_000
const SUMMARY_READ_WINDOW_BYTES = 64 * 1024

function resolveLocalPath(pathValue: string): string {
    return isAbsolute(pathValue) ? pathValue : resolve(process.cwd(), pathValue)
}

function getScriptRoot(): string {
    const configured = process.env.HAPI_CODEX_SCRIPT_ROOT?.trim()
    return configured ? resolveLocalPath(configured) : process.cwd()
}

function getDefaultScriptPath(defaultFile: string): string {
    const configuredRoot = process.env.HAPI_CODEX_SCRIPT_ROOT?.trim()
    if (configuredRoot) {
        return join(resolveLocalPath(configuredRoot), defaultFile)
    }

    const cwd = process.cwd()
    const candidateRoots = [
        cwd,
        resolve(cwd, '..'),
        resolve(cwd, '..', '..')
    ]

    for (const root of candidateRoots) {
        const candidate = join(root, defaultFile)
        if (existsSync(candidate)) {
            return candidate
        }
    }

    return join(getScriptRoot(), defaultFile)
}

function getRestartScriptPath(): string {
    const configured = process.env[RESTART_SCRIPT_ENV_NAME]?.trim()
    return configured ? resolveLocalPath(configured) : getDefaultScriptPath(RESTART_SCRIPT_DEFAULT_FILE)
}

function getWorkspace(scriptPath: string): string {
    const configured = process.env.HAPI_CODEX_WORKSPACE?.trim()
    return configured ? resolveLocalPath(configured) : dirname(scriptPath)
}

function getDirectImportWorkspace(): string {
    const configured = process.env.HAPI_CODEX_WORKSPACE?.trim()
    return configured ? resolveLocalPath(configured) : process.cwd()
}

function expandHomePath(pathValue: string): string {
    return pathValue.replace(/^~(?=$|[\\/])/, getUserHomeDir())
}

function getUserHomeDir(): string {
    const configured = process.env.HOME?.trim()
    if (!configured) {
        return homedir()
    }

    return configured.replace(/^~(?=$|[\\/])/, homedir())
}

function getCodexHome(): string {
    const configured = process.env.CODEX_HOME?.trim()
    return configured ? resolveLocalPath(expandHomePath(configured)) : join(getUserHomeDir(), '.codex')
}

function getCodexHomeCandidates(): string[] {
    const configuredImportHome = process.env.HAPI_CODEX_HOME?.trim()
    const configuredRuntimeHome = process.env.CODEX_HOME?.trim()
    const homeCodexDir = join(getUserHomeDir(), '.codex')
    const candidates = [
        configuredImportHome ? resolveLocalPath(expandHomePath(configuredImportHome)) : null,
        configuredRuntimeHome ? resolveLocalPath(expandHomePath(configuredRuntimeHome)) : null,
        homeCodexDir
    ].filter((value): value is string => Boolean(value))
    return candidates
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function extractCodexText(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim()
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                const record = asRecord(item)
                if (record?.type === 'text' && typeof record.text === 'string') return record.text
                if (record?.type === 'input_text' && typeof record.text === 'string') return record.text
                if (record?.type === 'output_text' && typeof record.text === 'string') return record.text
                return null
            })
            .filter((part): part is string => Boolean(part))
            .join(' ')
            .trim()
    }
    const record = asRecord(value)
    if (record?.type === 'text' && typeof record.text === 'string') {
        return record.text.trim()
    }
    if (record?.type === 'input_text' && typeof record.text === 'string') {
        return record.text.trim()
    }
    if (record?.type === 'output_text' && typeof record.text === 'string') {
        return record.text.trim()
    }
    return ''
}

function truncateText(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function shouldIgnoreSyntheticUserMessage(text: string): boolean {
    const normalized = text.trim()
    return normalized.startsWith('# AGENTS.md instructions')
        || normalized.startsWith('<environment_context>')
}

function inferSessionIdFromFileName(filePath: string): string | null {
    const match = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/.exec(filePath)
    return match?.[1] ?? null
}

function parseCodexFunctionArguments(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value
    }

    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return value
    }

    try {
        return JSON.parse(trimmed)
    } catch {
        return value
    }
}

function extractCodexToolCallId(payload: Record<string, unknown>): string | null {
    const candidates = ['call_id', 'callId', 'tool_call_id', 'toolCallId', 'id']
    for (const key of candidates) {
        const value = payload[key]
        if (typeof value === 'string' && value.length > 0) {
            return value
        }
    }
    return null
}

function extractCodexChangedTitle(record: Record<string, unknown>): string | null {
    const type = typeof record.type === 'string' ? record.type : null
    if (type === 'response_item') {
        const payload = asRecord(record.payload)
        if (payload?.type === 'function_call' && payload.name === 'change_title') {
            const argumentsText = typeof payload.arguments === 'string' ? payload.arguments : null
            if (!argumentsText) return null
            try {
                const parsedArguments = JSON.parse(argumentsText) as { title?: unknown }
                return typeof parsedArguments.title === 'string' && parsedArguments.title.trim()
                    ? parsedArguments.title.trim()
                    : null
            } catch {
                return null
            }
        }
    }

    if (type === 'event_msg') {
        const payload = asRecord(record.payload)
        if (payload?.type === 'mcp_tool_call_end') {
            const invocation = asRecord(payload.invocation)
            const argumentsRecord = asRecord(invocation?.arguments)
            if (invocation?.tool === 'change_title' && typeof argumentsRecord?.title === 'string' && argumentsRecord.title.trim()) {
                return argumentsRecord.title.trim()
            }
        }
    }

    return null
}

function getLatestCodexChangedTitle(lines: string[]): string | null {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
            const parsed = JSON.parse(lines[index])
            const record = asRecord(parsed)
            if (!record) continue
            const title = extractCodexChangedTitle(record)
            if (title) {
                return title
            }
        } catch {
            continue
        }
    }
    return null
}

function getLatestCodexUserMessage(lines: string[]): string | null {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
            const parsed = JSON.parse(lines[index])
            const record = asRecord(parsed)
            if (!record || record.type !== 'response_item') continue
            const payload = asRecord(record.payload)
            if (payload?.type !== 'message' || payload.role !== 'user') continue
            const text = extractCodexText(payload.content)
            if (text && !shouldIgnoreSyntheticUserMessage(text)) {
                return truncateText(text, 140)
            }
        } catch {
            continue
        }
    }
    return null
}

function isSubagentSource(value: unknown): boolean {
    const record = asRecord(value)
    return record ? Object.prototype.hasOwnProperty.call(record, 'subagent') : false
}

function buildImportedUserMessage(text: string): CodexImportedMessageContent {
    return {
        role: 'user',
        content: {
            type: 'text',
            text
        },
        meta: {
            sentFrom: 'cli'
        }
    }
}

function buildImportedAgentMessage(data: unknown): CodexImportedMessageContent {
    return {
        role: 'agent',
        content: {
            type: AGENT_MESSAGE_PAYLOAD_TYPE,
            data
        },
        meta: {
            sentFrom: 'cli'
        }
    }
}

function convertCodexRecordToImportedMessage(record: Record<string, unknown>): CodexImportedMessageContent | null {
    const type = asString(record.type)
    const payload = asRecord(record.payload)
    if (!type || !payload) {
        return null
    }

    if (type === 'event_msg') {
        const eventType = asString(payload.type)
        if (!eventType) {
            return null
        }

        if (eventType === 'user_message') {
            const text = asString(payload.message)
                ?? asString(payload.text)
                ?? asString(payload.content)
            if (!text || shouldIgnoreSyntheticUserMessage(text)) {
                return null
            }
            return buildImportedUserMessage(text)
        }

        if (eventType === 'agent_message') {
            const message = asString(payload.message)
            return message ? buildImportedAgentMessage({ type: 'message', message, id: randomUUID() }) : null
        }

        if (eventType === 'agent_reasoning') {
            const message = asString(payload.text) ?? asString(payload.message)
            return message ? buildImportedAgentMessage({ type: 'reasoning', message, id: randomUUID() }) : null
        }

        if (eventType === 'agent_reasoning_delta') {
            const delta = asString(payload.delta) ?? asString(payload.text) ?? asString(payload.message)
            return delta ? buildImportedAgentMessage({ type: 'reasoning-delta', delta }) : null
        }

        if (eventType === 'token_count') {
            const info = asRecord(payload.info)
            return info ? buildImportedAgentMessage({ type: 'token_count', info, id: randomUUID() }) : null
        }

        return null
    }

    if (type === 'response_item') {
        const itemType = asString(payload.type)
        if (!itemType) {
            return null
        }

        if (itemType === 'message') {
            const role = asString(payload.role)
            const text = extractCodexText(payload.content)
            if (!text || shouldIgnoreSyntheticUserMessage(text)) {
                return null
            }
            if (role === 'user') {
                return buildImportedUserMessage(text)
            }
            if (role === 'assistant') {
                return buildImportedAgentMessage({ type: 'message', message: text, id: randomUUID() })
            }
            return null
        }

        if (itemType === 'function_call') {
            const name = asString(payload.name)
            const callId = extractCodexToolCallId(payload)
            if (!name || !callId) {
                return null
            }
            return buildImportedAgentMessage({
                type: 'tool-call',
                name,
                callId,
                input: parseCodexFunctionArguments(payload.arguments),
                id: randomUUID()
            })
        }

        if (itemType === 'function_call_output') {
            const callId = extractCodexToolCallId(payload)
            if (!callId) {
                return null
            }
            return buildImportedAgentMessage({
                type: 'tool-call-result',
                callId,
                output: payload.output,
                id: randomUUID()
            })
        }
    }

    return null
}

function hasAnyJsonlFile(root: string): boolean {
    if (!existsSync(root)) return false
    let entries
    try {
        entries = readdirSync(root, { withFileTypes: true })
    } catch {
        return false
    }

    for (const entry of entries) {
        const fullPath = join(root, entry.name)
        if (entry.isDirectory()) {
            if (hasAnyJsonlFile(fullPath)) {
                return true
            }
            continue
        }
        if (entry.isFile() && fullPath.toLowerCase().endsWith('.jsonl')) {
            return true
        }
    }

    return false
}

function hasAnyCodexTranscript(root: string): boolean {
    return hasAnyJsonlFile(root)
}

function getCodexSessionRoots(): string[] {
    const candidateHomes = getCodexHomeCandidates()
    const candidateRoots = candidateHomes.map((home) => join(home, 'sessions'))

    for (const root of candidateRoots) {
        if (hasAnyCodexTranscript(root)) {
            return [root]
        }
    }

    return candidateRoots.filter((root) => existsSync(root))
}

function normalizeComparablePath(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    if (!trimmed) return null
    return resolve(expandHomePath(trimmed))
}

function getLocalHostName(): string {
    return process.env.HAPI_HOSTNAME?.trim() || hostname()
}

function isRpcHandlerNotRegisteredForMethod(error: unknown, method: string): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '')
    return message.includes(RPC_HANDLER_NOT_REGISTERED_PREFIX) && message.endsWith(`:${method}`)
}

export function canFallbackToLocalCodexMachine(machine: {
    metadata?: {
        host?: string
        homeDir?: string
    } | null
} | null | undefined): boolean {
    const machineHost = machine?.metadata?.host?.trim()
    const machineHomeDir = normalizeComparablePath(machine?.metadata?.homeDir)
    const localHomeDir = normalizeComparablePath(getUserHomeDir())

    if (!machineHost || !localHomeDir) {
        return false
    }

    if (machineHost !== getLocalHostName()) {
        return false
    }

    // 中文注释：旧 runner 可能还没有上报 homeDir，但同机导入仍然可以直接读本机 ~/.codex；
    // 这种情况下只要 host 能对上，就允许走本地 fallback，避免 listCodexSessions 直接 500。
    return !machineHomeDir || machineHomeDir === localHomeDir
}

function collectJsonlFiles(root: string, files: string[]): void {
    if (!existsSync(root)) return
    let entries
    try {
        entries = readdirSync(root, { withFileTypes: true })
    } catch {
        return
    }

    for (const entry of entries) {
        const fullPath = join(root, entry.name)
        if (entry.isDirectory()) {
            collectJsonlFiles(fullPath, files)
            continue
        }
        if (entry.isFile() && fullPath.toLowerCase().endsWith('.jsonl')) {
            files.push(fullPath)
        }
    }
}

function getCodexSessionTitle(
    cwd: string | null | undefined,
    sessionId: string,
    changedTitle: string | null,
    firstUserMessage: string | null
): string {
    if (changedTitle) {
        return truncateText(changedTitle, 80)
    }

    if (firstUserMessage) {
        return truncateText(firstUserMessage, 80)
    }

    if (cwd) {
        const parts = cwd.split(/[\\/]+/).filter(Boolean)
        if (parts.length > 0) {
            return parts[parts.length - 1]
        }
    }

    return sessionId.slice(0, 8)
}

function listLocalCodexSessions(limit = DEFAULT_CODEX_SESSION_SCAN_LIMIT): CodexLocalSessionSummary[] {
    const files: string[] = []
    for (const root of getCodexSessionRoots()) {
        collectJsonlFiles(root, files)
    }

    const deduped = new Map<string, CodexLocalSessionSummary>()
    for (const filePath of files) {
        const session = parseCodexLocalSession(filePath)
        if (!session) continue
        const previous = deduped.get(session.id)
        if (!previous || previous.modifiedAt < session.modifiedAt) {
            deduped.set(session.id, session)
        }
    }

    return Array.from(deduped.values())
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, limit)
}

export function listDiscoveredLocalCodexSessions(limit = DEFAULT_CODEX_SESSION_SCAN_LIMIT): CodexLocalSessionSummary[] {
    return listLocalCodexSessions(limit)
}

function parseCodexLocalSession(filePath: string): CodexLocalSessionSummary | null {
    let modifiedAt = Date.now()
    try {
        modifiedAt = statSync(filePath).mtimeMs
    } catch {
        // 中文注释：拿不到文件 mtime 时退回到当前时间，避免单个 transcript 的 stat 异常中断整个列表。
    }

    const content = readTranscriptSummaryContent(filePath)
    if (!content) {
        return null
    }

    return parseCodexLocalSessionContent(filePath, content, { modifiedAt })
}

function parseCodexTranscriptImportData(summary: CodexLocalSessionSummary): CodexTranscriptImportData | null {
    let content: string
    try {
        content = readFileSync(summary.file, 'utf-8')
    } catch {
        return null
    }

    return parseCodexTranscriptImportDataShared(summary, content)
}

export function getDiscoveredLocalCodexTranscriptImportData(sessionId: string): CodexTranscriptImportData | null {
    const summary = listLocalCodexSessions().find((item) => item.id === sessionId)
    if (!summary) return null
    return parseCodexTranscriptImportData(summary)
}

function readTranscriptSummaryContent(filePath: string): string | null {
    let stats
    try {
        stats = statSync(filePath)
    } catch {
        return null
    }

    if (stats.size <= SUMMARY_READ_WINDOW_BYTES * 2) {
        try {
            return readFileSync(filePath, 'utf-8')
        } catch {
            return null
        }
    }

    let fd: number | null = null
    try {
        fd = openSync(filePath, 'r')
        const head = Buffer.allocUnsafe(SUMMARY_READ_WINDOW_BYTES)
        const tail = Buffer.allocUnsafe(SUMMARY_READ_WINDOW_BYTES)
        const headBytes = readSync(fd, head, 0, SUMMARY_READ_WINDOW_BYTES, 0)
        const tailStart = Math.max(0, stats.size - SUMMARY_READ_WINDOW_BYTES)
        const tailBytes = readSync(fd, tail, 0, SUMMARY_READ_WINDOW_BYTES, tailStart)
        return `${head.subarray(0, headBytes).toString('utf-8')}\n${tail.subarray(0, tailBytes).toString('utf-8')}`
    } catch {
        return null
    } finally {
        if (fd !== null) {
            try {
                closeSync(fd)
            } catch {
                // noop
            }
        }
    }
}

function stableSerialize(value: unknown): string {
    if (value === null || value === undefined) {
        return String(value)
    }
    if (typeof value === 'string') {
        return JSON.stringify(value)
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(',')}]`
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>
        const keys = Object.keys(record).sort()
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}

function normalizeComparableAgentData(value: unknown): unknown {
    const record = asRecord(value)
    if (!record) {
        return value
    }

    const normalized = { ...record }
    if ('id' in normalized) {
        delete normalized.id
    }
    return normalized
}

function normalizeComparableContent(content: unknown): string | null {
    const record = asRecord(content)
    if (!record) {
        return null
    }

    if (record.role === 'user') {
        const body = asRecord(record.content)
        if (body?.type !== 'text' || typeof body.text !== 'string') {
            return null
        }
        return stableSerialize({
            role: 'user',
            text: body.text
        })
    }

    if (record.role === 'agent') {
        const body = asRecord(record.content)
        if (!body || body.type !== AGENT_MESSAGE_PAYLOAD_TYPE) {
            return null
        }
        return stableSerialize({
            role: 'agent',
            data: normalizeComparableAgentData(body.data)
        })
    }

    return null
}

function getComparableStoredMessageKey(message: StoredMessage): string {
    // 中文注释：重复会话合并时优先按标准 user/agent 结构去重；遇到非标准消息再回退到稳定序列化，确保不会遗漏相同内容。
    return normalizeComparableContent(message.content) ?? stableSerialize(message.content)
}

function collectImportCandidates(
    store: Store,
    namespace: string,
    getSyncEngine?: () => SyncEngine | null
): ImportCandidate[] {
    const engineSessions = getSyncEngine?.()?.getSessionsByNamespace(namespace) ?? []
    if (engineSessions.length > 0) {
        return engineSessions.map((session) => ({
            sessionId: session.id,
            active: session.active,
            updatedAt: session.updatedAt,
            metadata: asRecord(session.metadata)
        }))
    }

    return store.sessions.getSessionsByNamespace(namespace).map((session) => ({
        sessionId: session.id,
        active: session.active,
        updatedAt: session.updatedAt,
        metadata: asRecord(session.metadata)
    }))
}

function selectImportTargetSession(
    store: Store,
    candidates: ImportCandidate[],
    codexSessionId: string,
    importedComparableMessages: string[]
): ImportTargetSelection {
    const relatedCandidates = candidates
        .filter((candidate) => candidate.metadata?.codexSessionId === codexSessionId)
        .sort((a, b) => b.updatedAt - a.updatedAt)

    if (relatedCandidates.some((candidate) => candidate.active)) {
        throw new Error('当前会话仍处于活跃状态，请等待会话结束后重试')
    }

    let bestSessionId: string | null = null
    let bestPrefixCount = -1

    for (const candidate of relatedCandidates) {
        const comparableMessages = store.messages.getAllMessages(candidate.sessionId)
            .map((message) => normalizeComparableContent(message.content))
            .filter((value): value is string => value !== null)

        if (comparableMessages.length > importedComparableMessages.length) {
            continue
        }

        let prefixMatches = true
        for (let index = 0; index < comparableMessages.length; index += 1) {
            if (comparableMessages[index] !== importedComparableMessages[index]) {
                prefixMatches = false
                break
            }
        }

        if (!prefixMatches) {
            continue
        }

        if (comparableMessages.length > bestPrefixCount) {
            bestPrefixCount = comparableMessages.length
            bestSessionId = candidate.sessionId
        }
    }

    return {
        sessionId: bestSessionId,
        comparablePrefixCount: Math.max(0, bestPrefixCount)
    }
}

function listDuplicateCodexSessionGroups(
    store: Store,
    namespace: string,
    codexSessionIds: string[],
    getSyncEngine?: () => SyncEngine | null
): DuplicateSessionGroupCandidate[] {
    const requestedSessionIds = new Set(codexSessionIds)
    if (requestedSessionIds.size === 0) {
        return []
    }

    const groups = new Map<string, ImportCandidate[]>()
    for (const candidate of collectImportCandidates(store, namespace, getSyncEngine)) {
        const codexSessionId = typeof candidate.metadata?.codexSessionId === 'string'
            ? candidate.metadata.codexSessionId
            : null
        if (!codexSessionId || !requestedSessionIds.has(codexSessionId)) {
            continue
        }

        const existing = groups.get(codexSessionId)
        if (existing) {
            existing.push(candidate)
        } else {
            groups.set(codexSessionId, [candidate])
        }
    }

    return Array.from(groups.entries())
        .map(([codexSessionId, sessions]) => ({
            codexSessionId,
            sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt)
        }))
        .filter((group) => group.sessions.length > 1)
}

async function mergeDuplicateCodexSessionGroups(options: {
    store: Store
    namespace: string
    codexSessionIds: string[]
    getSyncEngine?: () => SyncEngine | null
}): Promise<CodexMergeDuplicateSessionsResponse> {
    const groups = listDuplicateCodexSessionGroups(
        options.store,
        options.namespace,
        options.codexSessionIds,
        options.getSyncEngine
    )
    if (groups.length === 0) {
        return {
            success: true,
            merged: [],
            mergedCount: 0
        }
    }

    const merged: CodexDuplicateSessionGroup[] = []
    for (const group of groups) {
        const result = await mergeSingleDuplicateCodexSessionGroup({
            group,
            store: options.store,
            namespace: options.namespace,
            getSyncEngine: options.getSyncEngine
        })
        merged.push(result)
    }

    return {
        success: true,
        merged,
        mergedCount: merged.length
    }
}

async function mergeSingleDuplicateCodexSessionGroup(options: {
    group: DuplicateSessionGroupCandidate
    store: Store
    namespace: string
    getSyncEngine?: () => SyncEngine | null
}): Promise<CodexDuplicateSessionGroup> {
    const engine = options.getSyncEngine?.() ?? null
    const sessionStates = options.group.sessions
        .map((candidate) => ({
            ...candidate,
            storedMessages: options.store.messages.getAllMessages(candidate.sessionId),
        }))
        .map((candidate) => ({
            ...candidate,
            comparableKeys: candidate.storedMessages.map((message) => getComparableStoredMessageKey(message))
        }))
        .sort((a, b) => {
            if (b.comparableKeys.length !== a.comparableKeys.length) {
                return b.comparableKeys.length - a.comparableKeys.length
            }
            if (b.updatedAt !== a.updatedAt) {
                return b.updatedAt - a.updatedAt
            }
            return a.sessionId.localeCompare(b.sessionId)
        })

    if (sessionStates.some((candidate) => candidate.active)) {
        throw new Error('当前会话仍处于活跃状态，请等待会话结束后重试')
    }

    const canonical = sessionStates[0]
    if (!canonical) {
        throw new Error(`No duplicate Hapi session found for Codex thread: ${options.group.codexSessionId}`)
    }

    const knownKeys = new Set(canonical.comparableKeys)
    const removedSessionIds: string[] = []
    const appendedMessages: StoredMessage[] = []
    let latestActivity = canonical.updatedAt

    for (const source of sessionStates.slice(1)) {
        latestActivity = Math.max(latestActivity, source.updatedAt)
        for (const message of source.storedMessages) {
            const comparableKey = getComparableStoredMessageKey(message)
            if (knownKeys.has(comparableKey)) {
                continue
            }

            const copied = options.store.messages.copyMessageToSession(canonical.sessionId, {
                content: message.content,
                createdAt: message.createdAt,
                localId: message.localId,
                invokedAt: message.invokedAt,
                scheduledAt: message.scheduledAt
            })
            knownKeys.add(comparableKey)
            appendedMessages.push(copied)
            latestActivity = Math.max(latestActivity, copied.invokedAt ?? copied.createdAt)
        }

        if (engine) {
            await engine.deleteSession(source.sessionId)
        } else {
            const deleted = options.store.sessions.deleteSession(source.sessionId, options.namespace)
            if (!deleted) {
                throw new Error(`Failed to delete duplicate Hapi session: ${source.sessionId}`)
            }
        }
        removedSessionIds.push(source.sessionId)
    }

    if (appendedMessages.length > 0) {
        emitImportedMessageEvents(engine, canonical.sessionId, appendedMessages)
    }

    if (engine) {
        engine.recordSessionActivity(canonical.sessionId, latestActivity)
        // 中文注释：即使这次只是删除重复分身、没有新增消息，也主动刷新 canonical 会话，确保左侧列表立刻收敛到合并后的状态。
        engine.handleRealtimeEvent({
            type: 'session-updated',
            sessionId: canonical.sessionId
        })
    } else {
        options.store.sessions.touchSessionUpdatedAt(canonical.sessionId, latestActivity, options.namespace)
    }

    return {
        codexSessionId: options.group.codexSessionId,
        hapiSessionIds: sessionStates.map((candidate) => candidate.sessionId),
        canonicalSessionId: canonical.sessionId,
        removedSessionIds
    }
}

function emitImportedMessageEvents(
    engine: SyncEngine | null,
    sessionId: string,
    appendedMessages: StoredMessage[]
): void {
    if (!engine) {
        return
    }

    // 中文注释：只有追加到已有 Hapi 会话时才逐条广播新增消息，确保当前打开的会话右侧消息区能立即刷新到最新 transcript。
    for (const message of appendedMessages) {
        engine.handleRealtimeEvent({
            type: 'message-received',
            sessionId,
            message: {
                id: message.id,
                seq: message.seq,
                localId: message.localId ?? null,
                content: message.content,
                createdAt: message.createdAt,
                invokedAt: message.invokedAt
            }
        })
    }
}

function getPathExts(): string[] {
    if (process.platform !== 'win32') {
        return ['']
    }
    const fromEnv = (process.env.PATHEXT ?? '')
        .split(';')
        .map(ext => ext.trim().toLowerCase())
        .filter(Boolean)
    return Array.from(new Set(['', '.exe', '.cmd', '.bat', '.ps1', ...fromEnv]))
}

function findOnPath(commandName: string): string | null {
    if (commandName.includes('\\') || commandName.includes('/')) {
        return existsSync(commandName) ? commandName : null
    }

    const pathDirs = (process.env.PATH ?? '')
        .split(process.platform === 'win32' ? ';' : ':')
        .map(part => part.trim())
        .filter(Boolean)
    const extensions = getPathExts()

    for (const dir of pathDirs) {
        for (const ext of extensions) {
            const candidate = join(dir, commandName.endsWith(ext) ? commandName : `${commandName}${ext}`)
            if (existsSync(candidate)) {
                return candidate
            }
        }
    }

    return null
}

function findCodexCommandViaShell(): string | null {
    if (process.platform === 'win32') {
        return null
    }

    for (const shell of ['zsh', 'bash', 'sh']) {
        try {
            const result = spawnSync(shell, ['-lc', 'command -v codex'], {
                encoding: 'utf-8',
                timeout: 5000,
                windowsHide: true
            })
            if (result.status === 0) {
                const resolved = result.stdout.trim()
                if (resolved) {
                    return resolved
                }
            }
        } catch {
            // Try the next shell.
        }
    }

    return null
}

function getCodexLauncherCandidates(): string[] {
    return [
        process.env.HAPI_CODEX_COMMAND?.trim() ?? '',
        findOnPath('codex') ?? '',
        findCodexCommandViaShell() ?? '',
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'codex.exe') : ''
    ].filter(Boolean)
}

function isCodexLauncherAvailable(): boolean {
    return getCodexLauncherCandidates().some(candidate => {
        try {
            return existsSync(candidate)
        } catch {
            return false
        }
    })
}

function isCodexDesktopAppInstalled(): boolean {
    if (process.platform !== 'darwin') {
        return false
    }

    try {
        const result = spawnSync('open', ['-Ra', 'Codex'], {
            encoding: 'utf-8',
            timeout: 5000,
            windowsHide: true
        })
        return result.status === 0
    } catch {
        return false
    }
}

function isCodexDesktopPath(pathValue: string): boolean {
    return /\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(?:Codex|resources\\codex)\.exe$/i.test(pathValue)
}

function isCodexDesktopPackageInstalled(): boolean {
    if (process.platform !== 'win32') {
        return false
    }

    const command = [
        "$package = Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue",
        "if ($package) { 'true' } else { 'false' }"
    ].join('\n')

    for (const shell of ['pwsh', 'powershell.exe']) {
        try {
            const result = spawnSync(shell, ['-NoLogo', '-NoProfile', '-Command', command], {
                encoding: 'utf-8',
                timeout: 5000,
                windowsHide: true
            })
            if (result.status === 0) {
                return result.stdout.trim().toLowerCase().includes('true')
            }
        } catch {
            // Try next shell.
        }
    }

    return false
}

function isCodexDesktopInstallAvailable(): boolean {
    if (process.platform !== 'win32') {
        return isCodexLauncherAvailable() || isCodexDesktopAppInstalled()
    }

    if (isCodexDesktopPackageInstalled()) {
        return true
    }

    return getCodexLauncherCandidates().some(candidate => {
        try {
            return isCodexDesktopPath(candidate) && existsSync(candidate)
        } catch {
            return false
        }
    })
}

function isCodexDesktopRunning(): boolean {
    if (process.platform !== 'win32') {
        return false
    }

    const command = [
        "$targets = @(Get-CimInstance Win32_Process | Where-Object {",
        "    ($_.Name -ieq 'Codex.exe' -or $_.Name -ieq 'codex.exe') -and",
        "    $_.ExecutablePath -match '\\\\WindowsApps\\\\OpenAI\\.Codex_'",
        '})',
        "if ($targets.Count -gt 0) { 'true' } else { 'false' }"
    ].join('\n')

    for (const shell of ['pwsh', 'powershell.exe']) {
        try {
            const result = spawnSync(shell, ['-NoLogo', '-NoProfile', '-Command', command], {
                encoding: 'utf-8',
                timeout: 5000,
                windowsHide: true
            })
            if (result.status === 0) {
                return result.stdout.trim().toLowerCase().includes('true')
            }
        } catch {
            // Try next shell.
        }
    }

    return false
}

function getCodexDesktopStatus(): CodexDesktopStatus {
    const running = isCodexDesktopRunning()
    return {
        running,
        clientAvailable: running || isCodexDesktopInstallAvailable()
    }
}

function getScriptTimeoutMs(): number {
    const configured = Number(process.env.HAPI_CODEX_SCRIPT_TIMEOUT_MS)
    if (Number.isFinite(configured) && configured > 0) {
        return configured
    }
    return DEFAULT_SCRIPT_TIMEOUT_MS
}

function createLaunchArgs(scriptPath: string, workspace: string, scriptArgs: string[]): string[] {
    return [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Workspace',
        workspace,
        ...scriptArgs
    ]
}

function appendScriptLog(workspace: string, kind: ScriptLogKind, message: string): void {
    try {
        const logDir = join(workspace, 'logs')
        mkdirSync(logDir, { recursive: true })
        const line = `[${new Date().toISOString()}] [${kind}] ${message}\n`
        appendFileSync(join(logDir, 'CodexDesktopScript.log'), line, 'utf-8')
    } catch {
        // Best-effort logging only; API response still carries the error.
    }
}

async function runPowerShellScript(scriptPath: string, workspace: string, scriptArgs: string[]): Promise<{ pid: number; command: string; output: string }> {
    const configuredPwsh = process.env.HAPI_PWSH_PATH?.trim()
    const candidates = Array.from(new Set([
        configuredPwsh || 'pwsh',
        'powershell.exe'
    ]))
    const args = createLaunchArgs(scriptPath, workspace, scriptArgs)
    let lastError: unknown = null

    for (const command of candidates) {
        try {
            return await new Promise((resolvePromise, rejectPromise) => {
                const output: string[] = []
                let settled = false
                let didSpawn = false
                let timeout: ReturnType<typeof setTimeout> | null = null
                const child = spawn(command, args, {
                    cwd: workspace,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true
                })

                const cleanup = () => {
                    if (timeout) {
                        clearTimeout(timeout)
                    }
                    child.off('spawn', onSpawn)
                    child.off('error', onError)
                    child.off('exit', onExit)
                }

                const settleResolve = (value: { pid: number; command: string; output: string }) => {
                    if (settled) return
                    settled = true
                    cleanup()
                    resolvePromise(value)
                }

                const settleReject = (error: Error) => {
                    if (settled) return
                    settled = true
                    cleanup()
                    rejectPromise(error)
                }

                const onSpawn = () => {
                    didSpawn = true
                }

                const onError = (error: Error) => {
                    if (!didSpawn) {
                        ;(error as Error & { shellLaunchFailed?: boolean }).shellLaunchFailed = true
                    }
                    settleReject(error)
                }

                const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
                    const combinedOutput = output.join('').trim()
                    if (code === 0) {
                        settleResolve({ pid: child.pid ?? 0, command, output: combinedOutput })
                        return
                    }
                    const detail = combinedOutput ? `\n${combinedOutput}` : ''
                    settleReject(new Error(`${command} exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}.${detail}`))
                }

                timeout = setTimeout(() => {
                    child.kill()
                    settleReject(new Error(SCRIPT_TIMEOUT_ERROR))
                }, getScriptTimeoutMs())

                child.stdout?.on('data', (chunk) => output.push(String(chunk)))
                child.stderr?.on('data', (chunk) => output.push(String(chunk)))
                child.once('spawn', onSpawn)
                child.once('error', onError)
                child.once('exit', onExit)
            })
        } catch (error) {
            lastError = error
            if (!(error instanceof Error && (error as Error & { shellLaunchFailed?: boolean }).shellLaunchFailed)) {
                throw error instanceof Error ? error : new Error(String(error))
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function runCommand(command: string, args: string[], workspace: string): Promise<{ pid: number; command: string; output: string }> {
    return await new Promise((resolvePromise, rejectPromise) => {
        const output: string[] = []
        let settled = false
        let didSpawn = false
        let timeout: ReturnType<typeof setTimeout> | null = null
        const child = spawn(command, args, {
            cwd: workspace,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        })

        const cleanup = () => {
            if (timeout) {
                clearTimeout(timeout)
            }
            child.off('spawn', onSpawn)
            child.off('error', onError)
            child.off('exit', onExit)
        }

        const settleResolve = (value: { pid: number; command: string; output: string }) => {
            if (settled) return
            settled = true
            cleanup()
            resolvePromise(value)
        }

        const settleReject = (error: Error) => {
            if (settled) return
            settled = true
            cleanup()
            rejectPromise(error)
        }

        const onSpawn = () => {
            didSpawn = true
        }

        const onError = (error: Error) => {
            if (!didSpawn) {
                ;(error as Error & { shellLaunchFailed?: boolean }).shellLaunchFailed = true
            }
            settleReject(error)
        }

        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            const combinedOutput = output.join('').trim()
            if (code === 0) {
                settleResolve({ pid: child.pid ?? 0, command, output: combinedOutput })
                return
            }
            const detail = combinedOutput ? `\n${combinedOutput}` : ''
            settleReject(new Error(`${command} exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}.${detail}`))
        }

        timeout = setTimeout(() => {
            child.kill()
            settleReject(new Error(SCRIPT_TIMEOUT_ERROR))
        }, getScriptTimeoutMs())

        child.stdout?.on('data', (chunk) => output.push(String(chunk)))
        child.stderr?.on('data', (chunk) => output.push(String(chunk)))
        child.once('spawn', onSpawn)
        child.once('error', onError)
        child.once('exit', onExit)
    })
}

async function launchRestartScript(): Promise<ScriptLaunchResponse> {
    if (process.platform === 'darwin') {
        const workspace = getDirectImportWorkspace()
        const codexCommand = getCodexLauncherCandidates()[0]
        if (codexCommand) {
            try {
                const launched = await runCommand(codexCommand, ['app', workspace], workspace)
                return {
                    success: true,
                    message: RESTART_SCRIPT_MESSAGE,
                    pid: launched.pid,
                    command: launched.command,
                    script: codexCommand,
                    cwd: workspace,
                    output: launched.output
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                appendScriptLog(workspace, 'restart', `FAILED: ${message}; command=${codexCommand}`)
                return {
                    success: false,
                    error: message,
                    script: codexCommand,
                    cwd: workspace
                }
            }
        }

        try {
            const launched = await runCommand('open', ['-a', 'Codex', workspace], workspace)
            return {
                success: true,
                message: RESTART_SCRIPT_MESSAGE,
                pid: launched.pid,
                command: launched.command,
                script: 'open -a Codex',
                cwd: workspace,
                output: launched.output
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            appendScriptLog(workspace, 'restart', `FAILED: ${message}; command=open -a Codex`)
            return {
                success: false,
                error: message,
                script: 'open -a Codex',
                cwd: workspace
            }
        }
    }

    const scriptPath = getRestartScriptPath()
    const workspace = getWorkspace(scriptPath)

    if (!existsSync(scriptPath)) {
        appendScriptLog(workspace, 'restart', `FAILED: Script not found: ${scriptPath}`)
        return {
            success: false,
            error: `Script not found: ${scriptPath}`,
            script: scriptPath,
            cwd: workspace
        }
    }

    if (!existsSync(workspace)) {
        appendScriptLog(workspace, 'restart', `FAILED: Workspace not found: ${workspace}`)
        return {
            success: false,
            error: `Workspace not found: ${workspace}`,
            script: scriptPath,
            cwd: workspace
        }
    }

    try {
        const launched = await runPowerShellScript(scriptPath, workspace, RESTART_SCRIPT_ARGS)
        const output = launched.output
        appendScriptLog(
            workspace,
            'restart',
            `SUCCESS: ${RESTART_SCRIPT_MESSAGE}; pid=${launched.pid}; command=${launched.command}; script=${scriptPath}${output ? `; output=${output}` : ''}`
        )
        return {
            success: true,
            message: RESTART_SCRIPT_MESSAGE,
            pid: launched.pid,
            command: launched.command,
            script: scriptPath,
            cwd: workspace,
            output
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        appendScriptLog(workspace, 'restart', `FAILED: ${message}; script=${scriptPath}`)
        return {
            success: false,
            error: message,
            script: scriptPath,
            cwd: workspace
        }
    }
}

function parseSyncSessionRequest(body: unknown): SyncSessionRequestParseResult {
    // 中文注释：导入弹窗现在直接提交 Codex thread ID；未传 body 时按“未选择会话”处理，避免再回退到旧的默认最新会话逻辑。
    if (body === null || typeof body !== 'object' || Array.isArray(body) || !('sessionIds' in body)) {
        return { sessionIds: [] }
    }

    const rawSessionIds = (body as { sessionIds?: unknown }).sessionIds
    if (!Array.isArray(rawSessionIds)) {
        return { sessionIds: [], error: 'Invalid sessionIds' }
    }

    const sessionIds: string[] = []
    for (const value of rawSessionIds) {
        if (typeof value !== 'string') {
            return { sessionIds: [], error: 'Invalid sessionIds' }
        }
        const trimmed = value.trim()
        if (trimmed) {
            sessionIds.push(trimmed)
        }
    }

    // 中文注释：前端允许多选，这里按 Codex thread 去重，避免重复导入同一条本地 transcript。
    return { sessionIds: Array.from(new Set(sessionIds)) }
}

function combineSyncOutputs(results: ScriptLaunchResponse[]): string | undefined {
    const output = results
        .map((result, index) => {
            // 中文注释：direct import 不再依赖隐藏脚本；这里把每个会话的导入摘要拼成一段文本，便于前端或日志统一查看。
            const detail = result.success ? (result.output ?? '') : (result.output ?? result.error)
            return detail ? `[${index + 1}] ${detail}` : ''
        })
        .filter(Boolean)
        .join('\n\n')
        .trim()
    return output || undefined
}

function getDirectImportRouteContext(): { workspace: string } {
    return {
        workspace: getDirectImportWorkspace()
    }
}

function createImportErrorResponse(
    codexSessionIds: string[],
    error: string,
    syncedCount = 0
): ScriptLaunchResponse {
    const { workspace } = getDirectImportRouteContext()
    appendScriptLog(workspace, 'sync', `FAILED: ${error}; sessionIds=${codexSessionIds.join(',') || '(none)'}`)
    return {
        success: false,
        error,
        cwd: workspace,
        sessionIds: codexSessionIds,
        syncedCount
    }
}

function createImportSuccessResponse(
    codexSessionIds: string[],
    results: ScriptLaunchResponse[]
): ScriptLaunchResponse {
    const { workspace } = getDirectImportRouteContext()
    appendScriptLog(
        workspace,
        'sync',
        `SUCCESS: imported ${results.length} Codex session(s); sessionIds=${codexSessionIds.join(',')}`
    )
    return {
        success: true,
        message: `Imported ${results.length} Codex session(s) into Hapi`,
        pid: 0,
        command: DIRECT_IMPORT_COMMAND,
        cwd: workspace,
        output: combineSyncOutputs(results),
        sessionIds: codexSessionIds,
        syncedCount: results.length,
        hapiSessionId: results.length === 1 ? results[0]?.hapiSessionId : undefined
    }
}

function importCodexTranscriptData(options: {
    transcript: CodexTranscriptImportData
    store: Store
    namespace: string
    getSyncEngine?: () => SyncEngine | null
}): ScriptLaunchResponse {
    const transcript = options.transcript
    if (transcript.messages.length === 0) {
        return {
            ...createImportErrorResponse([transcript.id], `No importable conversation content found in transcript: ${transcript.file}`),
            output: `transcript 中没有可导入的会话内容：${transcript.file}`
        }
    }

    const importedComparableMessages = transcript.messages
        .map((message) => normalizeComparableContent(message))
        .filter((value): value is string => value !== null)

    try {
        const candidates = collectImportCandidates(options.store, options.namespace, options.getSyncEngine)
        const target = selectImportTargetSession(options.store, candidates, transcript.id, importedComparableMessages)
        const engine = options.getSyncEngine?.() ?? null
        const existingStored = target.sessionId ? options.store.sessions.getSessionByNamespace(target.sessionId, options.namespace) : null
        const metadata = buildImportedSessionMetadataShared(transcript, asRecord(existingStored?.metadata))

        let sessionId = existingStored?.id ?? null
        let created = false
        if (!sessionId) {
            // 中文注释：找不到可安全续写的历史会话时，直接新建一个 Hapi 会话，避免把已分叉的数据硬写进旧会话。
            const createdSession = engine?.getOrCreateSession(
                randomUUID(),
                metadata,
                {},
                options.namespace
            ) ?? options.store.sessions.getOrCreateSession(randomUUID(), metadata, {}, options.namespace)
            sessionId = createdSession.id
            created = true
        } else if (existingStored) {
            const updatedMetadata = options.store.sessions.updateSessionMetadata(
                existingStored.id,
                metadata,
                existingStored.metadataVersion,
                options.namespace
            )
            if (updatedMetadata.result !== 'success') {
                throw new Error(`Failed to update metadata for Hapi session: ${existingStored.id}`)
            }
            engine?.handleRealtimeEvent({ type: 'session-updated', sessionId: existingStored.id })
        }

        if (!sessionId) {
            throw new Error(`Failed to determine target Hapi session for Codex thread: ${transcript.id}`)
        }

        const comparablePrefixCount = sessionId ? target.comparablePrefixCount : 0
        const messagesToAppend = transcript.messages.slice(comparablePrefixCount)
        const appendedMessages = messagesToAppend.map((message) => options.store.messages.addMessage(sessionId!, message))

        // 中文注释：更新 Hapi 会话的 updatedAt，并在已有会话追加时广播新增消息，让当前打开的聊天页立刻显示客户端新增内容。
        const latestMessageCreatedAt = appendedMessages[appendedMessages.length - 1]?.createdAt ?? Date.now()
        if (engine) {
            engine.recordSessionActivity(sessionId, latestMessageCreatedAt)
        } else {
            options.store.sessions.touchSessionUpdatedAt(sessionId, latestMessageCreatedAt, options.namespace)
        }
        if (!created) {
            emitImportedMessageEvents(engine, sessionId, appendedMessages)
        }

        const output = [
            `Codex thread: ${transcript.id}`,
            `Hapi session: ${sessionId}`,
            `Action: ${created ? 'created' : 'updated'}`,
            `Appended messages: ${appendedMessages.length}`
        ].join('\n')

        appendScriptLog(
            getDirectImportRouteContext().workspace,
            'sync',
            `SUCCESS: codexSessionId=${transcript.id}; hapiSessionId=${sessionId}; created=${created}; appended=${appendedMessages.length}`
        )

        return {
            success: true,
            message: created ? 'Codex session imported into a new Hapi session' : 'Codex session appended to existing Hapi session',
            pid: 0,
            command: DIRECT_IMPORT_COMMAND,
            hapiSessionId: sessionId,
            cwd: getDirectImportRouteContext().workspace,
            output,
            sessionIds: [transcript.id],
            syncedCount: 1
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            ...createImportErrorResponse([transcript.id], message),
            output: `Codex thread: ${transcript.id}\n${message}`
        }
    }
}

export async function importSelectedCodexSessions(options: {
    codexSessionIds: string[]
    store: Store
    namespace: string
    getSyncEngine?: () => SyncEngine | null
}): Promise<ScriptLaunchResponse> {
    const codexSessionIds = options.codexSessionIds
    if (codexSessionIds.length === 0) {
        return createImportErrorResponse(codexSessionIds, NO_SYNC_SESSION_SELECTED_ERROR)
    }

    const localSessionsById = new Map(listLocalCodexSessions().map((session) => [session.id, session]))
    const results: ScriptLaunchResponse[] = []
    for (const codexSessionId of codexSessionIds) {
        const summary = localSessionsById.get(codexSessionId)
        if (!summary) {
            const result = {
                ...createImportErrorResponse([codexSessionId], `Transcript not found for Codex session: ${codexSessionId}`),
                output: `未找到对应的本地 transcript：${codexSessionId}`
            }
            results.push(result)
            continue
        }

        const transcript = parseCodexTranscriptImportData(summary)
        if (!transcript) {
            const result = {
                ...createImportErrorResponse([codexSessionId], `Failed to parse Codex transcript: ${summary.file}`),
                output: `解析 transcript 失败：${summary.file}`
            }
            results.push(result)
            continue
        }

        const result = importCodexTranscriptData({
            transcript,
            store: options.store,
            namespace: options.namespace,
            getSyncEngine: options.getSyncEngine
        })
        results.push(result)

        if (!result.success) {
            return {
                ...result,
                sessionIds: codexSessionIds,
                syncedCount: Math.max(0, results.length - 1),
                output: combineSyncOutputs(results) ?? result.output
            }
        }
    }

    return createImportSuccessResponse(codexSessionIds, results)
}

export async function importCodexTranscriptsFromRemoteMachine(options: {
    transcripts: CodexTranscriptImportData[]
    store: Store
    namespace: string
    getSyncEngine?: () => SyncEngine | null
}): Promise<ScriptLaunchResponse> {
    if (options.transcripts.length === 0) {
        return createImportErrorResponse([], NO_SYNC_SESSION_SELECTED_ERROR)
    }

    const results: ScriptLaunchResponse[] = []
    for (const transcript of options.transcripts) {
        const result = importCodexTranscriptData({
            transcript,
            store: options.store,
            namespace: options.namespace,
            getSyncEngine: options.getSyncEngine
        })
        results.push(result)
        if (!result.success) {
            return {
                ...result,
                sessionIds: options.transcripts.map((item) => item.id),
                syncedCount: Math.max(0, results.length - 1),
                output: combineSyncOutputs(results) ?? result.output
            }
        }
    }

    return createImportSuccessResponse(options.transcripts.map((item) => item.id), results)
}

export async function importCodexSessionsFromMachine(options: {
    machineId: string
    codexSessionIds: string[]
    store: Store
    namespace: string
    getSyncEngine?: () => SyncEngine | null
}): Promise<ScriptLaunchResponse> {
    if (options.codexSessionIds.length === 0) {
        return createImportErrorResponse([], NO_SYNC_SESSION_SELECTED_ERROR)
    }

    const engine = options.getSyncEngine?.() ?? null
    if (!engine) {
        return createImportErrorResponse(options.codexSessionIds, 'Not connected')
    }

    const uniqueSessionIds = Array.from(new Set(options.codexSessionIds.map((value) => value.trim()).filter(Boolean)))
    const machine = engine.getMachine(options.machineId)
    const canUseLocalFallback = canFallbackToLocalCodexMachine(machine)
    const transcripts: CodexTranscriptImportData[] = []
    for (const sessionId of uniqueSessionIds) {
        try {
            const result = await engine.getCodexTranscriptImportDataForMachine(options.machineId, sessionId)
            if (!result.success) {
                return {
                    ...createImportErrorResponse(uniqueSessionIds, result.error),
                    output: result.error
                }
            }
            transcripts.push(result.transcript)
        } catch (error) {
            if (!canUseLocalFallback || !isRpcHandlerNotRegisteredForMethod(error, 'getCodexTranscriptImportData')) {
                const reason = error instanceof Error ? error.message : 'Failed to fetch Codex transcript import data'
                return {
                    ...createImportErrorResponse(uniqueSessionIds, reason),
                    output: reason
                }
            }
            const localTranscript = getDiscoveredLocalCodexTranscriptImportData(sessionId)
            if (!localTranscript) {
                const reason = `Transcript not found for Codex session: ${sessionId}`
                return {
                    ...createImportErrorResponse(uniqueSessionIds, reason),
                    output: reason
                }
            }
            transcripts.push(localTranscript)
        }
    }

    return await importCodexTranscriptsFromRemoteMachine({
        transcripts,
        store: options.store,
        namespace: options.namespace,
        getSyncEngine: options.getSyncEngine
    })
}

export function createCodexDesktopRoutes(options: {
    store: Store
    getSyncEngine: () => SyncEngine | null
}): Hono<WebAppEnv> {
    const app = new HonoRuntime<WebAppEnv>()

    app.get('/codex/status', (c) => {
        const codexStatus = getCodexDesktopStatus()
        return c.json({
            success: true,
            codexDesktopRunning: codexStatus.running,
            codexClientAvailable: codexStatus.clientAvailable,
            codexTranscriptImportAvailable: true
        } satisfies CodexDesktopStatusResponse)
    })

    app.get('/codex/sessions', (c) => {
        return c.json({
            success: true,
            sessions: listLocalCodexSessions()
        } satisfies CodexLocalSessionsResponse)
    })

    app.post('/codex/sync-session', async (c) => {
        const codexStatus = getCodexDesktopStatus()
        const body = await c.req.json().catch(() => null)
        const parsed = parseSyncSessionRequest(body)
        if (parsed.error) {
            const { workspace } = getDirectImportRouteContext()
            appendScriptLog(workspace, 'sync', `FAILED: ${parsed.error}`)
            return c.json({
                success: false,
                error: parsed.error,
                cwd: workspace,
                codexDesktopRunning: codexStatus.running,
                codexClientAvailable: codexStatus.clientAvailable
            })
        }

        // 中文注释：这里直接读取本地 transcript 写入 Hapi store，不再启动隐藏 codex resume 进程，避免漏导入客户端新增内容。
        const result = await importSelectedCodexSessions({
            codexSessionIds: parsed.sessionIds,
            store: options.store,
            namespace: c.get('namespace'),
            getSyncEngine: options.getSyncEngine
        })
        return c.json({
            ...result,
            codexDesktopRunning: codexStatus.running,
            codexClientAvailable: codexStatus.clientAvailable
        })
    })

    app.post('/codex/sync-session-from-machine', async (c) => {
        const codexStatus = getCodexDesktopStatus()
        const body = await c.req.json().catch(() => null)
        const machineId = typeof body?.machineId === 'string' ? body.machineId.trim() : ''
        const parsed = parseSyncSessionRequest(body)
        if (!machineId) {
            return c.json({
                success: false,
                error: 'machineId is required',
                codexDesktopRunning: codexStatus.running,
                codexClientAvailable: codexStatus.clientAvailable
            })
        }
        if (parsed.error) {
            const { workspace } = getDirectImportRouteContext()
            appendScriptLog(workspace, 'sync', `FAILED: ${parsed.error}`)
            return c.json({
                success: false,
                error: parsed.error,
                cwd: workspace,
                codexDesktopRunning: codexStatus.running,
                codexClientAvailable: codexStatus.clientAvailable
            })
        }

        const result = await importCodexSessionsFromMachine({
            machineId,
            codexSessionIds: parsed.sessionIds,
            store: options.store,
            namespace: c.get('namespace'),
            getSyncEngine: options.getSyncEngine
        })
        return c.json({
            ...result,
            codexDesktopRunning: codexStatus.running,
            codexClientAvailable: codexStatus.clientAvailable
        })
    })

    app.post('/codex/duplicate-sessions', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = parseSyncSessionRequest(body)
        if (parsed.error) {
            return c.json({
                success: false,
                error: parsed.error
            } satisfies CodexDuplicateSessionsResponse)
        }

        if (parsed.sessionIds.length === 0) {
            return c.json({
                success: false,
                error: NO_SYNC_SESSION_SELECTED_ERROR
            } satisfies CodexDuplicateSessionsResponse)
        }

        // 中文注释：这里只检查本次导入弹窗里勾选过的 codexSessionId；未选中的会话即使也有重复，也不参与本轮提示。
        const duplicates = listDuplicateCodexSessionGroups(
            options.store,
            c.get('namespace'),
            parsed.sessionIds,
            options.getSyncEngine
        ).map((group) => ({
            codexSessionId: group.codexSessionId,
            hapiSessionIds: group.sessions.map((session) => session.sessionId)
        }))

        return c.json({
            success: true,
            duplicates
        } satisfies CodexDuplicateSessionsResponse)
    })

    app.post('/codex/merge-duplicate-sessions', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = parseSyncSessionRequest(body)
        if (parsed.error) {
            return c.json({
                success: false,
                error: parsed.error
            } satisfies CodexMergeDuplicateSessionsResponse)
        }

        if (parsed.sessionIds.length === 0) {
            return c.json({
                success: false,
                error: NO_SYNC_SESSION_SELECTED_ERROR
            } satisfies CodexMergeDuplicateSessionsResponse)
        }

        const { workspace } = getDirectImportRouteContext()
        try {
            // 中文注释：真正执行合并时仍然只按这次选中的 codexSessionId 收口，防止顺手把别的会话历史也改掉。
            const result = await mergeDuplicateCodexSessionGroups({
                store: options.store,
                namespace: c.get('namespace'),
                codexSessionIds: parsed.sessionIds,
                getSyncEngine: options.getSyncEngine
            })
            appendScriptLog(
                workspace,
                'sync',
                `SUCCESS: merged duplicate Hapi sessions for selected codexSessionIds=${parsed.sessionIds.join(',')}`
            )
            return c.json(result satisfies CodexMergeDuplicateSessionsResponse)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            appendScriptLog(
                workspace,
                'sync',
                `FAILED: duplicate-session merge error=${message}; selectedCodexSessionIds=${parsed.sessionIds.join(',')}`
            )
            return c.json({
                success: false,
                error: message
            } satisfies CodexMergeDuplicateSessionsResponse)
        }
    })

    app.post('/codex/restart-desktop', async (c) => {
        const codexStatus = getCodexDesktopStatus()
        if (!codexStatus.clientAvailable) {
            const scriptPath = getRestartScriptPath()
            const workspace = getWorkspace(scriptPath)
            const error = CODEX_DESKTOP_NOT_FOUND_ERROR
            appendScriptLog(workspace, 'restart', `FAILED: ${error}; script=${scriptPath}`)
            return c.json({
                success: false,
                error,
                script: scriptPath,
                cwd: workspace,
                codexDesktopRunning: codexStatus.running,
                codexClientAvailable: codexStatus.clientAvailable
            })
        }

        const result = await launchRestartScript()
        return c.json({
            ...result,
            codexDesktopRunning: codexStatus.running,
            codexClientAvailable: codexStatus.clientAvailable
        })
    })

    return app
}
