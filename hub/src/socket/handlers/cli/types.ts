export type AccessErrorReason = 'namespace-missing' | 'access-denied' | 'not-found'

export type AccessResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: AccessErrorReason }
