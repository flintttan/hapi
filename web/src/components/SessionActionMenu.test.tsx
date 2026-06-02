import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { SessionActionMenu } from '@/components/SessionActionMenu'

vi.mock('@/lib/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('SessionActionMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('repositions from live anchor ref instead of stale anchor point', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const anchorRef = { current: anchor }
    const rectSpy = vi.spyOn(anchor, 'getBoundingClientRect')
      .mockImplementation(() => ({
        x: 180,
        y: 120,
        top: 120,
        left: 120,
        right: 180,
        bottom: 160,
        width: 60,
        height: 40,
        toJSON: () => ({}),
      }) as DOMRect)

    const { container } = render(
      <SessionActionMenu
        isOpen
        onClose={vi.fn()}
        sessionActive={false}
        onRename={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        anchorPoint={{ x: 1, y: 1 }}
        anchorRef={anchorRef}
      />
    )

    const menu = container.firstElementChild as HTMLDivElement | null
    expect(menu).toBeTruthy()
    if (!menu) return

    Object.defineProperty(menu, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 200,
        bottom: 120,
        width: 200,
        height: 120,
        toJSON: () => ({}),
      }),
    })

    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      expect(rectSpy).toHaveBeenCalled()
      expect(menu.style.top).not.toBe('9px')
    })

    anchor.remove()
  })
})
