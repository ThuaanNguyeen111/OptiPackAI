import { PackagingWorkbench } from '../components/packing/PackagingWorkbench'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'

/** Admin chốt kế hoạch / Packaging Staff chấp nhận hoặc từ chối — `/app/packing`. */
export function PackingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Đóng gói' : 'Packing' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PackagingWorkbench />
      </main>
    </div>
  )
}
