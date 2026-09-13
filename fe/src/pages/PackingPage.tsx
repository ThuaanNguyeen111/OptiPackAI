import { PortalTopBar } from '../components/portal/PortalTopBar'
import { PackingDashboard } from '../components/packing/PackingDashboard'
import { usePortal } from '../context/use-portal'

export function PackingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'AI 3D Packing' : 'AI 3D Packing Engine' },
        ]}
      />
      <PackingDashboard />
    </div>
  )
}
