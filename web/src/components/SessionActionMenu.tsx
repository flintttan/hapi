import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type SessionActionMenuProps = {
    isOpen: boolean
    onClose: () => void
    sessionActive: boolean
    onRename: () => void
    onArchive: () => void
    onDelete: () => void
}

function EditIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
        </svg>
    )
}

function ArchiveIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
        </svg>
    )
}

function TrashIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" x2="10" y1="11" y2="17" />
            <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
    )
}

export function SessionActionMenu(props: SessionActionMenuProps) {
    const { isOpen, onClose, sessionActive, onRename, onArchive, onDelete } = props

    const handleRename = () => {
        onClose()
        onRename()
    }

    const handleArchive = () => {
        onClose()
        onArchive()
    }

    const handleDelete = () => {
        onClose()
        onDelete()
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="left-0 right-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none bg-transparent p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100vw-24px)] sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:bg-[var(--app-secondary-bg)] sm:p-4 sm:shadow-2xl"
            >
                <DialogHeader className="px-1 pb-2 sm:px-0 sm:pb-0">
                    <div
                        className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--app-divider)] sm:hidden"
                        aria-hidden="true"
                    />
                    <DialogTitle className="text-sm sm:text-base">Session Actions</DialogTitle>
                </DialogHeader>

                <div className="mt-3 flex flex-col gap-2 sm:mt-4">
                    <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)]">
                        <button
                            type="button"
                            onClick={handleRename}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] active:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                        >
                            <EditIcon className="text-[var(--app-hint)]" />
                            Rename
                        </button>
                        <div className="h-px bg-[var(--app-divider)]" aria-hidden="true" />

                        {sessionActive ? (
                            <button
                                type="button"
                                onClick={handleArchive}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-[var(--app-subtle-bg)] active:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                            >
                                <ArchiveIcon className="text-red-600" />
                                Archive
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-[var(--app-subtle-bg)] active:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                            >
                                <TrashIcon className="text-red-600" />
                                Delete
                            </button>
                        )}
                    </div>

                    <Button
                        type="button"
                        variant="secondary"
                        className="h-12 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
