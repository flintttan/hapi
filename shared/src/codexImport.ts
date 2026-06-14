import { AGENT_MESSAGE_PAYLOAD_TYPE } from '@hapi/protocol'

export type CodexLocalSessionSummary = {
    id: string
    title: string
    lastUserMessage?: string | null
    cwd?: string | null
    file: string
    modifiedAt: number
    originator?: string | null
    cliVersion?: string | null
}

export type CodexImportedMessageContent = {
    role: 'user'
    content: {
        type: 'text'
        text: string
    }
    meta: {
        sentFrom: 'cli'
    }
} | {
    role: 'agent'
    content: {
        type: typeof AGENT_MESSAGE_PAYLOAD_TYPE
        data: unknown
    }
    meta: {
        sentFrom: 'cli'
    }
}

export type CodexTranscriptImportData = CodexLocalSessionSummary & {
    messages: CodexImportedMessageContent[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function createId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `codex-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getDirname(pathValue: string): string {
    const normalized = pathValue.replace(/[\\/]+$/, '')
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
    return index > 0 ? normalized.slice(0, index) : '.'
}

function getHostName(): string {
    const processValue = globalThis.process as { env?: Record<string, string | undefined> } | undefined
    return processValue?.env?.HAPI_HOSTNAME ?? processValue?.env?.HOSTNAME ?? 'localhost'
}

function getPlatformName(): string {
    const processValue = globalThis.process as { platform?: string } | undefined
    return processValue?.platform ?? 'unknown'
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
            return message ? buildImportedAgentMessage({ type: 'message', message, id: createId() }) : null
        }

        if (eventType === 'agent_reasoning') {
            const message = asString(payload.text) ?? asString(payload.message)
            return message ? buildImportedAgentMessage({ type: 'reasoning', message, id: createId() }) : null
        }

        if (eventType === 'agent_reasoning_delta') {
            const delta = asString(payload.delta) ?? asString(payload.text) ?? asString(payload.message)
            return delta ? buildImportedAgentMessage({ type: 'reasoning-delta', delta }) : null
        }

        if (eventType === 'token_count') {
            const info = asRecord(payload.info)
            return info ? buildImportedAgentMessage({ type: 'token_count', info, id: createId() }) : null
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
                return buildImportedAgentMessage({ type: 'message', message: text, id: createId() })
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
                id: createId()
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
                id: createId()
            })
        }
    }

    return null
}

export function parseCodexLocalSessionContent(
    filePath: string,
    content: string,
    options?: { modifiedAt?: number }
): CodexLocalSessionSummary | null {
    const allLines = content.split(/\r?\n/).filter(Boolean)
    const headLines = allLines.slice(0, 200)
    let sessionId: string | null = null
    let cwd: string | null = null
    let originator: string | null = null
    let cliVersion: string | null = null
    let firstUserMessage: string | null = null

    for (const line of headLines) {
        let parsed: unknown
        try {
            parsed = JSON.parse(line)
        } catch {
            continue
        }

        const record = asRecord(parsed)
        const type = typeof record?.type === 'string' ? record.type : null
        if (type === 'session_meta') {
            const payload = asRecord(record?.payload)
            if (payload) {
                if (isSubagentSource(payload.source)) {
                    return null
                }
                if (!sessionId && typeof payload.id === 'string') {
                    sessionId = payload.id
                }
                if (!cwd && typeof payload.cwd === 'string') {
                    cwd = payload.cwd
                }
                if (!originator && typeof payload.originator === 'string') {
                    originator = payload.originator
                }
                if (!cliVersion && typeof payload.cli_version === 'string') {
                    cliVersion = payload.cli_version
                }
            }
        }

        if (!firstUserMessage && type === 'response_item') {
            const payload = asRecord(record?.payload)
            if (payload?.type === 'message' && payload.role === 'user') {
                const text = extractCodexText(payload.content)
                if (text && !shouldIgnoreSyntheticUserMessage(text)) {
                    firstUserMessage = text
                }
            }
        }
    }

    const changedTitle = getLatestCodexChangedTitle(allLines)
    const lastUserMessage = getLatestCodexUserMessage(allLines)

    sessionId = sessionId ?? inferSessionIdFromFileName(filePath)
    if (!sessionId) return null

    const modifiedAt = typeof options?.modifiedAt === 'number' && Number.isFinite(options.modifiedAt)
        ? options.modifiedAt
        : Date.now()

    return {
        id: sessionId,
        title: getCodexSessionTitle(cwd, sessionId, changedTitle, firstUserMessage),
        lastUserMessage,
        cwd,
        file: filePath,
        modifiedAt,
        originator,
        cliVersion
    }
}

export function parseCodexTranscriptImportData(
    summary: CodexLocalSessionSummary,
    content: string
): CodexTranscriptImportData | null {
    const lines = content.split(/\r?\n/).filter(Boolean)
    const messages: CodexImportedMessageContent[] = []

    for (const line of lines) {
        let parsed: unknown
        try {
            parsed = JSON.parse(line)
        } catch {
            continue
        }

        const record = asRecord(parsed)
        if (!record) continue
        const message = convertCodexRecordToImportedMessage(record)
        if (message) {
            messages.push(message)
        }
    }

    return {
        ...summary,
        messages
    }
}

export function buildImportedSessionMetadata(
    data: CodexTranscriptImportData,
    existingMetadata?: Record<string, unknown> | null
): Record<string, unknown> {
    const now = Date.now()
    const path = data.cwd ?? (typeof existingMetadata?.path === 'string' ? existingMetadata.path : getDirname(data.file))
    const host = typeof existingMetadata?.host === 'string' ? existingMetadata.host : getHostName()
    const osValue = typeof existingMetadata?.os === 'string' ? existingMetadata.os : getPlatformName()
    const summaryText = data.lastUserMessage ?? data.title

    return {
        ...(existingMetadata ?? {}),
        path,
        host,
        os: osValue,
        name: data.title,
        summary: summaryText
            ? {
                text: summaryText,
                updatedAt: now
            }
            : existingMetadata?.summary,
        flavor: 'codex',
        codexSessionId: data.id,
        lifecycleState: typeof existingMetadata?.lifecycleState === 'string'
            ? existingMetadata.lifecycleState
            : 'imported',
        lifecycleStateSince: typeof existingMetadata?.lifecycleStateSince === 'number'
            ? existingMetadata.lifecycleStateSince
            : now
    }
}
