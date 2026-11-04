import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Store } from 'lucide-react'
import { listMarketplaceShops } from '../../api/marketplace.api'
import { formatApiError } from '../../lib/api'
import type { ConnectedMarketplaceShop } from '../../types/marketplace-orders'
import { Badge } from '../ui/Badge'

const PLATFORMS = [
  { id: 'lazada', label: 'Lazada' },
  { id: 'aurelle', label: 'AURELLE' },
] as const

type ShopRow = ConnectedMarketplaceShop & { platformLabel: string }

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

/** Danh sách shop đọc từ BE. Kết nối và ngắt kết nối do Admin làm ở trang Kết nối sàn. */
export function ConnectedShopsPanel({ isAdmin, vi }: { isAdmin: boolean; vi: boolean }) {
  const [rows, setRows] = useState<ShopRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      PLATFORMS.map((platform) =>
        listMarketplaceShops(platform.id).then((shops) =>
          shops.map((shop) => ({ ...shop, platformLabel: platform.label })),
        ),
      ),
    )
      .then((lists) => {
        if (!cancelled) setRows(lists.flat())
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Store className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
            {vi ? 'Shop đã kết nối' : 'Connected shops'}
          </div>
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            {isAdmin
              ? vi
                ? 'Kết nối hoặc ngắt shop ở trang Kết nối sàn.'
                : 'Connect or disconnect shops on the Marketplace page.'
              : vi
                ? 'Chỉ Admin được kết nối hoặc ngắt shop.'
                : 'Only Admin can connect or disconnect shops.'}
          </p>
        </div>
        {isAdmin ? (
          <Link
            to="/app/admin/marketplace"
            className="text-xs font-medium text-primary-hover hover:underline"
          >
            {vi ? 'Mở Kết nối sàn →' : 'Open Marketplace →'}
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {!error && rows === null ? (
        <p className="flex items-center gap-2 text-sm text-ink-subtle">
          <Loader2 className="h-4 w-4 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </p>
      ) : null}
      {rows !== null && rows.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          {vi ? 'Chưa có shop nào được kết nối.' : 'No shop connected yet.'}
        </p>
      ) : null}
      {rows !== null && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((shop) => (
            <li
              key={`${shop.platformLabel}-${shop.shopId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {shop.shopName ?? shop.shopId}
                </p>
                <p className="text-[11px] text-ink-subtle">
                  {shop.platformLabel} · {vi ? 'Đồng bộ gần nhất' : 'Last sync'}{' '}
                  {formatDateTime(shop.lastPolledAt)}
                </p>
              </div>
              <Badge tone={shop.isActive ? 'success' : 'default'}>
                {shop.isActive
                  ? vi
                    ? 'Đang kết nối'
                    : 'Connected'
                  : vi
                    ? 'Đã ngắt'
                    : 'Disconnected'}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
