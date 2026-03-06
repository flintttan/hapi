import { describe, it, expect } from 'vitest';
import {
    parseCursorEvent,
    convertCursorEventToAgentMessage,
    type CursorStreamEvent
} from './cursorEventConverter';

describe('cursorEventConverter', () => {
    describe('parseCursorEvent', () => {
        it('parses system init event', () => {
            const line =
                '{"type":"system","subtype":"init","apiKeySource":"login","cwd":"D:\\\\projects\\\\hapi","session_id":"cec26d70-d2d5-48ac-a88b-9e820eb201cf","timestamp_ms":1772422778942}';
            const event = parseCursorEvent(line);
            expect(event).not.toBeNull();
            expect(event?.type).toBe('system');
            if (event && event.type === 'system') {
                expect(event.subtype).toBe('init');
                expect(event.session_id).toBe('cec26d70-d2d5-48ac-a88b-9e820eb201cf');
            }
        });

        it('parses assistant event', () => {
            const line =
                '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"\\n你好。"}]},"session_id":"cec26d70-d2d5-48ac-a88b-9e820eb201cf"}';
            const event = parseCursorEvent(line);
            expect(event).not.toBeNull();
            expect(event?.type).toBe('assistant');
        });

        it('parses result event', () => {
            const line =
                '{"type":"result","subtype":"success","duration_ms":12456,"is_error":false,"result":"\\n你好。","session_id":"cec26d70-d2d5-48ac-a88b-9e820eb201cf"}';
            const event = parseCursorEvent(line);
            expect(event).not.toBeNull();
            expect(event?.type).toBe('result');
        });

        it('returns null for non-JSON lines', () => {
            expect(parseCursorEvent('')).toBeNull();
            expect(parseCursorEvent('   ')).toBeNull();
            expect(parseCursorEvent('正在写入 Web 请求')).toBeNull();
        });
    });

    describe('convertCursorEventToAgentMessage', () => {
        it('converts assistant to text message', () => {
            const event = {
                type: 'assistant',
                message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
                session_id: 's1'
            } as CursorStreamEvent;
            const msg = convertCursorEventToAgentMessage(event);
            expect(msg).toEqual({ type: 'text', text: 'Hello' });
        });

        it('converts result to turn_complete', () => {
            const event = { type: 'result', subtype: 'success', session_id: 's1' } as CursorStreamEvent;
            const msg = convertCursorEventToAgentMessage(event);
            expect(msg).toEqual({ type: 'turn_complete', stopReason: 'success' });
        });
    });
});
