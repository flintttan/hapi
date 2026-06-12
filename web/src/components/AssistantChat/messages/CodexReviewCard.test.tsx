import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { CodexReviewCard } from '@/components/AssistantChat/messages/CodexReviewCard'
import type { CodexReview } from '@/chat/types'

function renderCard(review: CodexReview) {
    return render(
        <I18nProvider>
            <CodexReviewCard review={review} />
        </I18nProvider>
    )
}

describe('CodexReviewCard', () => {
    it('renders overall review details and finding locations', () => {
        renderCard({
            overallCorrectness: 'patch is incorrect',
            overallExplanation: 'Retained sessions can survive socket disconnects.',
            overallConfidenceScore: 0.8,
            findings: [{
                title: '[P2] Remove retained sessions when sockets disconnect',
                body: 'This entry remains in onlineMessageSessions.',
                priority: 2,
                confidenceScore: 0.82,
                filePath: '/data/dz/wapair-ts/src/pairing/manager.ts',
                lineStart: 1614,
                lineEnd: 1619
            }]
        })

        expect(screen.getByText('Codex review')).toBeInTheDocument()
        expect(screen.getByText('patch is incorrect')).toBeInTheDocument()
        expect(screen.getByText('80%')).toBeInTheDocument()
        expect(screen.getByText('Retained sessions can survive socket disconnects.')).toBeInTheDocument()
        expect(screen.getByText('1 findings')).toBeInTheDocument()
        expect(screen.getByText('P2')).toBeInTheDocument()
        expect(screen.getByText('[P2] Remove retained sessions when sockets disconnect')).toBeInTheDocument()
        expect(screen.getByText('This entry remains in onlineMessageSessions.')).toBeInTheDocument()
        expect(screen.getByText('/data/dz/wapair-ts/src/pairing/manager.ts:1614-1619')).toBeInTheDocument()
        expect(screen.getByText('Confidence 82%')).toBeInTheDocument()
    })

    it('omits optional values without rendering nullish text', () => {
        renderCard({
            overallCorrectness: null,
            overallExplanation: null,
            overallConfidenceScore: null,
            findings: [{
                title: 'Finding without metadata',
                body: 'Body only.',
                priority: null,
                confidenceScore: null,
                filePath: null,
                lineStart: null,
                lineEnd: null
            }]
        })

        expect(screen.getByText('Finding without metadata')).toBeInTheDocument()
        expect(screen.getByText('Body only.')).toBeInTheDocument()
        expect(screen.getByText('No location')).toBeInTheDocument()
        expect(screen.queryByText(/undefined|null/)).not.toBeInTheDocument()
    })
})
