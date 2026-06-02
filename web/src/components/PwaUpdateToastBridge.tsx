import { useEffect } from 'react'
import { useToast } from '@/lib/toast-context'
import { getBasePath } from '@/lib/pwa'

type PwaUpdateEventDetail = {
    update?: () => void
}

export function PwaUpdateToastBridge() {
    const { addToast } = useToast()

    useEffect(() => {
        const handlePwaUpdate = (event: Event) => {
            const detail = (event as CustomEvent<PwaUpdateEventDetail>).detail
            addToast({
                title: 'Update available',
                body: 'Tap to reload the app and apply the latest version.',
                sessionId: '',
                url: getBasePath(),
                actionLabel: 'Reload',
                onAction: () => {
                    detail?.update?.()
                }
            })
        }

        window.addEventListener('hapi:pwa-update-available', handlePwaUpdate)
        return () => {
            window.removeEventListener('hapi:pwa-update-available', handlePwaUpdate)
        }
    }, [addToast])

    return null
}
