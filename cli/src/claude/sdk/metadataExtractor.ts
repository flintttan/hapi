/**
 * SDK Metadata Extractor
 * Captures available tools and slash commands from Claude SDK initialization
 */

import { query } from './query'
import type { SDKSystemMessage } from './types'
import { logger } from '@/ui/logger'

export interface SDKMetadata {
    tools?: string[]
    slashCommands?: string[]
}

/**
 * Extract SDK metadata by running a minimal query and capturing the init message
 * @returns SDK metadata containing tools and slash commands
 */
export async function extractSDKMetadata(): Promise<SDKMetadata> {
    const abortController = new AbortController()
    let captured: SDKMetadata | null = null
    
    try {
        logger.debug('[metadataExtractor] Starting SDK metadata extraction')
        
        // Run SDK with minimal tools allowed
        const sdkQuery = query({
            prompt: 'hello',
            options: {
                allowedTools: ['Bash(echo)'],
                maxTurns: 1,
                abort: abortController.signal
            }
        })

        // Wait for the first system message which contains tools and slash commands
        for await (const message of sdkQuery) {
            if (message.type === 'system' && message.subtype === 'init') {
                const systemMessage = message as SDKSystemMessage
                
                captured = {
                    tools: systemMessage.tools,
                    slashCommands: systemMessage.slash_commands
                }
                
                logger.debug('[metadataExtractor] Captured SDK metadata:', captured)
                
                // Abort the query since we got what we need
                abortController.abort()
                
                break
            }
        }
        
        if (!captured) {
            logger.debug('[metadataExtractor] No init message received from SDK')
            return {}
        }

        return captured
        
    } catch (error) {
        // Check if it's an abort error (expected)
        if (error instanceof Error && error.name === 'AbortError') {
            logger.debug('[metadataExtractor] SDK query aborted')
            return captured ?? {}
        }
        logger.debug('[metadataExtractor] Error extracting SDK metadata:', error)
        return captured ?? {}
    } finally {
        // Ensure we always terminate the SDK process quickly.
        if (!abortController.signal.aborted) {
            abortController.abort()
        }
    }
}

/**
 * Extract SDK metadata asynchronously without blocking
 * Fires the extraction and updates metadata when complete
 */
export function extractSDKMetadataAsync(onComplete: (metadata: SDKMetadata) => void): void {
    extractSDKMetadata()
        .then(metadata => {
            if (metadata.tools || metadata.slashCommands) {
                onComplete(metadata)
            }
        })
        .catch(error => {
            logger.debug('[metadataExtractor] Async extraction failed:', error)
        })
}
