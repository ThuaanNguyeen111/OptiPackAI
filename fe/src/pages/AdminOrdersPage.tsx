import { MarketplaceOrdersScreen } from '../components/marketplace/MarketplaceOrdersScreen'
import { usePortal } from '../context/use-portal'

export function AdminOrdersPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <MarketplaceOrdersScreen
      detailPath={(id) => `/app/admin/orders/${id}`}
      marketplacePath="/app/admin/marketplace"
      topBarVariant="admin"
      title={vi ? 'Đơn hàng' : 'Orders'}
      canSync
      breadcrumbs={[
        { label: 'OptiPackAI', to: '/app' },
        { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
        { label: vi ? 'Đơn hàng' : 'Orders' },
      ]}
    />
  )
}
