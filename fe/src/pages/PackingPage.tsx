import { useNavigate } from 'react-router-dom'
import { PackingDashboard } from '../components/packing/PackingDashboard'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'

/** Trang đóng gói — UI mock (`PackingDashboard`), chưa nối API BE. */
export function PackingPage() {
  const { locale } = usePortal()
  const navigate = useNavigate()
  const vi = locale === 'vi'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Duyệt đóng gói' : 'Packaging approval' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PackingDashboard
          onNavigateToShipping={() => navigate('/app/shipping')}
        />
      </div>
    </div>
  )
}
