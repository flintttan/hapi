/**
 * Remark plugin that disables indented code blocks (4-space indent).
 *
 * In CommonMark, text indented by 4+ spaces becomes a code block.  This
 * frequently misparses LLM output where numbered-list items with nested
 * content or quoted text are indented.  Fenced code blocks (``` … ```)
 * still work normally.
 */
export default function remarkDisableIndentedCode(this: unknown) {
    const processor = this as { data(key: string, value?: unknown): unknown }
    const micromarkExtensions = (processor.data('micromarkExtensions') ?? []) as unknown[]
    micromarkExtensions.push({ disable: { null: ['codeIndented'] } })
    processor.data('micromarkExtensions', micromarkExtensions)
}
