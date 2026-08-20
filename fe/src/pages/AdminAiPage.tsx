import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { AiConfigPanel } from '../modules/admin/components/AiConfigPanel'

function Toast({
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

export function AdminAiPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const api = useAdminUsers()
  const [toast, setToast] = useState<string | null>(null)

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: 'AI Packaging' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Cấu hình AI Packaging' : 'AI Packaging configuration'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'Timeout solver · min fill rate · auto fallback thùng'
                : 'Solver timeout · min fill rate · carton auto-fallback'}
            </p>
          </div>

          <AiConfigPanel
            params={api.aiParams}
            onUpdate={(p) => {
              api.updateAiParams(p)
              setToast(
                vi ? 'Đã lưu cấu hình AI Packaging' : 'AI Packaging config saved',
              )
              window.setTimeout(() => setToast(null), 2800)
            }}
          />
        </div>
      </main>

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
