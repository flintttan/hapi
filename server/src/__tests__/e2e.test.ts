import { describe, it, expect } from 'bun:test'

describe('Server E2E Smoke Test', () => {
    const serverUrl = process.env.HAPI_SERVER_URL || 'http://hapi-server:3006'
    const apiToken = process.env.CLI_API_TOKEN || 'test-token-e2e'

    it('should have server running and responding', async () => {
        const response = await fetch(serverUrl)
        if (!response.ok) {
            console.log('Response status:', response.status, response.statusText)
        }
        expect(response.ok).toBe(true)
        expect(response.status).toBe(200)
    })

    it('should require authentication for API endpoints', async () => {
        const response = await fetch(`${serverUrl}/api/sessions`)
        expect(response.ok).toBe(false)
        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBe('Missing authorization token')
    })

    it('should accept authentication with CLI token', async () => {
        const response = await fetch(`${serverUrl}/api/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                accessToken: apiToken
            })
        })

        expect(response.ok).toBe(true)
        const data = await response.json()
        expect(data.token).toBeDefined()
        expect(typeof data.token).toBe('string')
    })
})
