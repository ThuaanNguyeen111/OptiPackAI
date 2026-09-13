import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLazadaConnectUrl } from '../api/marketplace.api'
import { listOrders } from '../api/orders.api'
import { formatApiError } from '../lib/api'
import {
  getActiveLazadaShopId,
  loadLazadaShops,
  parseLazadaCallbackPayload,
  removeLazadaShop,
  setActiveLazadaShopId,
  upsertLazadaShop,
} from '../lib/lazada-shop'
import {
  LAZADA_OAUTH_MESSAGE_TYPE,
  type StoredLazadaShop,
} from '../types/marketplace-orders'

export type LazadaConnectPhase = 'idle' | 'opening' | 'waiting' | 'saving'

export function useLazadaConnection() {
  const [shops, setShops] = useState<StoredLazadaShop[]>(() => loadLazadaShops())
  const [activeShopId, setActiveShopIdState] = useState<string | null>(() =>
    getActiveLazadaShopId(),
  )
  const [phase, setPhase] = useState<LazadaConnectPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const connectTabRef = useRef<Window | null>(null)
  const shopsBeforeConnectRef = useRef<Set<string>>(new Set())

  const refreshFromStorage = useCallback(() => {
    setShops(loadLazadaShops())
    setActiveShopIdState(getActiveLazadaShopId())
  }, [])

  const rememberShop = useCallback((shop: StoredLazadaShop) => {
    const next = upsertLazadaShop(shop)
    setShops(next)
    setActiveShopIdState(shop.shopId)
    setPhase('idle')
    setError(null)
    return shop
  }, [])

  const applyCallbackPayload = useCallback(
    (raw: string): StoredLazadaShop | null => {
      const parsed = parseLazadaCallbackPayload(raw)
      if (!parsed) return null
      rememberShop(parsed)
      return parsed
    },
    [rememberShop],
  )

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data: unknown = event.data
      if (typeof data !== 'object' || data === null) return
      const rec = data as Record<string, unknown>
      if (rec.type !== LAZADA_OAUTH_MESSAGE_TYPE) return
      if (typeof rec.shopId !== 'string' || !rec.shopId) return
      rememberShop({
        shopId: rec.shopId,
        shopName: typeof rec.shopName === 'string' ? rec.shopName : null,
        connectedAt: new Date().toISOString(),
      })
      connectTabRef.current?.close()
      connectTabRef.current = null
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [rememberShop])

  useEffect(() => {
    if (phase !== 'waiting') return

    const pollId = window.setInterval(() => {
      const tab = connectTabRef.current
      if (tab && tab.closed) {
        connectTabRef.current = null
      }

      void listOrders({ limit: 20 })
        .then((res) => {
          const known = shopsBeforeConnectRef.current
          for (const order of res.orders) {
            if (!order.shopId || known.has(order.shopId)) continue
            rememberShop({
              shopId: order.shopId,
              shopName: null,
              connectedAt: new Date().toISOString(),
            })
            return
          }
        })
        .catch(() => {
          /* poll im lặng — lỗi sẽ hiện khi user bấm Đồng bộ / tải đơn */
        })
    }, 4000)

    return () => window.clearInterval(pollId)
  }, [phase, rememberShop])

  const startConnect = useCallback(async () => {
    setError(null)
    setPhase('opening')
    shopsBeforeConnectRef.current = new Set(
      loadLazadaShops().map((shop) => shop.shopId),
    )
    try {
      const { authUrl } = await fetchLazadaConnectUrl()
      const tab = window.open(authUrl, 'optipack-lazada-connect')
      if (!tab) {
        setPhase('idle')
        setError(
          'Trình duyệt đã chặn tab mới. Hãy cho phép popup rồi bấm Kết nối lại.',
        )
        return
      }
      connectTabRef.current = tab
      setPhase('waiting')
    } catch (err: unknown) {
      setPhase('idle')
      setError(formatApiError(err))
    }
  }, [])

  const cancelWaiting = useCallback(() => {
    setPhase('idle')
    connectTabRef.current = null
  }, [])

  const confirmCallbackText = useCallback(
    (raw: string): boolean => {
      setPhase('saving')
      const saved = applyCallbackPayload(raw)
      if (!saved) {
        setPhase('waiting')
        setError(
          'Không đọc được JSON callback. Hãy copy nguyên nội dung trang JSON (có shopId và connected: true).',
        )
        return false
      }
      return true
    },
    [applyCallbackPayload],
  )

  const selectShop = useCallback((shopId: string) => {
    setActiveLazadaShopId(shopId)
    setActiveShopIdState(shopId)
  }, [])

  const forgetShop = useCallback((shopId: string) => {
    const next = removeLazadaShop(shopId)
    setShops(next)
    setActiveShopIdState(getActiveLazadaShopId())
  }, [])

  const hydrateFromOrderShopIds = useCallback((shopIds: string[]) => {
    if (shopIds.length === 0) return
    let next = loadLazadaShops()
    let changed = false
    for (const shopId of shopIds) {
      if (!shopId || next.some((s) => s.shopId === shopId)) continue
      next = upsertLazadaShop({
        shopId,
        shopName: null,
        connectedAt: new Date().toISOString(),
      })
      changed = true
    }
    if (!changed) return
    setShops(next)
    setActiveShopIdState(getActiveLazadaShopId())
  }, [])

  const activeShop =
    shops.find((shop) => shop.shopId === activeShopId) ?? shops[0] ?? null

  return {
    shops,
    activeShop,
    activeShopId: activeShop?.shopId ?? null,
    phase,
    error,
    setError,
    startConnect,
    cancelWaiting,
    confirmCallbackText,
    selectShop,
    forgetShop,
    hydrateFromOrderShopIds,
    refreshFromStorage,
    rememberShop,
  }
}
