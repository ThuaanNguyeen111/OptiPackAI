import { PackagingWorkbench } from '../components/packing/PackagingWorkbench'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'

/** Bàn đóng gói — nhận hàng kho đã lấy (picked), không phải mock dashboard. */
export function PackingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Đóng gói' : 'Packing' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PackagingWorkbench />
      </div>
    </div>
  )
}
