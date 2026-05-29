type WrappedRecord = Record<string, unknown>;

type WrappedNotification = {
    method: string;
    params: WrappedRecord;
};

function asRecord(value: unknown): WrappedRecord | null {
    return value && typeof value === 'object' ? value as WrappedRecord : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scopeFrom(value: WrappedRecord): WrappedRecord {
    const thread = asRecord(value.thread);
    const turn = asRecord(value.turn);
    const threadId = asString(value.thread_id ?? value.threadId ?? thread?.id ?? thread?.thread_id ?? thread?.threadId);
    const turnId = asString(value.turn_id ?? value.turnId ?? turn?.id ?? turn?.turn_id ?? turn?.turnId);

    return {
        ...(threadId ? { thread_id: threadId } : {}),
        ...(turnId ? { turn_id: turnId } : {})
    };
}

function itemIdFrom(value: WrappedRecord, item: WrappedRecord | null = null): string | null {
    return asString(value.item_id ?? value.itemId ?? value.id ?? item?.id ?? item?.item_id ?? item?.itemId);
}

export function isWrappedTerminalEventType(type: string): boolean {
    return type === 'task_started'
        || type === 'task_complete'
        || type === 'turn_aborted'
        || type === 'task_failed';
}

export function buildWrappedTerminalEvent(msg: WrappedRecord, inheritedScope: WrappedRecord): WrappedRecord | null {
    const type = asString(msg.type);
    if (!type || !isWrappedTerminalEventType(type)) {
        return null;
    }

    const scope = { ...inheritedScope, ...scopeFrom(msg) };
    const turnId = asString(msg.turn_id ?? msg.turnId ?? scope.turn_id);
    if ((type === 'task_complete' || type === 'turn_aborted' || type === 'task_failed') && !turnId) {
        return null;
    }

    const threadId = asString(msg.thread_id ?? msg.threadId ?? scope.thread_id);
    const errorRecord = asRecord(msg.error);
    const error = asString(msg.error ?? msg.message ?? errorRecord?.message);

    return {
        type,
        ...(threadId ? { thread_id: threadId } : {}),
        ...(turnId ? { turn_id: turnId } : {}),
        ...(type === 'task_failed' && error ? { error } : {})
    };
}

export function buildWrappedTextDeltaNotification(msg: WrappedRecord, inheritedScope: WrappedRecord): WrappedNotification | null {
    const type = asString(msg.type);
    const scope = { ...inheritedScope, ...scopeFrom(msg) };

    if (type === 'agent_message_delta' || type === 'agent_message_content_delta') {
        const itemId = itemIdFrom(msg);
        const delta = asString(msg.delta ?? msg.text ?? msg.message);
        if (!itemId || !delta) {
            return null;
        }
        return {
            method: 'item/agentMessage/delta',
            params: { itemId, delta, ...scope }
        };
    }

    if (type === 'exec_command_output_delta') {
        const itemId = asString(msg.call_id ?? msg.callId) ?? itemIdFrom(msg);
        const delta = asString(msg.delta ?? msg.output ?? msg.stdout ?? msg.text);
        if (!itemId || !delta) {
            return null;
        }
        return {
            method: 'item/commandExecution/outputDelta',
            params: { itemId, delta, ...scope }
        };
    }

    return null;
}

export function buildWrappedReasoningSectionBreakNotification(msg: WrappedRecord, inheritedScope: WrappedRecord): WrappedNotification | null {
    if (msg.type !== 'agent_reasoning_section_break') {
        return null;
    }

    const itemId = itemIdFrom(msg);
    if (!itemId) {
        return null;
    }

    const summaryIndex = asNumber(msg.summary_index ?? msg.summaryIndex);
    return {
        method: 'item/reasoning/summaryPartAdded',
        params: {
            itemId,
            ...inheritedScope,
            ...scopeFrom(msg),
            ...(summaryIndex !== null ? { summaryIndex } : {})
        }
    };
}

export function buildWrappedItemNotification(msg: WrappedRecord, inheritedScope: WrappedRecord): WrappedNotification | null {
    const type = asString(msg.type);
    if (type !== 'item_started' && type !== 'item_completed') {
        return null;
    }

    const item = asRecord(msg.item) ?? {};
    const itemThread = asRecord(item.thread);
    const itemTurn = asRecord(item.turn);
    const scope = { ...inheritedScope, ...scopeFrom(msg) };
    const threadId = asString(msg.thread_id ?? msg.threadId ?? scope.thread_id ?? item.thread_id ?? item.threadId ?? itemThread?.id);
    const turnId = asString(msg.turn_id ?? msg.turnId ?? scope.turn_id ?? item.turn_id ?? item.turnId ?? itemTurn?.id);

    return {
        method: type === 'item_started' ? 'item/started' : 'item/completed',
        params: {
            ...scope,
            item,
            ...(itemIdFrom(msg, item) ? { itemId: itemIdFrom(msg, item) } : {}),
            ...(threadId ? { threadId } : {}),
            ...(turnId ? { turnId } : {})
        }
    };
}

export function isIgnoredWrappedCodexEventType(type: string): boolean {
    return type === 'agent_message'
        || type === 'agent_reasoning_delta'
        || type === 'agent_reasoning'
        || type === 'mcp_startup_update'
        || type === 'mcp_startup_complete'
        || type === 'skills_update_available'
        || type === 'stream_error'
        || type === 'warning'
        || type === 'terminal_interaction'
        || type === 'user_message';
}

export function buildWrappedErrorEvent(msg: WrappedRecord): WrappedRecord | null {
    if (msg.type !== undefined && msg.type !== 'error') {
        return null;
    }

    const errorRecord = asRecord(msg.error);
    const willRetry = msg.will_retry === true
        || msg.willRetry === true
        || errorRecord?.will_retry === true
        || errorRecord?.willRetry === true;
    if (willRetry) {
        return null;
    }

    const error = asString(msg.message ?? msg.reason ?? errorRecord?.message);
    return error ? { type: 'task_failed', error } : null;
}
