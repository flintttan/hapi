import type { SessionEndReason } from '@hapi/protocol'
import { RPC_METHODS } from '@hapi/protocol/rpcMethods'

type RpcHandlerManagerLike = {
    registerHandler<TRequest = unknown, TResponse = unknown>(
        method: string,
        handler: (params: TRequest) => Promise<TResponse> | TResponse
    ): void
}

type LocalHandoffLifecycle = {
    setArchiveReason: (reason: string) => void
    setSessionEndReason: (reason: SessionEndReason) => void
    cleanupAndExit: (codeOverride?: number) => Promise<void>
}

export function registerLocalHandoffHandler(
    rpcHandlerManager: RpcHandlerManagerLike,
    lifecycle: LocalHandoffLifecycle
): void {
    rpcHandlerManager.registerHandler(RPC_METHODS.HandoffLocal, () => {
        lifecycle.setArchiveReason('Handed off to local terminal')
        lifecycle.setSessionEndReason('handoff')
        setImmediate(() => {
            void lifecycle.cleanupAndExit(0)
        })
        return { ok: true }
    })
}
