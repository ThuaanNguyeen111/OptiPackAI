import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Store } from 'lucide-react'
import { fetchMarketplaceConnectUrl, listMarketplaceShops } from '../../api/marketplace.api'
import { syncPlatformOrders } from '../../api/orders.api'
import { useAuth } from '../../context/use-auth'
import { formatApiError } from '../../lib/api'
import { UserRole } from '../../types/auth'
import type { ConnectedMarketplaceShop } from '../../types/marketplace-orders'
import { Button } from '../ui/Button'

type AurelleConnectPanelProps = {
  locale: 'vi' | 'en'
}

export function AurelleConnectPanel({ locale }: AurelleConnectPanelProps) {
  const vi = locale === 'vi'
  const { session } = useAuth()
  const isAdmin = session?.role === UserRole.ADMIN
  const [shops, setShops] = useState<ConnectedMarketplaceShop[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  async function refresh() {
    const rows = await listMarketplaceShops('aurelle')
    setShops(rows)
  }

  useEffect(() => {
    let cancelled = false
    void listMarketplaceShops('aurelle')
      .then((rows) => {
        if (!cancelled) setShops(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  function startConnect() {
    setBusy(true)
    setError(null)
    setNotice(null)
    void fetchMarketplaceConnectUrl('aurelle')
      .then(({ authUrl }) => {
        const popup = window.open(authUrl, 'optipack-aurelle-connect')
        if (!popup) {
          setError(
            vi
              ? 'Trình duyệt chặn cửa sổ kết nối. Cho phép popup rồi thử lại.'
              : 'The browser blocked the connect window. Allow popups and try again.',
          )
          return
        }
        const timer = window.setInterval(() => {
          if (!popup.closed) return
          window.clearInterval(timer)
          void refresh().catch((err: unknown) => setError(formatApiError(err)))
        }, 1000)
      })
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  function syncShop(shopId: string) {
    setSyncingId(shopId)
    setError(null)
    setNotice(null)
    void syncPlatformOrders('aurelle', shopId)
      .then((result) => {
        setNotice(
          vi
            ? `Đã kéo ${result.fetched} đơn, ghi ${result.upserted}.`
            : `Fetched ${result.fetched}, saved ${result.upserted}.`,
        )
        return refresh()
      })
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setSyncingId(null))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Store className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
          AURELLE
        </div>
        <Button
          type="button"
          variant="primary"
          className="h-9 min-h-9 text-xs"
          disabled={busy}
          onClick={startConnect}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {vi ? 'Kết nối shop AURELLE' : 'Connect AURELLE shop'}
        </Button>
      </div>
      {error ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          {notice}
        </p>
      ) : null}
      {shops.length === 0 ? (
        <p className="text-xs text-ink-muted">
          {vi ? 'Chưa có shop AURELLE trên máy chủ.' : 'No AURELLE shop on the server yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shops.map((shop) => (
            <li
              key={shop.shopId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {shop.shopName || shop.shopId}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {shop.shopId}
                  {shop.isActive ? '' : vi ? ' · đã ngắt' : ' · disconnected'}
                  {shop.lastPolledAt
                    ? ` · ${vi ? 'đồng bộ' : 'synced'} ${shop.lastPolledAt}`
                    : ''}
                </p>
              </div>
              {isAdmin ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled={shop.isActive === false || syncingId === shop.shopId}
                  onClick={() => syncShop(shop.shopId)}
                >
                  {syncingId === shop.shopId ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {vi ? 'Đồng bộ ngay' : 'Sync now'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
