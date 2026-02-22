import type { AttachmentMetadata } from '@/api/types'

/**
 * Formats attachments for Claude by converting them to @path references.
 * Claude understands the @path format for file references.
 */
export function formatAttachmentsForClaude(attachments: AttachmentMetadata[] | undefined): string {
    if (!attachments || attachments.length === 0) {
        return ''
    }
    return attachments.map(a => `@${a.path}`).join(' ')
}

/**
 * Combines text and formatted attachments into a single prompt string.
 * Attachments are formatted as @path references and prepended to the text.
 */
export function formatMessageWithAttachments(
    text: string,
    attachments: AttachmentMetadata[] | undefined
): string {
    const attachmentText = formatAttachmentsForClaude(attachments)
    if (!attachmentText) {
        return text
    }
    if (!text) {
        return attachmentText
    }
    return `${attachmentText}\n\n${text}`
}
