import { SignJWT } from 'jose'
import { createHash } from 'crypto'

const TEST_JWT_SECRET = new TextEncoder().encode('test-secret-key-for-jwt-signing')
const TEST_JWT_EXPIRY = '15m'

/**
 * Authentication helper utilities for testing
 */

/**
 * Generate JWT token for test user
 * @param userId User ID to include in token
 * @returns JWT token string
 */
export async function generateTestJwt(userId: string): Promise<string> {
    const jwt = await new SignJWT({ uid: userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(TEST_JWT_EXPIRY)
        .sign(TEST_JWT_SECRET)

    return jwt
}

/**
 * Hash CLI token for database storage
 * Matches Store.generateCliToken hashing algorithm
 */
export function hashCliToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

/**
 * Generate test CLI token (plaintext)
 * @returns Random token string
 */
export function generateTestCliToken(): string {
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    return Buffer.from(randomBytes).toString('base64url')
}

/**
 * Create authorization header with JWT
 */
export function createJwtAuthHeader(jwt: string): Record<string, string> {
    return {
        Authorization: `Bearer ${jwt}`
    }
}

/**
 * Create authorization header with CLI token
 */
export function createCliTokenAuthHeader(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`
    }
}

/**
 * Verify JWT secret matches production configuration
 * WARNING: Test secret is hardcoded, production uses environment variable
 */
export function getTestJwtSecret(): Uint8Array {
    return TEST_JWT_SECRET
}
