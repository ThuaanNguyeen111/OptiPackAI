import { Loader2, Plus, RefreshCw, Store, Trash2, Unplug } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/use-auth'
import type { useLazadaConnection } from '../../hooks/useLazadaConnection'
import { formatApiError } from '../../lib/api'
import { UserRole } from '../../types/auth'
import { Button } from '../ui/Button'

type ConnectionApi = ReturnType<typeof useLazadaConnection>

type LazadaConnectPanelProps = {
  api: ConnectionApi
  locale: 'vi' | 'en'
}

export function LazadaConnectPanel({ api, locale }: LazadaConnectPanelProps) {
  const vi = locale === 'vi'
  const { session } = useAuth()
  const isAdmin = session?.role === UserRole.ADMIN
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const waiting = api.phase === 'waiting'
  const opening = api.phase === 'opening'

  function disconnect(shopId: string, shopName: string | null) {
    const label = shopName || shopId
    const ok = window.confirm(
      vi
        ? `Ngắt kết nối shop ${label}? Token hết hiệu lực, đơn đã kéo vẫn giữ. Kết nối lại bằng OAuth.`
        : `Disconnect ${label}? The token stops working. Orders already pulled stay. Reconnect with OAuth.`,
    )
    if (!ok) return
    setDisconnectingId(shopId)
    void api
      .disconnectShop(shopId)
      .catch((err: unknown) => api.setError(formatApiError(err)))
      .finally(() => setDisconnectingId(null))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Store className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
            Lazada
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          className="h-9 min-h-9 text-xs"
          disabled={opening || waiting}
          onClick={() => void api.startConnect()}
        >
          {opening ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {vi ? 'Kết nối shop Lazada' : 'Connect Lazada shop'}
        </Button>
      </div>

      {api.error ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {api.error}
        </p>
      ) : null}

      {waiting ? (
        <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-start gap-2">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-hover" />
            <div>
              <p className="text-sm font-medium text-ink">
                {vi
                  ? 'Đang chờ cấp quyền trên tab Lazada…'
                  : 'Waiting for authorization in the Lazada tab…'}
              </p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px] text-ink-subtle">
                <li>
                  {vi
                    ? 'Đăng nhập seller và bấm Cho phép trên Lazada.'
                    : 'Sign in as the seller and allow access on Lazada.'}
                </li>
                <li>
                  {vi
                    ? 'Link cấp quyền chỉ dùng một lần và hết hạn sau 10 phút. Hết hạn thì bấm Kết nối lại, đừng mở lại link cũ.'
                    : 'The authorization link is single-use and expires after 10 minutes. Request a new one instead of reopening an old link.'}
                </li>
              </ol>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-9 min-h-9 text-xs"
            onClick={api.cancelWaiting}
          >
            {vi ? 'Hủy chờ' : 'Cancel'}
          </Button>
        </div>
      ) : null}

      {api.lastSync ? (
        <p className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-xs text-ink">
          {vi
            ? `Đồng bộ xong: kéo ${api.lastSync.fetched} đơn, cập nhật ${api.lastSync.upserted}, gộp mới ${api.lastSync.newlyConsolidated}.`
            : `Sync finished: fetched ${api.lastSync.fetched}, updated ${api.lastSync.upserted}, newly grouped ${api.lastSync.newlyConsolidated}.`}
        </p>
      ) : null}

      {api.shopsLoading && api.shops.length === 0 ? (
        <p className="inline-flex items-center gap-2 text-xs text-ink-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {vi ? 'Đang đọc shop từ máy chủ…' : 'Loading shops from the server…'}
        </p>
      ) : null}

      {api.shops.length > 0 ? (
        <ul className="space-y-2">
          {api.shops.map((shop) => {
            const active = shop.shopId === api.activeShopId
            return (
              <li
                key={shop.shopId}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-canvas px-4 py-3 ${
                  active
                    ? 'border-primary/40 ring-1 ring-primary/20'
                    : 'border-hairline'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => api.selectShop(shop.shopId)}
                >
                  <p className="text-sm font-semibold text-ink">
                    {shop.shopName || (vi ? 'Shop Lazada' : 'Lazada shop')}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-ink-muted">
                    shopId {shop.shopId}
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] ${
                      shop.isActive === false ? 'text-ink-subtle' : 'text-success'
                    }`}
                  >
                    {shop.isActive === false
                      ? vi
                        ? 'Đã ngắt'
                        : 'Disconnected'
                      : vi
                        ? 'Đang kết nối'
                        : 'Connected'}
                    {shop.isActive === false && shop.disconnectedAt
                      ? ` ${shop.disconnectedAt.slice(0, 16).replace('T', ' ')}`
                      : ''}
                    {shop.lastPolledAt
                      ? ` · ${vi ? 'đồng bộ' : 'synced'} ${shop.lastPolledAt.slice(0, 16).replace('T', ' ')}`
                      : ''}
                  </p>
                  {shop.accessTokenExpiresAt ? (
                    <p className="text-[11px] text-ink-subtle">
                      {vi ? 'Token tới' : 'Token until'}{' '}
                      {shop.accessTokenExpiresAt.slice(0, 16).replace('T', ' ')}
                    </p>
                  ) : null}
                </button>
                <div className="flex items-center gap-2">
                  {active ? (
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary-hover">
                      {vi ? 'Đang chọn' : 'Selected'}
                    </span>
                  ) : null}
                  {shop.fromServer ? (
                    <>
                      {isAdmin && shop.isActive !== false ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 min-h-8 text-xs text-error hover:text-error"
                          disabled={disconnectingId === shop.shopId}
                          onClick={() => disconnect(shop.shopId, shop.shopName)}
                        >
                          {disconnectingId === shop.shopId ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unplug className="mr-1 h-3.5 w-3.5" />
                          )}
                          {vi ? 'Ngắt kết nối' : 'Disconnect'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 min-h-8 text-xs"
                        disabled={api.syncingShopId === shop.shopId || shop.isActive === false}
                        onClick={() => void api.syncShop(shop.shopId)}
                      >
                        {api.syncingShopId === shop.shopId ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        {vi ? 'Đồng bộ ngay' : 'Sync now'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 min-h-8 text-xs text-error hover:text-error"
                      onClick={() => api.forgetShop(shop.shopId)}
                      title={
                        vi
                          ? 'Chỉ ẩn shop lưu trên trình duyệt này'
                          : 'Hides the shop saved in this browser only'
                      }
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {vi ? 'Ẩn' : 'Hide'}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : !waiting ? (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-subtle">
          {vi
            ? 'Máy chủ chưa có shop Lazada nào. Bấm Kết nối shop Lazada — link chỉ sống 10 phút và dùng một lần.'
            : 'The server has no Lazada shop yet. Connect one — the link lasts 10 minutes and can be used once.'}
        </p>
      ) : null}
    </div>
  )
}
