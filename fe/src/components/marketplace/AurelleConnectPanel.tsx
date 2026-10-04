import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyRound, Loader2, Plus, RefreshCw, Store } from 'lucide-react'
import {
  fetchConnectUrl,
  fetchConnectedShops,
  syncPlatformOrders,
  type ConnectedMarketplaceShop,
} from '../../api/marketplace.api'
import { formatApiError } from '../../lib/api'
import { MARKETPLACE_OAUTH_MESSAGE_TYPE } from '../../types/marketplace-orders'
import { Button } from '../ui/Button'

type Props = { locale: 'vi' | 'en' }

type ShopState = 'connected' | 'token_expired' | 'disconnected'

function shopState(shop: ConnectedMarketplaceShop, now: number): ShopState {
  if (!shop.isActive) return 'disconnected'
  // Access token hết hạn vẫn tự làm mới được nếu refresh token còn hạn.
  if (new Date(shop.refreshTokenExpiresAt).getTime() <= now) return 'token_expired'
  return 'connected'
}

function formatDateTime(iso: string | null, vi: boolean): string {
  if (!iso) return vi ? 'chưa có' : 'never'
  return new Date(iso).toLocaleString(vi ? 'vi-VN' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Kết nối AURELLE qua Open API (app key + OAuth seller). Trạng thái đọc thật
 * từ `marketplace_shops` qua `GET /marketplace/aurelle/shops`, không lưu
 * localStorage như khung Lazada cũ.
 */
export function AurelleConnectPanel({ locale }: Props) {
  const vi = locale === 'vi'
  const [shops, setShops] = useState<ConnectedMarketplaceShop[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [syncingShopId, setSyncingShopId] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const tabRef = useRef<Window | null>(null)

  const reload = useCallback(() => {
    return fetchConnectedShops('aurelle')
      .then((list) => {
        setShops(list)
        setLoadError(null)
        return list
      })
      .catch((err: unknown) => {
        setLoadError(formatApiError(err))
        return null
      })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Tab OAuth báo về qua postMessage (MarketplaceOAuthSuccessPage).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data: unknown = event.data
      if (typeof data !== 'object' || data === null) return
      const rec = data as Record<string, unknown>
      if (rec.type !== MARKETPLACE_OAUTH_MESSAGE_TYPE || rec.platform !== 'aurelle') return
      setWaiting(false)
      tabRef.current = null
      void reload()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [reload])

  // Dự phòng khi postMessage không tới (tab bị đóng tay, khác cửa sổ...).
  useEffect(() => {
    if (!waiting) return
    const before = new Set((shops ?? []).map((s) => `${s.shopId}:${s.connectedAt ?? ''}`))
    const id = window.setInterval(() => {
      void fetchConnectedShops('aurelle')
        .then((list) => {
          setShops(list)
          if (list.some((s) => !before.has(`${s.shopId}:${s.connectedAt ?? ''}`))) {
            setWaiting(false)
          }
        })
        .catch(() => {
          /* thăm dò im lặng */
        })
    }, 4000)
    return () => window.clearInterval(id)
    // chỉ chụp danh sách lúc bắt đầu chờ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting])

  async function startConnect() {
    setActionError(null)
    setOpening(true)
    try {
      const { authUrl } = await fetchConnectUrl('aurelle')
      const tab = window.open(authUrl, 'optipack-aurelle-connect')
      if (!tab) {
        setActionError(
          vi
            ? 'Trình duyệt đã chặn tab mới. Hãy cho phép popup rồi bấm lại.'
            : 'The browser blocked the popup. Allow popups and try again.',
        )
        return
      }
      tabRef.current = tab
      setWaiting(true)
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setOpening(false)
    }
  }

  async function syncShop(shopId: string) {
    setActionError(null)
    setSyncNote(null)
    setSyncingShopId(shopId)
    try {
      const res = await syncPlatformOrders('aurelle', shopId)
      setSyncNote(
        vi
          ? `Đã đồng bộ: lấy ${res.fetched} đơn, cập nhật ${res.upserted}.`
          : `Synced: fetched ${res.fetched}, upserted ${res.upserted}.`,
      )
      await reload()
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setSyncingShopId(null)
    }
  }

  const stateLabel: Record<ShopState, { text: string; cls: string }> = {
    connected: {
      text: vi ? 'Đã kết nối' : 'Connected',
      cls: 'border-success/25 bg-success/10 text-success',
    },
    token_expired: {
      text: vi ? 'Hết hạn, cần kết nối lại' : 'Expired, reconnect',
      cls: 'border-amber-300/60 bg-amber-50 text-amber-700',
    },
    disconnected: {
      text: vi ? 'Đã ngắt kết nối' : 'Disconnected',
      cls: 'border-error/30 bg-error/5 text-error',
    },
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Store className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
            AURELLE
            <span className="font-normal text-ink-muted">· Open API</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {vi
              ? 'Kết nối bằng app key của OptiPack, seller cấp quyền qua OAuth. Đơn được kéo về theo lịch 10 phút.'
              : 'Uses the OptiPack app key with seller OAuth consent. Orders are pulled every 10 minutes.'}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="h-9 min-h-9 text-xs"
          disabled={opening || waiting}
          onClick={() => void startConnect()}
        >
          {opening ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {vi ? 'Kết nối shop AURELLE' : 'Connect AURELLE shop'}
        </Button>
      </div>

      {actionError ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {actionError}
        </p>
      ) : null}
      {syncNote ? (
        <p className="rounded-lg border border-success/25 bg-success/5 px-3 py-2 text-xs text-success">
          {syncNote}
        </p>
      ) : null}

      {waiting ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs text-ink">
            <Loader2 className="h-4 w-4 animate-spin text-primary-hover" />
            {vi
              ? 'Đang chờ seller cấp quyền ở tab AURELLE…'
              : 'Waiting for the seller to authorize in the AURELLE tab…'}
          </div>
          <button
            type="button"
            className="text-xs text-ink-muted underline-offset-2 hover:underline"
            onClick={() => setWaiting(false)}
          >
            {vi ? 'Huỷ' : 'Cancel'}
          </button>
        </div>
      ) : null}

      {loadError ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {loadError}
        </p>
      ) : shops === null ? (
        <p className="text-xs text-ink-muted">{vi ? 'Đang tải…' : 'Loading…'}</p>
      ) : shops.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-muted">
          <KeyRound className="h-4 w-4" strokeWidth={1.75} />
          {vi
            ? 'Chưa có shop AURELLE nào kết nối. App key chỉ định danh ứng dụng; cần seller cấp quyền thì mới kéo đơn được.'
            : 'No AURELLE shop connected yet. The app key identifies the app; a seller must authorize before orders can be pulled.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {shops.map((shop) => {
            const state = shopState(shop, now)
            const label = stateLabel[state]
            return (
              <li
                key={shop.shopId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {shop.shopName ?? 'Shop AURELLE'}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">
                    shopId {shop.shopId} · {shop.environment}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {vi ? 'Kết nối' : 'Connected'} {formatDateTime(shop.connectedAt, vi)} ·{' '}
                    {vi ? 'Đồng bộ gần nhất' : 'Last sync'} {formatDateTime(shop.lastPolledAt, vi)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${label.cls}`}
                  >
                    {label.text}
                  </span>
                  {state === 'connected' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 min-h-8 text-xs"
                      disabled={syncingShopId !== null}
                      onClick={() => void syncShop(shop.shopId)}
                    >
                      <RefreshCw
                        className={`mr-1.5 h-3.5 w-3.5 ${syncingShopId === shop.shopId ? 'animate-spin' : ''}`}
                      />
                      {vi ? 'Đồng bộ ngay' : 'Sync now'}
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
