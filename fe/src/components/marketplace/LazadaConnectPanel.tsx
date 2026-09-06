import { useState, type FormEvent } from 'react'
import {
  KeyRound,
  Loader2,
  Plus,
  Store,
  Trash2,
} from 'lucide-react'
import type { useLazadaConnection } from '../../hooks/useLazadaConnection'
import { Button } from '../ui/Button'

type ConnectionApi = ReturnType<typeof useLazadaConnection>

type LazadaConnectPanelProps = {
  api: ConnectionApi
  locale: 'vi' | 'en'
  onConnected?: (shopId: string) => void
}

export function LazadaConnectPanel({
  api,
  locale,
  onConnected,
}: LazadaConnectPanelProps) {
  const vi = locale === 'vi'
  const [pasteValue, setPasteValue] = useState('')
  const waiting = api.phase === 'waiting' || api.phase === 'saving'
  const opening = api.phase === 'opening'

  function handleConfirmPaste(e: FormEvent) {
    e.preventDefault()
    const saved = api.confirmCallbackText(pasteValue)
    if (saved) {
      const shopId = parseShopIdPreview(pasteValue)
      setPasteValue('')
      if (shopId) onConnected?.(shopId)
    }
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
        <form
          onSubmit={handleConfirmPaste}
          className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
        >
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
                    ? 'Tab mới sẽ hiện JSON (BE chưa redirect về FE). Copy toàn bộ JSON.'
                    : 'The new tab will show JSON (backend does not redirect yet). Copy the whole JSON.'}
                </li>
                <li>
                  {vi
                    ? 'Dán vào ô dưới rồi xác nhận — có thể đóng tab JSON sau đó.'
                    : 'Paste it below and confirm — you can then close the JSON tab.'}
                </li>
              </ol>
            </div>
          </div>
          <textarea
            className="min-h-24 w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder='{ "platform": "lazada", "shopId": "201171264532", "shopName": "...", "connected": true }'
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              className="h-9 min-h-9 text-xs"
              disabled={api.phase === 'saving' || !pasteValue.trim()}
            >
              {api.phase === 'saving' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              )}
              {vi ? 'Xác nhận đã kết nối' : 'Confirm connected'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 min-h-9 text-xs"
              onClick={api.cancelWaiting}
            >
              {vi ? 'Hủy chờ' : 'Cancel'}
            </Button>
          </div>
        </form>
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
                  <p className="mt-0.5 text-[11px] text-success">
                    {vi ? 'Đã kết nối' : 'Connected'}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  {active ? (
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary-hover">
                      Active
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 min-h-8 text-xs text-error hover:text-error"
                    onClick={() => api.forgetShop(shop.shopId)}
                    title={
                      vi
                        ? 'Chỉ xóa shopId trên trình duyệt này — không ngắt kết nối phía BE'
                        : 'Only removes shopId in this browser — does not disconnect on the backend'
                    }
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {vi ? 'Ẩn' : 'Hide'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : !waiting ? (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-subtle">
          {vi
            ? 'Chưa lưu shopId trên trình duyệt này. Nếu shop đã connect từ trước, mở Đơn hàng rồi Đồng bộ / tải danh sách — shopId sẽ được lấy từ đơn. Nếu là shop mới, bấm Kết nối shop Lazada.'
            : 'No shopId saved in this browser yet. If the shop was connected earlier, open Orders and sync/load — shopId will be taken from orders. For a new shop, click Connect Lazada shop.'}
        </p>
      ) : null}
    </div>
  )
}

function parseShopIdPreview(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (/^\d{6,}$/.test(trimmed)) return trimmed
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) {
      const shopId = (parsed as { shopId?: unknown }).shopId
      return typeof shopId === 'string' ? shopId : undefined
    }
  } catch {
    return undefined
  }
  return undefined
}
