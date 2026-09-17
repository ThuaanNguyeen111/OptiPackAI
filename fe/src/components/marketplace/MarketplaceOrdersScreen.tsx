import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MarketplaceOrdersView } from './MarketplaceOrdersView'
import { usePortal } from '../../context/use-portal'
import { useLazadaConnection } from '../../hooks/useLazadaConnection'
import { useMarketplaceOrders } from '../../hooks/useMarketplaceOrders'
import {
  demoMultiPlatformListOrders,
  isDemoOrderId,
} from '../../data/demo-multi-platform-orders'
import {
  filterActiveGroupMembers,
  formatPlatformOrderIds,
  isMultiPlatformGroup,
  shortGroupCode,
} from '../../lib/consolidation-display'
import {
  displayOrderNumber,
  isMarketplaceOrderStatus,
  type MarketplaceOrderListItem,
} from '../../types/marketplace-orders'

export type GroupMeta = {
  multiPlatform: boolean
  orderIdsText: string
  count: number
  groupCode: string
  members: MarketplaceOrderListItem[]
}

export type MarketplaceOrdersScreenProps = {
  detailPath: (orderId: string) => string
  marketplacePath?: string
  topBarVariant?: 'ops' | 'admin'
  /** ops = gần UI Đơn đa kênh cũ; admin = giao diện quản trị */
  visualStyle?: 'ops' | 'admin'
  breadcrumbs: { label: string; to?: string }[]
  title: string
  canSync: boolean
  /** false = ẩn CTA Lấy hàng (Owner whitelist không có /app/warehouse) */
  canPick?: boolean
}

export function MarketplaceOrdersScreen({
  detailPath,
  marketplacePath = '/app/admin/marketplace',
  topBarVariant = 'ops',
  visualStyle = 'admin',
  breadcrumbs,
  title,
  canSync,
  canPick = true,
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

  /** Live Lazada + FE demo gộp đa sàn (giày+áo Lazada · quần TikTok) */
  const allOrders = useMemo(() => {
    const live = ordersApi.orders
    const demoIds = new Set(demoMultiPlatformListOrders.map((o) => o.id))
    const withoutDup = live.filter((o) => !demoIds.has(o.id))
    return [...demoMultiPlatformListOrders, ...withoutDup]
  }, [ordersApi.orders])

  const groupMembersById = useMemo(() => {
    const map = new Map<string, MarketplaceOrderListItem[]>()
    for (const order of allOrders) {
      if (!order.isConsolidated || !order.consolidatedGroupId) continue
      const key = order.consolidatedGroupId
      const list = map.get(key) ?? []
      list.push(order)
      map.set(key, list)
    }
    const cleaned = new Map<string, MarketplaceOrderListItem[]>()
    for (const [key, list] of map) {
      cleaned.set(key, filterActiveGroupMembers(key, list))
    }
    return cleaned
  }, [allOrders])

  const groupMetaById = useMemo(() => {
    const meta = new Map<string, GroupMeta>()
    for (const [key, members] of groupMembersById) {
      meta.set(key, {
        multiPlatform: isMultiPlatformGroup(members),
        count: members.length,
        groupCode: shortGroupCode(key),
        members,
        orderIdsText: formatPlatformOrderIds(
          members.map((m) => ({
            id: m.id,
            platform: m.platform,
            platformOrderId: m.platformOrderId,
            platformOrderNumber: m.platformOrderNumber,
            status: m.status,
          })),
          locale,
        ),
      })
    }
    return meta
  }, [groupMembersById, locale])

  const visibleOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    const seenMultiGroups = new Set<string>()
    const rows: MarketplaceOrderListItem[] = []

    for (const order of allOrders) {
      const grouped =
        order.isConsolidated && Boolean(order.consolidatedGroupId)
      const meta = order.consolidatedGroupId
        ? groupMetaById.get(order.consolidatedGroupId)
        : undefined

      // Demo đa sàn (≥2 nền tảng) → 1 dòng / nhóm. Live cùng sàn: mỗi đơn 1 dòng.
      if (grouped && meta?.multiPlatform && order.consolidatedGroupId) {
        if (seenMultiGroups.has(order.consolidatedGroupId)) continue
        seenMultiGroups.add(order.consolidatedGroupId)
      }

      // Tab Đơn gộp = mọi isConsolidated (khớp BE cùng sàn); demo đa sàn cũng nằm đây.
      if (consolidateView === 'grouped') {
        if (!grouped) continue
      }
      if (consolidateView === 'standalone') {
        if (grouped) continue
      }
      if (groupId.trim() && order.consolidatedGroupId !== groupId.trim()) {
        continue
      }

      if (q) {
        const memberHay =
          meta?.members
            ?.map((m) =>
              [
                displayOrderNumber(m),
                m.platformOrderId,
                m.platform,
                m.recipientName,
              ].join(' '),
            )
            .join(' ') ?? ''
        const hay = [
          displayOrderNumber(order),
          order.platformOrderId,
          order.recipientName,
          order.recipientCity,
          order.shopId,
          order.platform,
          meta?.orderIdsText ?? '',
          meta?.groupCode ?? '',
          memberHay,
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) continue
      }

      rows.push(order)
    }
    return rows
  }, [allOrders, consolidateView, groupId, groupMetaById, searchTerm])

  /** Số nhóm gộp (live cùng sàn + demo đa sàn). */
  const groupedCount = useMemo(() => groupMetaById.size, [groupMetaById])
  const standaloneCount = useMemo(() => {
    let inGroups = 0
    for (const meta of groupMetaById.values()) {
      inGroups += meta.count
    }
    return Math.max(0, allOrders.length - inGroups)
  }, [allOrders.length, groupMetaById])

  function openDetail(order: MarketplaceOrderListItem) {
    // Demo đa sàn → trang chi tiết đầy đủ (drawer API không có bản ghi demo)
    if (isDemoOrderId(order.id) || !ops) {
      navigate(detailPath(order.id))
      return
    }
    setSelectedOrderId(order.id)
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
      ordersCount={allOrders.length}
      error={ordersApi.error}
      needsConnect={needsConnect}
      visibleOrders={visibleOrders}
      groupMetaById={groupMetaById}
      showDemoBanner
      loading={ordersApi.loading}
      loadingMore={ordersApi.loadingMore}
      nextCursor={ordersApi.nextCursor}
      emptyMessage={emptyMessage}
      colSpan={colSpan}
      onOpenDetail={openDetail}
      canPick={canPick}
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
