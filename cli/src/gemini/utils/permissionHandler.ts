import type { ApiSessionClient } from '@/api/apiSession';
import type { AgentBackend, PermissionRequest, PermissionResponse } from '@/agent/types';
import type { GeminiPermissionMode } from '@hapi/protocol/types';
import { deriveToolName } from '@/agent/utils';
import { logger } from '@/ui/logger';

interface PermissionResponseMessage {
    id: string;
    approved: boolean;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
    reason?: string;
}

function deriveToolInput(request: PermissionRequest): unknown {
    if (request.rawInput !== undefined) {
        return request.rawInput;
    }
    return request.rawOutput;
}

function pickOptionId(request: PermissionRequest, preferredKinds: string[]): string | null {
    for (const kind of preferredKinds) {
        const match = request.options.find((option) => option.kind === kind);
        if (match) {
            return match.optionId;
        }
    }
    return request.options.length > 0 ? request.options[0].optionId : null;
}

function mapDecisionToOutcome(request: PermissionRequest, decision: PermissionResponseMessage['decision']): PermissionResponse {
    if (decision === 'abort') {
        return { outcome: 'cancelled' };
    }

    if (decision === 'approved_for_session') {
        const optionId = pickOptionId(request, ['allow_always', 'allow_once']);
        return optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' };
    }

    if (decision === 'approved') {
        const optionId = pickOptionId(request, ['allow_once', 'allow_always']);
        return optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' };
    }

    const optionId = pickOptionId(request, ['reject_once', 'reject_always']);
    return optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' };
}

function shouldAutoApprove(mode: GeminiPermissionMode, toolName: string, toolCallId: string): boolean {
    const alwaysAutoApproveNames = [
        'change_title',
        'happy__change_title',
        'geminireasoning',
        'codexreasoning',
        'think',
        'save_memory'
    ];
    const alwaysAutoApproveIds = ['change_title', 'save_memory'];

    const lowerTool = toolName.toLowerCase();
    if (alwaysAutoApproveNames.some((name) => lowerTool.includes(name))) {
        return true;
    }

    const lowerId = toolCallId.toLowerCase();
    if (alwaysAutoApproveIds.some((name) => lowerId.includes(name))) {
        return true;
    }

    if (mode === 'yolo') {
        return true;
    }
    if (mode === 'safe-yolo') {
        return true;
    }
    if (mode === 'read-only') {
        const writeTools = ['write', 'edit', 'create', 'delete', 'patch', 'fs-edit'];
        const isWriteTool = writeTools.some((name) => lowerTool.includes(name));
        return !isWriteTool;
    }

    return false;
}

export class GeminiPermissionHandler {
    private readonly pendingRequests = new Map<string, PermissionRequest>();

    constructor(
        private readonly session: ApiSessionClient,
        private readonly backend: AgentBackend,
        private readonly getPermissionMode: () => GeminiPermissionMode | undefined
    ) {
        this.backend.onPermissionRequest((request) => this.handlePermissionRequest(request));
        this.session.rpcHandlerManager.registerHandler<PermissionResponseMessage, void>(
            'permission',
            async (response) => {
                await this.handlePermissionResponse(response);
            }
        );
    }

    private handlePermissionRequest(request: PermissionRequest): void {
        const toolName = deriveToolName({
            title: request.title,
            kind: request.kind,
            rawInput: request.rawInput
        });
        const toolInput = deriveToolInput(request);
        const mode = this.getPermissionMode() ?? 'default';

        if (shouldAutoApprove(mode, toolName, request.toolCallId)) {
            const decision: PermissionResponseMessage['decision'] = mode === 'yolo'
                ? 'approved_for_session'
                : 'approved';
            void this.autoApprove(request, toolName, toolInput, decision);
            return;
        }

        this.pendingRequests.set(request.id, request);
        this.session.updateAgentState((currentState) => ({
            ...currentState,
            requests: {
                ...currentState.requests,
                [request.id]: {
                    tool: toolName,
                    arguments: toolInput,
                    createdAt: Date.now()
                }
            }
        }));

        logger.debug(`[Gemini] Permission request queued for ${toolName} (${request.id})`);
    }

    private async autoApprove(
        request: PermissionRequest,
        toolName: string,
        toolInput: unknown,
        decision: PermissionResponseMessage['decision']
    ): Promise<void> {
        const outcome = mapDecisionToOutcome(request, decision);
        await this.backend.respondToPermission(request.sessionId, request, outcome);

        this.session.updateAgentState((currentState) => ({
            ...currentState,
            completedRequests: {
                ...currentState.completedRequests,
                [request.id]: {
                    tool: toolName,
                    arguments: toolInput,
                    createdAt: Date.now(),
                    completedAt: Date.now(),
                    status: 'approved',
                    decision
                }
            }
        }));

        logger.debug(`[Gemini] Auto-approved ${toolName} (${request.id}) mode=${decision}`);
    }

    private async handlePermissionResponse(response: PermissionResponseMessage): Promise<void> {
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            logger.debug('[Gemini] Permission response received for unknown request', response.id);
            return;
        }

        this.pendingRequests.delete(response.id);

        const decision = response.decision ?? (response.approved ? 'approved' : 'denied');
        const toolName = deriveToolName({
            title: pending.title,
            kind: pending.kind,
            rawInput: pending.rawInput
        });
        const toolInput = deriveToolInput(pending);

        if (decision === 'abort') {
            await this.backend.cancelPrompt(pending.sessionId);
        }

        const outcome = mapDecisionToOutcome(pending, decision);
        await this.backend.respondToPermission(pending.sessionId, pending, outcome);

        this.session.updateAgentState((currentState) => {
            const requestEntry = currentState.requests?.[response.id];
            const { [response.id]: _, ...remaining } = currentState.requests ?? {};
            const status = response.approved ? 'approved' : 'denied';

            return {
                ...currentState,
                requests: remaining,
                completedRequests: {
                    ...currentState.completedRequests,
                    [response.id]: {
                        tool: toolName,
                        arguments: toolInput,
                        createdAt: requestEntry?.createdAt ?? Date.now(),
                        completedAt: Date.now(),
                        status,
                        decision,
                        reason: response.reason
                    }
                }
            };
        });

        logger.debug(`[Gemini] Permission ${response.approved ? 'approved' : 'denied'} for ${toolName}`);
    }

    async cancelAll(reason: string): Promise<void> {
        const pending = Array.from(this.pendingRequests.values());
        this.pendingRequests.clear();

        for (const request of pending) {
            await this.backend.respondToPermission(request.sessionId, request, { outcome: 'cancelled' });
        }

        this.session.updateAgentState((currentState) => {
            const pendingRequests = currentState.requests ?? {};
            const completedRequests = { ...currentState.completedRequests };

            for (const [id, request] of Object.entries(pendingRequests)) {
                completedRequests[id] = {
                    ...request,
                    completedAt: Date.now(),
                    status: 'canceled',
                    reason,
                    decision: 'abort'
                };
            }

            return {
                ...currentState,
                requests: {},
                completedRequests
            };
        });
    }
}
