import type { AgentState } from "@/api/types";

type RpcHandlerManagerLike = {
    registerHandler<TRequest = unknown, TResponse = unknown>(
        method: string,
        handler: (params: TRequest) => Promise<TResponse> | TResponse
    ): void;
};

export type PermissionHandlerClient = {
    rpcHandlerManager: RpcHandlerManagerLike;
    updateAgentState: (handler: (state: AgentState) => AgentState) => void;
};

export type PendingPermissionRequest<TResult> = {
    resolve: (value: TResult) => void;
    reject: (error: Error) => void;
    toolName: string;
    input: unknown;
};

export type PermissionCompletion = {
    status: 'approved' | 'denied' | 'canceled';
    reason?: string;
    mode?: string;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
    allowTools?: string[];
    answers?: Record<string, string[]>;
};

export type CancelPendingRequestOptions = {
    completedReason: string;
    rejectMessage: string;
};

export abstract class BasePermissionHandler<TResponse extends { id: string }, TResult> {
    protected readonly pendingRequests = new Map<string, PendingPermissionRequest<TResult>>();
    protected readonly client: PermissionHandlerClient;

    protected constructor(client: PermissionHandlerClient) {
        this.client = client;
        this.setupRpcHandler();
    }

    protected abstract handlePermissionResponse(
        response: TResponse,
        pending: PendingPermissionRequest<TResult>
    ): PermissionCompletion;

    protected abstract handleMissingPendingResponse(response: TResponse): void;

    protected onRequestRegistered(_id: string, _toolName: string, _input: unknown): void {
    }

    protected onResponseReceived(_response: TResponse): void {
    }

    protected addPendingRequest(
        id: string,
        toolName: string,
        input: unknown,
        handlers: { resolve: (value: TResult) => void; reject: (error: Error) => void }
    ): void {
        this.pendingRequests.set(id, { ...handlers, toolName, input });
        this.onRequestRegistered(id, toolName, input);
        this.client.updateAgentState((currentState) => ({
            ...currentState,
            requests: {
                ...currentState.requests,
                [id]: {
                    tool: toolName,
                    arguments: input,
                    createdAt: Date.now()
                }
            }
        }));
    }

    protected finalizeRequest(id: string, completion: PermissionCompletion): void {
        this.client.updateAgentState((currentState) => {
            const request = currentState.requests?.[id];
            if (!request) return currentState;

            const nextRequests = { ...currentState.requests };
            delete nextRequests[id];

            return {
                ...currentState,
                requests: nextRequests,
                completedRequests: {
                    ...currentState.completedRequests,
                    [id]: {
                        ...request,
                        completedAt: Date.now(),
                        status: completion.status,
                        reason: completion.reason,
                        mode: completion.mode,
                        decision: completion.decision,
                        allowTools: completion.allowTools,
                        answers: completion.answers
                    }
                }
            };
        });
    }

    protected cancelPendingRequests(options: CancelPendingRequestOptions): void {
        for (const [, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error(options.rejectMessage));
        }
        this.pendingRequests.clear();

        this.client.updateAgentState((currentState) => {
            const pendingRequests = currentState.requests || {};
            const completedRequests = { ...currentState.completedRequests };

            for (const [id, request] of Object.entries(pendingRequests)) {
                completedRequests[id] = {
                    ...request,
                    completedAt: Date.now(),
                    status: 'canceled',
                    reason: options.completedReason
                };
            }

            return {
                ...currentState,
                requests: {},
                completedRequests
            };
        });
    }

    private setupRpcHandler(): void {
        this.client.rpcHandlerManager.registerHandler<TResponse, void>('permission', async (response) => {
            const pending = this.pendingRequests.get(response.id);

            if (!pending) {
                this.handleMissingPendingResponse(response);
                return;
            }

            this.onResponseReceived(response);
            this.pendingRequests.delete(response.id);

            const completion = this.handlePermissionResponse(response, pending);
            this.finalizeRequest(response.id, completion);
        });
    }
}
