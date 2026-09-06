import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, Loader2, RefreshCw, Store } from 'lucide-react'
import { MarketplaceOrderStatusBadge } from '../components/marketplace/MarketplaceOrderStatusBadge'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { useLazadaConnection } from '../hooks/useLazadaConnection'
import { useMarketplaceOrders } from '../hooks/useMarketplaceOrders'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  displayOrderNumber,
  isMarketplaceOrderStatus,
} from '../types/marketplace-orders'
import { formatCurrency, formatDateTime } from '../utils/format'

const selectClass =
  'h-9 cursor-pointer appearance-none rounded-lg border border-hairline bg-surface-1 pl-3 pr-8 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40'

export function AdminOrdersPage() {
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const connection = useLazadaConnection()
  const ordersApi = useMarketplaceOrders()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [groupId, setGroupId] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const listParams = useMemo(() => {
    const status = isMarketplaceOrderStatus(statusFilter)
      ? statusFilter
      : undefined
    return {
      shop_id: shopFilter === 'all' ? undefined : shopFilter,
      status,
      consolidated_group_id: groupId.trim() || undefined,
    }
  }, [groupId, shopFilter, statusFilter])

  useEffect(() => {
    void ordersApi.load(listParams).then((res) => {
      if (!res) return
      const shopIds = [...new Set(res.orders.map((o) => o.shopId).filter(Boolean))]
      connection.hydrateFromOrderShopIds(shopIds)
    })
    // chỉ reload khi bộ lọc đổi — không phụ thuộc object hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listParams.shop_id, listParams.status, listParams.consolidated_group_id])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3200)
  }

  async function handleSync() {
    const shopId =
      shopFilter !== 'all'
        ? shopFilter
        : connection.activeShopId ?? connection.shops[0]?.shopId
    if (!shopId) {
      showToast(
        vi
          ? 'Chưa có shopId. Kết nối shop hoặc tải danh sách đơn trước.'
          : 'No shopId yet. Connect a shop or load orders first.',
      )
      return
    }
    const result = await ordersApi.sync(shopId, listParams)
    if (!result) return
    showToast(
      vi
        ? `Đã đồng bộ ${result.fetched} đơn, ${result.newlyConsolidated} đơn được gộp`
        : `Synced ${result.fetched} orders, ${result.newlyConsolidated} newly consolidated`,
    )
    connection.hydrateFromOrderShopIds([shopId])
  }

  const needsConnect =
    ordersApi.errorCode === 'MKT_SHOP_NOT_CONNECTED' ||
    ordersApi.errorCode === 'MKT_TOKEN_REFRESH_FAILED'

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Đơn hàng' : 'Orders' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Đơn hàng Lazada' : 'Lazada orders'}
              </h1>
              <p className="mt-1 text-sm text-ink-subtle">
                {vi
                  ? 'Đồng bộ thủ công khi cần dữ liệu ngay. BE cũng tự sync mỗi 10 phút.'
                  : 'Manual sync when you need data immediately. Backend also auto-syncs every 10 minutes.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/app/admin/marketplace"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-surface-2"
              >
                <Store className="h-3.5 w-3.5" />
                {vi ? 'Kết nối sàn' : 'Connect shop'}
              </Link>
              <Button
                type="button"
                variant="primary"
                className="h-9 min-h-9 text-xs"
                disabled={ordersApi.syncing}
                onClick={() => void handleSync()}
              >
                {ordersApi.syncing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                {vi ? 'Đồng bộ ngay' : 'Sync now'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-surface-1 p-3">
            <div className="relative">
              <select
                className={selectClass}
                value={shopFilter}
                onChange={(e) => {
                  const value = e.target.value
                  setShopFilter(value)
                  if (value !== 'all') connection.selectShop(value)
                }}
              >
                <option value="all">
                  {vi ? 'Shop: Tất cả' : 'Shop: All'}
                </option>
                {connection.shops.map((shop) => (
                  <option key={shop.shopId} value={shop.shopId}>
                    {shop.shopName
                      ? `${shop.shopName} · ${shop.shopId}`
                      : `Lazada · ${shop.shopId}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            </div>

            <div className="relative">
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">
                  {vi ? 'Trạng thái: Tất cả' : 'Status: All'}
                </option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABELS[status][locale]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            </div>

            <input
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-hairline bg-surface-1 px-3 text-xs text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder={
                vi
                  ? 'Lọc consolidatedGroupId (tùy chọn)'
                  : 'Filter by consolidatedGroupId (optional)'
              }
            />
          </div>

          {ordersApi.error ? (
            <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
              {ordersApi.error}
              {needsConnect ? (
                <>
                  {' '}
                  <Link
                    to="/app/admin/marketplace"
                    className="font-medium underline"
                  >
                    {vi ? 'Kết nối shop' : 'Connect shop'}
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">
                    <th className="px-4 py-3">{vi ? 'Mã đơn' : 'Order'}</th>
                    <th className="px-4 py-3">{vi ? 'Người nhận' : 'Recipient'}</th>
                    <th className="px-4 py-3">{vi ? 'SP' : 'Items'}</th>
                    <th className="px-4 py-3">{vi ? 'Tổng' : 'Total'}</th>
                    <th className="px-4 py-3">{vi ? 'Gộp' : 'Group'}</th>
                    <th className="px-4 py-3">{vi ? 'Trạng thái' : 'Status'}</th>
                    <th className="px-4 py-3">{vi ? 'Ghi nhận' : 'Created'}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersApi.loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-ink-subtle">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </td>
                    </tr>
                  ) : ordersApi.orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-subtle">
                        {vi
                          ? 'Chưa có đơn. Bấm Đồng bộ ngay nếu shop đã kết nối, hoặc kết nối shop mới.'
                          : 'No orders yet. Sync now if the shop is connected, or connect a new shop.'}
                      </td>
                    </tr>
                  ) : (
                    ordersApi.orders.map((order) => (
                      <tr
                        key={order.id}
                        className="cursor-pointer border-b border-hairline/70 last:border-0 hover:bg-surface-2/60"
                        onClick={() => navigate(`/app/admin/orders/${order.id}`)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">
                            {displayOrderNumber(order)}
                          </p>
                          <p className="font-mono text-[11px] text-ink-tertiary">
                            {order.platform} · {order.shopId}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-ink">{order.recipientName}</p>
                          <p className="text-[11px] text-ink-subtle">
                            {order.recipientCity}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{order.itemCount}</td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {formatCurrency(order.totalAmount, order.currency)}
                        </td>
                        <td className="px-4 py-3">
                          {order.isConsolidated && order.consolidatedGroupId ? (
                            <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-hover">
                              {vi ? 'Đơn gộp' : 'Grouped'}
                            </span>
                          ) : (
                            <span className="text-[11px] text-ink-tertiary">
                              {vi ? 'Đơn lẻ' : 'Standalone'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <MarketplaceOrderStatusBadge
                            status={order.status}
                            locale={locale}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-subtle">
                          {formatDateTime(order.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {ordersApi.nextCursor ? (
              <div className="border-t border-hairline px-4 py-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 min-h-9 text-xs"
                  disabled={ordersApi.loadingMore}
                  onClick={() => void ordersApi.loadMore(listParams)}
                >
                  {ordersApi.loadingMore ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {vi ? 'Xem thêm' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-xl border border-success/30 bg-surface-1 px-4 py-3 text-sm font-medium text-ink shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  )
}
