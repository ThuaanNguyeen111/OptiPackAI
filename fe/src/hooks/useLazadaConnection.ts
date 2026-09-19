import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLazadaConnectUrl } from '../api/marketplace.api'
import { formatApiError } from '../lib/api'
import {
  getActiveLazadaShopId,
  isLazadaOAuthErrorNotice,
  isLazadaOAuthSuccessNotice,
  LAZADA_ACTIVE_SHOP_STORAGE_KEY,
  LAZADA_SHOPS_STORAGE_KEY,
  loadLazadaShops,
  removeLazadaShop,
  setActiveLazadaShopId,
  upsertLazadaShop,
} from '../lib/lazada-shop'
import {
  formatMarketplaceOAuthError,
  LAZADA_OAUTH_CHANNEL,
  type StoredLazadaShop,
} from '../types/marketplace-orders'

export type LazadaConnectPhase = 'idle' | 'opening' | 'waiting'

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

  useEffect(() => {
    function applyNotice(data: unknown): void {
      if (isLazadaOAuthSuccessNotice(data)) {
        rememberShop({
          shopId: data.shopId,
          shopName: data.shopName,
          connectedAt: new Date().toISOString(),
        })
        connectTabRef.current?.close()
        connectTabRef.current = null
        return
      }
      if (isLazadaOAuthErrorNotice(data)) {
        setPhase('idle')
        setError(formatMarketplaceOAuthError(data.error))
        connectTabRef.current?.close()
        connectTabRef.current = null
      }
    }

    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return
      applyNotice(event.data)
    }

    window.addEventListener('message', onMessage)

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(LAZADA_OAUTH_CHANNEL)
      channel.addEventListener('message', (event: MessageEvent) => {
        applyNotice(event.data)
      })
    } catch {
      channel = null
    }

    return () => {
      window.removeEventListener('message', onMessage)
      channel?.close()
    }
  }, [rememberShop])

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (
        event.key !== LAZADA_SHOPS_STORAGE_KEY &&
        event.key !== LAZADA_ACTIVE_SHOP_STORAGE_KEY
      ) {
        return
      }
      const known = shopsBeforeConnectRef.current
      refreshFromStorage()
      const added = loadLazadaShops().some((shop) => !known.has(shop.shopId))
      if (!added) return
      setPhase('idle')
      setError(null)
      connectTabRef.current?.close()
      connectTabRef.current = null
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refreshFromStorage])

  useEffect(() => {
    if (phase !== 'waiting') return

    const pollId = window.setInterval(() => {
      const tab = connectTabRef.current
      if (!tab || !tab.closed) return
      connectTabRef.current = null
      window.setTimeout(() => {
        setPhase((current) => (current === 'waiting' ? 'idle' : current))
      }, 400)
    }, 400)

    return () => window.clearInterval(pollId)
  }, [phase])

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
        window.location.assign(authUrl)
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
    selectShop,
    forgetShop,
    hydrateFromOrderShopIds,
    refreshFromStorage,
    rememberShop,
  }
}
