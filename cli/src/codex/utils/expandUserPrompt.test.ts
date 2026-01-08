import { describe, expect, test } from 'vitest';
import { expandCodexUserPrompt } from './expandUserPrompt';

describe('expandCodexUserPrompt', () => {
    test('returns original text when not a slash command', () => {
        const templates = new Map<string, string>([['foo', 'TEMPLATE']]);
        const result = expandCodexUserPrompt('hello world', templates);
        expect(result).toEqual({ expandedText: 'hello world', matchedCommand: null });
    });

    test('expands matching template for exact command', () => {
        const templates = new Map<string, string>([['foo', 'TEMPLATE']]);
        const result = expandCodexUserPrompt('/foo', templates);
        expect(result).toEqual({ expandedText: 'TEMPLATE', matchedCommand: 'foo' });
    });

    test('expands matching template and appends args', () => {
        const templates = new Map<string, string>([['foo', 'TEMPLATE']]);
        const result = expandCodexUserPrompt('/foo   arg1 arg2', templates);
        expect(result).toEqual({ expandedText: 'TEMPLATE\n\narg1 arg2', matchedCommand: 'foo' });
    });

    test('ignores unmatched command', () => {
        const templates = new Map<string, string>([['foo', 'TEMPLATE']]);
        const result = expandCodexUserPrompt('/bar', templates);
        expect(result).toEqual({ expandedText: '/bar', matchedCommand: null });
    });

    test('does not expand when slash command is not at start', () => {
        const templates = new Map<string, string>([['foo', 'TEMPLATE']]);
        const result = expandCodexUserPrompt('please /foo', templates);
        expect(result).toEqual({ expandedText: 'please /foo', matchedCommand: null });
    });
});

