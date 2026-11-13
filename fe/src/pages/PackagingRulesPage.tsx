import { AiConnectionCard } from '../components/packaging-rules/AiConnectionCard'
import { PackingRulesCard } from '../components/packaging-rules/PackingRulesCard'
import { SenderCard } from '../components/packaging-rules/SenderCard'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { UserRole } from '../types/auth'

export function PackagingRulesPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const isAdmin = session?.role === UserRole.ADMIN
  // BE chỉ cho Chủ shop / Admin lưu; vai trò khác được bật trang này thì chỉ xem.
  const canEdit = isAdmin || session?.role === UserRole.STORE_OWNER

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Cài đặt đóng gói & AI' : 'Packing & AI settings' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{vi ? 'Cài đặt đóng gói & AI' : 'Packing & AI settings'}</h1>
          <PackingRulesCard vi={vi} canEdit={canEdit} />
          {isAdmin ? <AiConnectionCard vi={vi} /> : null}
          {canEdit ? <SenderCard vi={vi} /> : null}
        </div>
      </main>
    </>
  )
}
