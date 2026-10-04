import { MarketplaceOrdersScreen } from '../components/marketplace/MarketplaceOrdersScreen'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { UserRole } from '../types/auth'

/** Trang Đơn đa kênh — nối GET /orders (+ sync chỉ Admin). Owner: xem, không Lấy hàng. */
export function OrdersPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const canSync = session?.role === UserRole.ADMIN
  const canPick = session?.role !== UserRole.STORE_OWNER

  return (
    <MarketplaceOrdersScreen
      detailPath={(id) => `/app/orders/${id}`}
      title={vi ? 'Đơn đa kênh' : 'Omnichannel Orders'}
      canSync={canSync}
      canPick={canPick}
      visualStyle="ops"
      breadcrumbs={[
        { label: 'OptiPackAI', to: '/app' },
        { label: vi ? 'Đơn đa kênh' : 'Omnichannel Orders' },
      ]}
    />
  )
}
