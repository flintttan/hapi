export const TABULAR_PREVIEW_ROW_LIMIT = 200
export const TABULAR_PREVIEW_COLUMN_LIMIT = 50

export type TabularPreview = {
    rows: string[][]
    delimiter: ',' | '\t'
    truncatedRows: boolean
    truncatedColumns: boolean
    previewedRowCount: number
    previewedColumnCount: number
}

export type TabularRowPreview = {
    cells: string[]
    truncatedColumns: boolean
    previewedColumnCount: number
}

export type TabularDiffRowKind = 'add' | 'remove' | 'context'

export type TabularDiffRowPreview = {
    kind: TabularDiffRowKind
    cells: string[]
}

export type TabularDiffPreview = {
    rows: TabularDiffRowPreview[]
    delimiter: ',' | '\t'
    truncatedRows: boolean
    truncatedColumns: boolean
    previewedRowCount: number
    previewedColumnCount: number
}

type ParseOptions = {
    delimiter: ',' | '\t'
    rowLimit?: number
    columnLimit?: number
}

export function getTabularFileDelimiter(path: string): ',' | '\t' | null {
    const extension = path.split('.').pop()?.toLowerCase()
    if (extension === 'csv') return ','
    if (extension === 'tsv') return '\t'
    return null
}

export function parseTabularRow(
    content: string,
    options: Pick<ParseOptions, 'delimiter' | 'columnLimit'>
): TabularRowPreview {
    const columnLimit = Math.max(1, options.columnLimit ?? TABULAR_PREVIEW_COLUMN_LIMIT)
    const cells: string[] = []
    let currentField = ''
    let currentColumnCount = 0
    let inQuotes = false
    let truncatedColumns = false

    const pushField = () => {
        currentColumnCount += 1
        if (currentColumnCount <= columnLimit) {
            cells.push(currentField)
        } else {
            truncatedColumns = true
        }
        currentField = ''
    }

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index]

        if (char === '"') {
            if (inQuotes) {
                if (content[index + 1] === '"') {
                    currentField += '"'
                    index += 1
                } else {
                    inQuotes = false
                }
            } else if (currentField === '') {
                inQuotes = true
            } else {
                currentField += char
            }
            continue
        }

        if (!inQuotes && char === options.delimiter) {
            pushField()
            continue
        }

        currentField += char
    }

    pushField()

    return {
        cells,
        truncatedColumns,
        previewedColumnCount: Math.min(currentColumnCount, columnLimit),
    }
}

export function parseTabularDiffPreview(
    diffContent: string,
    options: ParseOptions
): TabularDiffPreview {
    const rowLimit = Math.max(1, options.rowLimit ?? TABULAR_PREVIEW_ROW_LIMIT)
    const columnLimit = Math.max(1, options.columnLimit ?? TABULAR_PREVIEW_COLUMN_LIMIT)
    const rows: TabularDiffRowPreview[] = []
    let maxColumnCount = 0
    let truncatedRows = false
    let truncatedColumns = false

    const diffLines = diffContent.split('\n')
    for (const rawLine of diffLines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (!line) continue

        const firstChar = line[0]
        const isAddLine = firstChar === '+' && !line.startsWith('+++ ')
        const isRemoveLine = firstChar === '-' && !line.startsWith('--- ')
        const isContextLine = firstChar === ' '
        if (!isAddLine && !isRemoveLine && !isContextLine) continue

        if (rows.length >= rowLimit) {
            truncatedRows = true
            break
        }

        const kind: TabularDiffRowKind = isAddLine ? 'add' : isRemoveLine ? 'remove' : 'context'

        const rowParse = parseTabularRow(line.slice(1), { delimiter: options.delimiter, columnLimit })
        rows.push({ kind, cells: rowParse.cells })
        maxColumnCount = Math.max(maxColumnCount, rowParse.previewedColumnCount)
        if (rowParse.truncatedColumns) {
            truncatedColumns = true
        }
    }

    return {
        rows,
        delimiter: options.delimiter,
        truncatedRows,
        truncatedColumns,
        previewedRowCount: rows.length,
        previewedColumnCount: maxColumnCount,
    }
}

export function parseTabularPreview(
    content: string,
    options: ParseOptions
): TabularPreview {
    const rowLimit = Math.max(1, options.rowLimit ?? TABULAR_PREVIEW_ROW_LIMIT)
    const columnLimit = Math.max(1, options.columnLimit ?? TABULAR_PREVIEW_COLUMN_LIMIT)
    const rows: string[][] = []
    let currentRow: string[] = []
    let currentField = ''
    let currentColumnCount = 0
    let inQuotes = false
    let truncatedRows = false
    let truncatedColumns = false
    let maxColumnCount = 0

    const pushField = () => {
        currentColumnCount += 1
        if (currentColumnCount <= columnLimit) {
            currentRow.push(currentField)
        } else {
            truncatedColumns = true
        }
        currentField = ''
    }

    const finishRow = (): boolean => {
        if (currentColumnCount === 0 && currentField === '' && currentRow.length === 0) {
            return false
        }

        pushField()
        maxColumnCount = Math.max(maxColumnCount, Math.min(currentColumnCount, columnLimit))

        if (rows.length < rowLimit) {
            rows.push(currentRow)
        } else {
            truncatedRows = true
            currentRow = []
            currentColumnCount = 0
            return true
        }

        currentRow = []
        currentColumnCount = 0
        return false
    }

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index]

        if (char === '"') {
            if (inQuotes) {
                if (content[index + 1] === '"') {
                    currentField += '"'
                    index += 1
                } else {
                    inQuotes = false
                }
            } else if (currentField === '') {
                inQuotes = true
            } else {
                currentField += char
            }
            continue
        }

        if (!inQuotes && char === options.delimiter) {
            pushField()
            continue
        }

        if (!inQuotes && (char === '\n' || char === '\r')) {
            const shouldStop = finishRow()
            if (char === '\r' && content[index + 1] === '\n') {
                index += 1
            }
            if (shouldStop) {
                break
            }
            continue
        }

        currentField += char
    }

    if (!truncatedRows) {
        finishRow()
    }

    return {
        rows,
        delimiter: options.delimiter,
        truncatedRows,
        truncatedColumns,
        previewedRowCount: rows.length,
        previewedColumnCount: maxColumnCount,
    }
}
