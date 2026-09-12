import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MarketplaceOrdersView } from './MarketplaceOrdersView'
import { usePortal } from '../../context/use-portal'
import { useLazadaConnection } from '../../hooks/useLazadaConnection'
import { useMarketplaceOrders } from '../../hooks/useMarketplaceOrders'
import {
  displayOrderNumber,
  isMarketplaceOrderStatus,
  type MarketplaceOrderListItem,
} from '../../types/marketplace-orders'

export type MarketplaceOrdersScreenProps = {
  detailPath: (orderId: string) => string
  marketplacePath?: string
  topBarVariant?: 'ops' | 'admin'
  /** ops = gần UI Đơn đa kênh cũ; admin = giao diện quản trị */
  visualStyle?: 'ops' | 'admin'
  breadcrumbs: { label: string; to?: string }[]
  title: string
  canSync: boolean
}

export function MarketplaceOrdersScreen({
  detailPath,
  marketplacePath = '/app/admin/marketplace',
  topBarVariant = 'ops',
  visualStyle = 'admin',
  breadcrumbs,
  title,
  canSync,
}: MarketplaceOrdersScreenProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const ops = visualStyle === 'ops'
  const connection = useLazadaConnection()
  const ordersApi = useMarketplaceOrders()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [groupId, setGroupId] = useState(
    () => searchParams.get('group')?.trim() ?? '',
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [consolidateView, setConsolidateView] = useState<
    'all' | 'grouped' | 'standalone'
  >('all')
  const [toast, setToast] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  function applyGroupFilter(next: string) {
    setGroupId(next)
    if (next) setSearchParams({ group: next }, { replace: true })
    else setSearchParams({}, { replace: true })
  }

  function resetFilters() {
    setStatusFilter('all')
    setShopFilter('all')
    setSearchTerm('')
    setConsolidateView('all')
    applyGroupFilter('')
  }

  const listParams = useMemo(() => {
    const status = isMarketplaceOrderStatus(statusFilter)
      ? statusFilter
      : undefined
    const rawGroup = groupId.trim()
    const validGroup = /^[a-fA-F0-9]{24}$/.test(rawGroup) ? rawGroup : undefined
    return {
      shop_id: shopFilter === 'all' ? undefined : shopFilter,
      status,
      consolidated_group_id: validGroup,
    }
  }, [groupId, shopFilter, statusFilter])

  useEffect(() => {
    void ordersApi.load(listParams).then((res) => {
      if (!res) return
      const shopIds = [
        ...new Set(res.orders.map((o) => o.shopId).filter(Boolean)),
      ]
      connection.hydrateFromOrderShopIds(shopIds)
    })
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

  const visibleOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return ordersApi.orders.filter((order) => {
      const grouped =
        order.isConsolidated && Boolean(order.consolidatedGroupId)
      if (consolidateView === 'grouped' && !grouped) return false
      if (consolidateView === 'standalone' && grouped) return false
      if (!q) return true
      const hay = [
        displayOrderNumber(order),
        order.platformOrderId,
        order.recipientName,
        order.recipientCity,
        order.shopId,
        order.platform,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [consolidateView, ordersApi.orders, searchTerm])

  const groupedCount = useMemo(
    () =>
      ordersApi.orders.filter(
        (o) => o.isConsolidated && Boolean(o.consolidatedGroupId),
      ).length,
    [ordersApi.orders],
  )
  const standaloneCount = ordersApi.orders.length - groupedCount

  function openDetail(order: MarketplaceOrderListItem) {
    if (ops) {
      setSelectedOrderId(order.id)
      return
    }
    navigate(detailPath(order.id))
  }

  const emptyMessage = vi
    ? canSync
      ? 'Chưa có đơn. Bấm Đồng bộ ngay nếu shop đã kết nối, hoặc kết nối shop mới.'
      : 'Chưa có đơn trong hệ thống. Liên hệ Admin để đồng bộ đơn từ sàn.'
    : canSync
      ? 'No orders yet. Sync now if the shop is connected, or connect a new shop.'
      : 'No orders yet. Ask an Admin to sync orders from the marketplace.'

  const colSpan = ops ? 8 : 7

  return (
    <MarketplaceOrdersView
      locale={locale}
      ops={ops}
      topBarVariant={topBarVariant}
      breadcrumbs={breadcrumbs}
      title={title}
      marketplacePath={marketplacePath}
      canSync={canSync}
      toast={toast}
      onDismissToast={() => setToast(null)}
      consolidateView={consolidateView}
      onConsolidateViewChange={setConsolidateView}
      groupedCount={groupedCount}
      standaloneCount={standaloneCount}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      shopFilter={shopFilter}
      onShopFilterChange={setShopFilter}
      shops={connection.shops}
      onSelectShop={connection.selectShop}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      groupId={groupId}
      onApplyGroupFilter={applyGroupFilter}
      onResetFilters={resetFilters}
      syncing={ordersApi.syncing}
      onSync={() => void handleSync()}
      listParams={listParams}
      ordersCount={ordersApi.orders.length}
      error={ordersApi.error}
      needsConnect={needsConnect}
      visibleOrders={visibleOrders}
      loading={ordersApi.loading}
      loadingMore={ordersApi.loadingMore}
      nextCursor={ordersApi.nextCursor}
      emptyMessage={emptyMessage}
      colSpan={colSpan}
      onOpenDetail={openDetail}
      onPickOrder={(orderId) =>
        navigate(
          `/app/warehouse?orderId=${encodeURIComponent(orderId)}&action=start`,
        )
      }
      onLoadMore={() => void ordersApi.loadMore(listParams)}
      selectedOrderId={selectedOrderId}
      onCloseDetail={() => setSelectedOrderId(null)}
      onOpenOrderId={(id) => setSelectedOrderId(id)}
    />
  )
}
