import { describe, expect, it } from 'vitest';
import { isInternalEventJson } from './internalEventFilter';

describe('isInternalEventJson', () => {
    it('returns false for non-JSON text', () => {
        expect(isInternalEventJson('Hello world')).toBe(false);
    });

    it('returns false for JSON without a type field', () => {
        expect(isInternalEventJson('{"foo":"bar"}')).toBe(false);
    });

    it('returns true for the leaked session metadata envelope', () => {
        const json = JSON.stringify({
            type: 'output',
            data: {
                parentUuid: 'abc-123',
                isSidechain: false,
                userType: 'external',
                cwd: '/home/user/project',
                sessionId: 'session-456',
                version: '0.0.0',
                uuid: 'def-789',
                timestamp: '2026-04-05T00:00:00Z',
            },
        });
        expect(isInternalEventJson(json)).toBe(true);
    });

    it('returns true for minimal metadata envelope shape', () => {
        const json = JSON.stringify({
            type: 'output',
            data: {
                parentUuid: 'abc',
                sessionId: '123',
                userType: 'external',
            },
        });
        expect(isInternalEventJson(json)).toBe(true);
    });

    it('returns true for root metadata envelope with parentUuid: null', () => {
        const json = JSON.stringify({
            type: 'output',
            data: {
                parentUuid: null,
                sessionId: '123',
                userType: 'external',
            },
        });
        expect(isInternalEventJson(json)).toBe(true);
    });

    it('returns false for output with non-metadata data', () => {
        // Legitimate output that happens to have type "output" but different data shape
        const json = JSON.stringify({
            type: 'output',
            data: { text: 'some result' },
        });
        expect(isInternalEventJson(json)).toBe(false);
    });

    it('returns false for { type: "event" } — not the leaked shape', () => {
        const json = JSON.stringify({ type: 'event', data: { type: 'ready' } });
        expect(isInternalEventJson(json)).toBe(false);
    });

    it('returns false for { type: "queue-operation" } — not the leaked shape', () => {
        const json = JSON.stringify({ type: 'queue-operation', op: 'enqueue' });
        expect(isInternalEventJson(json)).toBe(false);
    });

    it('returns false for other JSON types (assistant, user)', () => {
        expect(isInternalEventJson('{"type":"assistant"}')).toBe(false);
        expect(isInternalEventJson('{"type":"user"}')).toBe(false);
    });

    it('returns false for invalid JSON starting with {', () => {
        expect(isInternalEventJson('{not valid json')).toBe(false);
    });

    it('returns false when output data is not an object', () => {
        const json = JSON.stringify({ type: 'output', data: 'string-data' });
        expect(isInternalEventJson(json)).toBe(false);
    });
});
