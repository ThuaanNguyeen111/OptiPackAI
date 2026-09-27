import { PackagingWorkbench } from '../components/packing/PackagingWorkbench'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'

/** Admin chốt kế hoạch / Packaging Staff chấp nhận hoặc từ chối — `/app/packing`. */
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
      {/* Cuộn theo trang (giống Warehouse) — không khóa overflow-hidden toàn viewport */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <PackagingWorkbench />
      </div>
    </div>
  )
}
