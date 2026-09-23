import { CheckCircle2 } from 'lucide-react'

export function AdminToast({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-success/30 bg-surface-1 px-4 py-3 shadow-lg shadow-black/30">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <p className="min-w-0 flex-1 text-sm font-medium text-ink">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-ink-subtle hover:text-ink"
      >
        ✕
      </button>
    </div>
  )
}
