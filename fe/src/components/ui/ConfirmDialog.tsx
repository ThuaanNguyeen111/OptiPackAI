import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  icon?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  loading = false,
  icon,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-xl border border-hairline bg-surface-1 sm:rounded-xl"
      >
        <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
          <div
            id="confirm-dialog-title"
            className="flex items-center gap-2 text-sm font-medium text-ink"
          >
            {icon}
            {title}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            aria-label={cancelLabel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
        <div className="flex gap-2 border-t border-hairline p-4">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
