import { useCallback, useState } from 'react'
import { getOrderById, listOrders, syncLazadaOrders } from '../api/orders.api'
import { formatApiError, getApiErrorCode } from '../lib/api'
import type {
  ListOrdersParams,
  MarketplaceOrderDetail,
  MarketplaceOrderListItem,
  SyncLazadaResult,
} from '../types/marketplace-orders'

const PAGE_LIMIT = 20

export function useMarketplaceOrders() {
  const [orders, setOrders] = useState<MarketplaceOrderListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<SyncLazadaResult | null>(null)

  const captureError = useCallback((err: unknown) => {
    setError(formatApiError(err))
    setErrorCode(getApiErrorCode(err))
  }, [])

  const load = useCallback(async (params: ListOrdersParams = {}) => {
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const res = await listOrders({ ...params, limit: params.limit ?? PAGE_LIMIT })
      setOrders(res.orders)
      setNextCursor(res.nextCursor)
      return res
    } catch (err: unknown) {
      captureError(err)
      setOrders([])
      setNextCursor(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [captureError])

  const loadMore = useCallback(
    async (params: Omit<ListOrdersParams, 'before'> = {}) => {
      if (!nextCursor || loadingMore) return
      setLoadingMore(true)
      setError(null)
      try {
        const res = await listOrders({
          ...params,
          before: nextCursor,
          limit: params.limit ?? PAGE_LIMIT,
        })
        setOrders((prev) => [...prev, ...res.orders])
        setNextCursor(res.nextCursor)
      } catch (err: unknown) {
        captureError(err)
      } finally {
        setLoadingMore(false)
      }
    },
    [captureError, loadingMore, nextCursor],
  )

  const sync = useCallback(async (shopId: string, after?: ListOrdersParams) => {
    setSyncing(true)
    setError(null)
    setErrorCode(null)
    setLastSync(null)
    try {
      const result = await syncLazadaOrders(shopId)
      setLastSync(result)
      await load(after ?? { shop_id: shopId })
      return result
    } catch (err: unknown) {
      captureError(err)
      return null
    } finally {
      setSyncing(false)
    }
  }, [captureError, load])

  const loadDetail = useCallback(
    async (id: string): Promise<MarketplaceOrderDetail | null> => {
      try {
        return await getOrderById(id)
      } catch (err: unknown) {
        captureError(err)
        return null
      }
    },
    [captureError],
  )

  return {
    orders,
    nextCursor,
    loading,
    loadingMore,
    syncing,
    error,
    errorCode,
    lastSync,
    setError,
    load,
    loadMore,
    sync,
    loadDetail,
  }
}
