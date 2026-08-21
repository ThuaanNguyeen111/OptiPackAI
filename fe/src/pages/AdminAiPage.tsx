import { useState } from 'react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { AdminToast } from '../modules/admin/components/AdminToast'
import { AiConfigPanel } from '../modules/admin/components/AiConfigPanel'

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
          { label: vi ? 'Tham số AI' : 'AI parameters' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Cấu hình tham số AI Packaging' : 'AI Packaging parameters'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'FE-08 · timeout ≤ 5s (NFR) · min fill rate · fallback khi OR-Tools chậm (R02)'
                : 'FE-08 · timeout ≤ 5s (NFR) · min fill rate · fallback when OR-Tools is slow (R02)'}
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

      {toast ? <AdminToast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
