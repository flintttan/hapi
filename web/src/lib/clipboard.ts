export function safeCopyToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).catch(() => safeCopyWithExecCommand(text))
    }
    return safeCopyWithExecCommand(text)
}

function safeCopyWithExecCommand(text: string): Promise<void> {
    if (typeof document === 'undefined') {
        return Promise.reject(new Error('Clipboard API not available'))
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'

    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    const success = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (!success) {
        return Promise.reject(new Error('Clipboard API not available'))
    }
    return Promise.resolve()
}
