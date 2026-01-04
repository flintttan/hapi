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
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Session Actions</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-2">
                    <Button
                        variant="secondary"
                        className="justify-start gap-3 h-12"
                        onClick={handleRename}
                    >
                        <EditIcon className="text-[var(--app-hint)]" />
                        Rename
                    </Button>

                    {sessionActive ? (
                        <Button
                            variant="secondary"
                            className="justify-start gap-3 h-12 text-red-500"
                            onClick={handleArchive}
                        >
                            <ArchiveIcon className="text-red-500" />
                            Archive
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            className="justify-start gap-3 h-12 text-red-500"
                            onClick={handleDelete}
                        >
                            <TrashIcon className="text-red-500" />
                            Delete
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
