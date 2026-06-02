import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'

vi.mock('@/lib/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('RenameSessionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancels pending focus when dialog closes before next frame', () => {
    let nextFrameId = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const rafMock = vi.fn((cb: FrameRequestCallback) => {
      nextFrameId += 1
      frameCallbacks.set(nextFrameId, cb)
      return nextFrameId
    })
    const cancelMock = vi.fn((id: number) => {
      frameCallbacks.delete(id)
    })
    vi.stubGlobal('requestAnimationFrame', rafMock)
    vi.stubGlobal('cancelAnimationFrame', cancelMock)

    const { rerender } = render(
      <RenameSessionDialog
        isOpen
        onClose={vi.fn()}
        currentName="session-a"
        onRename={vi.fn(async () => {})}
        isPending={false}
      />
    )

    rerender(
      <RenameSessionDialog
        isOpen={false}
        onClose={vi.fn()}
        currentName="session-a"
        onRename={vi.fn(async () => {})}
        isPending={false}
      />
    )

    expect(rafMock).toHaveBeenCalledTimes(1)
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(frameCallbacks.size).toBe(0)
  })
})
