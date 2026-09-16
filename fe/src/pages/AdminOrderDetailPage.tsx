import { MarketplaceOrderDetailScreen } from '../components/marketplace/MarketplaceOrderDetailScreen'
import { usePortal } from '../context/use-portal'

export function AdminOrderDetailPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <MarketplaceOrderDetailScreen
      listPath="/app/admin/orders"
      detailPath={(id) => `/app/admin/orders/${id}`}
      groupFilterPath={(groupId) =>
        `/app/admin/orders?group=${encodeURIComponent(groupId)}`
      }
      topBarVariant="admin"
      breadcrumbs={(orderLabel) => [
        { label: 'OptiPackAI', to: '/app' },
        { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
        {
          label: vi ? 'Đơn hàng' : 'Orders',
          to: '/app/admin/orders',
        },
        { label: orderLabel },
      ]}
    />
  )
}
