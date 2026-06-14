import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import {
    parseCodexLocalSessionContent,
    parseCodexTranscriptImportData,
    type CodexLocalSessionSummary,
    type CodexTranscriptImportData
} from '@hapi/protocol/codexImport'
import { logger } from '@/ui/logger'

const DEFAULT_SCAN_LIMIT = 2_000
const SUMMARY_READ_WINDOW_BYTES = 64 * 1024

function resolveLocalPath(pathValue: string): string {
    return isAbsolute(pathValue) ? pathValue : resolve(process.cwd(), pathValue)
}

function expandHomePath(pathValue: string): string {
    return pathValue.replace(/^~(?=$|[\\/])/, getUserHomeDir())
}

function getUserHomeDir(): string {
    const configured = process.env.HOME?.trim()
    if (!configured) return homedir()
    return configured.replace(/^~(?=$|[\\/])/, homedir())
}

function getCodexHomeCandidates(): string[] {
    const configuredImportHome = process.env.HAPI_CODEX_HOME?.trim()
    const configuredRuntimeHome = process.env.CODEX_HOME?.trim()
    const homeCodexDir = join(getUserHomeDir(), '.codex')
    return [
        configuredImportHome ? resolveLocalPath(expandHomePath(configuredImportHome)) : null,
        configuredRuntimeHome ? resolveLocalPath(expandHomePath(configuredRuntimeHome)) : null,
        homeCodexDir
    ].filter((value): value is string => Boolean(value))
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
            if (hasAnyJsonlFile(fullPath)) return true
            continue
        }
        if (entry.isFile() && fullPath.toLowerCase().endsWith('.jsonl')) {
            return true
        }
    }
    return false
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

function getCodexSessionRoots(): string[] {
    const candidateHomes = getCodexHomeCandidates()
    const candidateRoots = candidateHomes.map((home) => join(home, 'sessions'))
    for (const root of candidateRoots) {
        if (hasAnyJsonlFile(root)) {
            return [root]
        }
    }
    return candidateRoots.filter((root) => existsSync(root))
}

export function listLocalCodexSessions(limit = DEFAULT_SCAN_LIMIT): CodexLocalSessionSummary[] {
    const files: string[] = []
    for (const root of getCodexSessionRoots()) {
        collectJsonlFiles(root, files)
    }

    const deduped = new Map<string, CodexLocalSessionSummary>()
    for (const filePath of files) {
        let modifiedAt = Date.now()
        try {
            modifiedAt = statSync(filePath).mtimeMs
        } catch {
            logger.debug(`[codex-local-sessions] Failed to stat transcript ${filePath}`)
        }
        const content = readTranscriptSummaryContent(filePath)
        if (!content) continue
        const session = parseCodexLocalSessionContent(filePath, content, { modifiedAt })
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

export function getLocalCodexTranscriptImportData(sessionId: string): CodexTranscriptImportData | null {
    const sessions = listLocalCodexSessions()
    const summary = sessions.find((session) => session.id === sessionId)
    if (!summary) return null
    let content: string
    try {
        content = readFileSync(summary.file, 'utf-8')
    } catch {
        return null
    }
    return parseCodexTranscriptImportData(summary, content)
}

function readTranscriptSummaryContent(filePath: string): string | null {
    let stats
    try {
        stats = statSync(filePath)
    } catch {
        logger.debug(`[codex-local-sessions] Failed to stat transcript for summary ${filePath}`)
        return null
    }

    if (stats.size <= SUMMARY_READ_WINDOW_BYTES * 2) {
        try {
            return readFileSync(filePath, 'utf-8')
        } catch {
            logger.debug(`[codex-local-sessions] Failed to read transcript ${filePath}`)
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
        logger.debug(`[codex-local-sessions] Failed to read transcript summary ${filePath}`)
        return null
    } finally {
        if (fd !== null) {
            try {
                closeSync(fd)
            } catch {
                logger.debug(`[codex-local-sessions] Failed to close transcript ${filePath}`)
            }
        }
    }
}
