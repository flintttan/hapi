import { describe, expect, it } from 'vitest'
import { getTabularFileDelimiter, parseTabularDiffPreview, parseTabularPreview, parseTabularRow } from './tabularPreview'

describe('getTabularFileDelimiter', () => {
    it('detects csv and tsv extensions case-insensitively', () => {
        expect(getTabularFileDelimiter('report.csv')).toBe(',')
        expect(getTabularFileDelimiter('report.TSV')).toBe('\t')
        expect(getTabularFileDelimiter('report.txt')).toBeNull()
    })
})

describe('parseTabularPreview', () => {
    it('parses comma-delimited rows', () => {
        const preview = parseTabularPreview('name,age\nAda,30', { delimiter: ',' })

        expect(preview.rows).toEqual([
            ['name', 'age'],
            ['Ada', '30'],
        ])
    })

    it('parses tab-delimited rows', () => {
        const preview = parseTabularPreview('name\trole\nAda\tEngineer', { delimiter: '\t' })

        expect(preview.rows).toEqual([
            ['name', 'role'],
            ['Ada', 'Engineer'],
        ])
    })

    it('keeps delimiters inside quoted cells', () => {
        const preview = parseTabularPreview('name,notes\nAda,"likes, commas"', { delimiter: ',' })

        expect(preview.rows).toEqual([
            ['name', 'notes'],
            ['Ada', 'likes, commas'],
        ])
    })

    it('keeps newlines inside quoted cells', () => {
        const preview = parseTabularPreview('name,notes\nAda,"line 1\nline 2"', { delimiter: ',' })

        expect(preview.rows).toEqual([
            ['name', 'notes'],
            ['Ada', 'line 1\nline 2'],
        ])
    })

    it('unescapes doubled quotes inside quoted cells', () => {
        const preview = parseTabularPreview('name,quote\nAda,"He said ""hi"""', { delimiter: ',' })

        expect(preview.rows).toEqual([
            ['name', 'quote'],
            ['Ada', 'He said "hi"'],
        ])
    })

    it('marks row and column truncation when preview limits are exceeded', () => {
        const preview = parseTabularPreview('a,b,c\n1,2,3\n4,5,6', {
            delimiter: ',',
            rowLimit: 2,
            columnLimit: 2,
        })

        expect(preview.rows).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ])
        expect(preview.truncatedRows).toBe(true)
        expect(preview.truncatedColumns).toBe(true)
        expect(preview.previewedRowCount).toBe(2)
        expect(preview.previewedColumnCount).toBe(2)
    })
})

describe('parseTabularRow', () => {
    it('parses a single row with quoted fields', () => {
        const row = parseTabularRow('Ada,"likes, commas"', { delimiter: ',' })
        expect(row.cells).toEqual(['Ada', 'likes, commas'])
        expect(row.truncatedColumns).toBe(false)
    })
})

describe('parseTabularDiffPreview', () => {
    it('parses added, removed, and context lines and ignores diff metadata', () => {
        const diff = [
            'diff --git a/report.csv b/report.csv',
            'index 111..222 100644',
            '--- a/report.csv',
            '+++ b/report.csv',
            '@@ -1,2 +1,2 @@',
            ' name,age',
            '-Ada,29',
            '+Ada,30',
            '',
        ].join('\n')

        const preview = parseTabularDiffPreview(diff, { delimiter: ',' })

        expect(preview.rows).toEqual([
            { kind: 'context', cells: ['name', 'age'] },
            { kind: 'remove', cells: ['Ada', '29'] },
            { kind: 'add', cells: ['Ada', '30'] },
        ])
        expect(preview.truncatedRows).toBe(false)
        expect(preview.truncatedColumns).toBe(false)
        expect(preview.previewedRowCount).toBe(3)
        expect(preview.previewedColumnCount).toBe(2)
    })

    it('strips CRLF line endings from diff rows', () => {
        const diff = [' name,age\r', '+Ada,30\r'].join('\n')
        const preview = parseTabularDiffPreview(diff, { delimiter: ',' })

        expect(preview.rows).toEqual([
            { kind: 'context', cells: ['name', 'age'] },
            { kind: 'add', cells: ['Ada', '30'] },
        ])
    })

    it('does not treat file content starting with +++/--- as diff headers', () => {
        const diff = ['+++foo,bar', '---baz,qux'].join('\n')
        const preview = parseTabularDiffPreview(diff, { delimiter: ',' })

        expect(preview.rows).toEqual([
            { kind: 'add', cells: ['++foo', 'bar'] },
            { kind: 'remove', cells: ['--baz', 'qux'] },
        ])
    })
})
