import { createContext, useContext } from 'react'

type MessageSearchContextValue = {
    resultIds: Set<string>
    activeId: string | null
}

const EMPTY_VALUE: MessageSearchContextValue = {
    resultIds: new Set(),
    activeId: null
}

export const MessageSearchContext = createContext<MessageSearchContextValue>(EMPTY_VALUE)

export function useMessageSearchContext(): MessageSearchContextValue {
    return useContext(MessageSearchContext)
}
