import { PortalTopBar } from '../components/portal/PortalTopBar'
import { PackagingWorkbench } from '../components/packing/PackagingWorkbench'
import { usePortal } from '../context/use-portal'

export function PackingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Duyệt đóng gói' : 'Packaging approval' },
        ]}
      />
      <PackagingWorkbench />
    </div>
  )
}
