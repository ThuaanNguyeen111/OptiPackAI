import { MarketplaceOrdersScreen } from '../components/marketplace/MarketplaceOrdersScreen'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { UserRole } from '../types/auth'

/** Trang Đơn đa kênh — nối GET /orders (+ sync chỉ Admin). */
export function OrdersPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const canSync = session?.role === UserRole.ADMIN

  return (
    <MarketplaceOrdersScreen
      detailPath={(id) => `/app/orders/${id}`}
      title={vi ? 'Đơn đa kênh' : 'Omnichannel Orders'}
      canSync={canSync}
      visualStyle="ops"
      breadcrumbs={[
        { label: 'OptiPackAI', to: '/app' },
        { label: vi ? 'Đơn đa kênh' : 'Omnichannel Orders' },
      ]}
    />
  )
}
