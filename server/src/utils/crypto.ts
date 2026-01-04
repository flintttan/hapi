import { timingSafeEqual } from 'node:crypto'

export function constantTimeEquals(a: string | null | undefined, b: string | null | undefined): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false
    }

    const bufferA = Buffer.from(a, 'utf8')
    const bufferB = Buffer.from(b, 'utf8')
    const maxLength = Math.max(bufferA.length, bufferB.length)
    const paddedA = Buffer.alloc(maxLength)
    const paddedB = Buffer.alloc(maxLength)

    bufferA.copy(paddedA)
    bufferB.copy(paddedB)

    const matches = timingSafeEqual(paddedA, paddedB)
    return matches && bufferA.length === bufferB.length
}
