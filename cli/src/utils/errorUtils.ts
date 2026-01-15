/**
 * Error handling utilities for API requests
 */

export type ErrorInfo = {
    message: string
    messageLower: string
    axiosCode?: string
    httpStatus?: number
    responseErrorText: string
}

/**
 * Extract structured error information from an unknown error
 */
export function extractErrorInfo(error: unknown): ErrorInfo {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const messageLower = message.toLowerCase()

    if (typeof error !== 'object' || error === null) {
        return { message, messageLower, responseErrorText: '' }
    }

    const record = error as Record<string, unknown>
    const axiosCode = typeof record.code === 'string' ? record.code : undefined
    const response = typeof record.response === 'object' && record.response !== null
        ? (record.response as Record<string, unknown>)
        : undefined
    const httpStatus = typeof response?.status === 'number' ? response.status : undefined
    const responseData = response?.data
    const responseError = typeof responseData === 'object' && responseData !== null
        ? (responseData as Record<string, unknown>).error
        : undefined
    const responseErrorText = typeof responseError === 'string' ? responseError : ''

    return {
        message,
        messageLower,
        axiosCode,
        httpStatus,
        responseErrorText
    }
}

/**
 * Check if an error is a retryable connection error
 *
 * Retryable errors:
 * - ECONNREFUSED - server not started
 * - ETIMEDOUT - connection timeout
 * - ENOTFOUND - DNS resolution failed
 * - ENETUNREACH - network unreachable
 * - ECONNRESET - connection reset
 * - 5xx - server errors
 *
 * Non-retryable errors:
 * - 401 - authentication failed
 * - 403 - permission denied
 * - 404 - endpoint not found
 * - other 4xx errors
 */
export function isRetryableConnectionError(error: unknown): boolean {
    const { axiosCode, httpStatus } = extractErrorInfo(error)

    // Retryable network errors
    if (axiosCode === 'ECONNREFUSED' ||
        axiosCode === 'ETIMEDOUT' ||
        axiosCode === 'ENOTFOUND' ||
        axiosCode === 'ENETUNREACH' ||
        axiosCode === 'ECONNRESET') {
        return true
    }

    // 5xx server errors are retryable
    if (httpStatus && httpStatus >= 500) {
        return true
    }

    // Other errors (401, 403, 404, etc.) are not retryable
    return false
}
