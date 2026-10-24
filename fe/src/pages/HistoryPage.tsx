import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, Download, Loader2, RefreshCw } from 'lucide-react'
import {
  exportHistoryCsv,
  getOrderGroupTimeline,
  historyShippingLine,
  listHistory,
  listHistoryCategories,
  type HistoryCategoryOption,
  type HistoryItem,
  type HistoryQuery,
} from '../api/history.api'
import { fetchUsers } from '../api/users.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import type { AdminUser } from '../types/admin'
import { UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'

function historyDayKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleDateString('en-CA')
}

function historyDayHeading(iso: string, vi: boolean): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return vi ? 'Không rõ ngày' : 'Unknown date'
  const label = new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  return label.charAt(0).toLocaleUpperCase(vi ? 'vi-VN' : 'en-GB') + label.slice(1)
}

function groupHistoryByDay(
  rows: HistoryItem[],
): { key: string; headingIso: string; items: HistoryItem[] }[] {
  const groups: { key: string; headingIso: string; items: HistoryItem[] }[] = []
  for (const item of rows) {
    const key = historyDayKey(item.occurredAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      groups.push({ key, headingIso: item.occurredAt, items: [item] })
    }
  }
  return groups
}

function formatDetailValue(value: unknown): string {
  if (value == null) return '—'
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function dateToIsoStart(value: string): string | undefined {
  if (!value) return undefined
  return `${value}T00:00:00.000Z`
}

function dateToIsoEnd(value: string): string | undefined {
  if (!value) return undefined
  return `${value}T23:59:59.999Z`
}

export function HistoryPage({
  shell = 'portal',
}: {
  shell?: 'portal' | 'admin'
} = {}) {
  const { locale } = usePortal()
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const vi = locale === 'vi'
  const canExport =
    session?.role === UserRole.ADMIN || session?.role === UserRole.STORE_OWNER
  const canFilterActor = canExport
  const presetGroup = searchParams.get('group') ?? ''

  const [tab, setTab] = useState<'list' | 'timeline'>(
    presetGroup ? 'timeline' : 'list',
  )
  const [categories, setCategories] = useState<HistoryCategoryOption[]>([])
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sku, setSku] = useState('')
  const [orderCode, setOrderCode] = useState('')
  const [mine, setMine] = useState(false)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timelineGroupId, setTimelineGroupId] = useState(presetGroup)
  const [timelineItems, setTimelineItems] = useState<HistoryItem[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [actorId, setActorId] = useState('')
  const [actors, setActors] = useState<AdminUser[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const query = useMemo((): HistoryQuery => {
    return {
      ...(category ? { category } : {}),
      ...(dateToIsoStart(from) ? { from: dateToIsoStart(from) } : {}),
      ...(dateToIsoEnd(to) ? { to: dateToIsoEnd(to) } : {}),
      ...(sku.trim() ? { sku: sku.trim() } : {}),
      ...(orderCode.trim() ? { order_code: orderCode.trim() } : {}),
      ...(mine ? { mine: true } : {}),
      ...(canFilterActor && actorId ? { actor_id: actorId } : {}),
      limit: 50,
    }
  }, [category, from, to, sku, orderCode, mine, actorId, canFilterActor])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listHistory(query)
      setItems(res.items)
      setNextBefore(res.nextBefore)
      if (res.categories.length > 0) setCategories(res.categories)
    } catch (err: unknown) {
      setError(formatApiError(err))
      setItems([])
      setNextBefore(null)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void listHistoryCategories()
        .then(setCategories)
        .catch(() => undefined)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!canFilterActor) return
    const timer = window.setTimeout(() => {
      void fetchUsers({ limit: 100 })
        .then((res) => setActors(res.users))
        .catch(() => setActors([]))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [canFilterActor])

  useEffect(() => {
    if (tab !== 'list') return
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load, tab])

  const loadTimeline = useCallback(async (groupId: string) => {
    const id = groupId.trim()
    if (!id) return
    setTimelineLoading(true)
    setTimelineError(null)
    try {
      const res = await getOrderGroupTimeline(id)
      setTimelineItems(res.items)
    } catch (err: unknown) {
      setTimelineError(formatApiError(err))
      setTimelineItems([])
    } finally {
      setTimelineLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'timeline' || !timelineGroupId.trim()) return
    const timer = window.setTimeout(() => {
      void loadTimeline(timelineGroupId)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tab, timelineGroupId, loadTimeline])

  async function loadMore(): Promise<void> {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const res = await listHistory({ ...query, before: nextBefore })
      setItems((current) => [...current, ...res.items])
      setNextBefore(res.nextBefore)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function onExport(): Promise<void> {
    setExporting(true)
    setError(null)
    try {
      const blob = await exportHistoryCsv(query)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lich-su-thao-tac.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <PortalTopBar
        variant={shell === 'admin' ? 'admin' : 'ops'}
        breadcrumbs={
          shell === 'admin'
            ? [
                { label: 'OptiPackAI', to: '/app/admin' },
                { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
                { label: vi ? 'Lịch sử' : 'History' },
              ]
            : [
                { label: 'OptiPackAI', to: '/app' },
                { label: vi ? 'Lịch sử' : 'History' },
              ]
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Clock className="h-5 w-5 text-primary" />
              {vi ? 'Lịch sử thao tác' : 'Activity history'}
            </h1>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  tab === 'list' ? void load() : void loadTimeline(timelineGroupId)
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                {vi ? 'Tải lại' : 'Reload'}
              </button>
              {canExport && tab === 'list' ? (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void onExport()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm disabled:opacity-50"
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {vi ? 'Xuất CSV' : 'Export CSV'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('list')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'list'
                  ? 'bg-primary text-white'
                  : 'border border-hairline bg-surface text-ink'
              }`}
            >
              {vi ? 'Danh sách' : 'List'}
            </button>
            <button
              type="button"
              onClick={() => setTab('timeline')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'timeline'
                  ? 'bg-primary text-white'
                  : 'border border-hairline bg-surface text-ink'
              }`}
            >
              {vi ? 'Dòng thời gian' : 'Timeline'}
            </button>
          </div>

          {tab === 'list' ? (
            <>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm"
                >
                  <option value="">{vi ? 'Mọi loại' : 'All categories'}</option>
                  {categories.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <input
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                  placeholder="SKU"
                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <input
                  value={orderCode}
                  onChange={(event) => setOrderCode(event.target.value)}
                  placeholder={vi ? 'Mã đơn sàn' : 'Platform order code'}
                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                {canFilterActor ? (
                  <select
                    value={actorId}
                    onChange={(event) => setActorId(event.target.value)}
                    className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm"
                  >
                    <option value="">
                      {vi ? 'Mọi người thao tác' : 'All actors'}
                    </option>
                    {actors.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                ) : null}
                <label className="inline-flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={mine}
                    onChange={(event) => setMine(event.target.checked)}
                  />
                  {vi ? 'Chỉ việc của tôi' : 'Only my actions'}
                </label>
              </div>
              {error ? (
                <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {error}
                </p>
              ) : null}
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-ink-subtle">
                  {vi ? 'Không có thao tác trong khoảng lọc.' : 'No activity in this filter.'}
                </p>
              ) : (
                <div className="space-y-4">
                  {groupHistoryByDay(items).map((day) => (
                    <section key={day.key}>
                      <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                        {historyDayHeading(day.headingIso, vi)}
                      </h2>
                      <ul className="space-y-2">
                  {day.items.map((item) => {
                    const expanded = selectedItemId === item.id
                    const details = item.details
                      ? Object.entries(item.details)
                      : []
                    return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedItemId((current) =>
                            current === item.id ? null : item.id,
                          )
                        }
                        className="w-full text-left"
                      >
                        <p className="font-medium text-ink">{item.summary || item.action}</p>
                        <p className="text-xs text-ink-muted">
                          {formatDateTime(item.occurredAt)}
                          {item.categoryLabel ? ` · ${item.categoryLabel}` : ''}
                          {item.actor?.name ? ` · ${item.actor.name}` : ''}
                          {item.skus.length > 0 ? ` · ${item.skus.join(', ')}` : ''}
                        </p>
                      </button>
                      {item.orderGroupId ? (
                        <Link
                          to={`${shell === 'admin' ? '/app/admin/history' : '/app/history'}?group=${item.orderGroupId}`}
                          onClick={() => {
                            setTimelineGroupId(item.orderGroupId ?? '')
                            setTab('timeline')
                          }}
                          className="text-xs text-primary"
                        >
                          {vi ? 'Xem cả đơn' : 'View whole order'}
                        </Link>
                      ) : null}
                      {expanded && details.length > 0 ? (
                        <table className="mt-2 w-full text-left text-[11px]">
                          <tbody>
                            {details.map(([key, value]) => (
                              <tr key={key} className="border-t border-hairline">
                                <th className="py-1 pr-3 font-medium text-ink-muted">
                                  {key}
                                </th>
                                <td className="py-1 break-all text-ink">
                                  {formatDetailValue(value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </li>
                    )
                  })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {nextBefore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="mt-4 self-center rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : vi ? (
                    'Tải thêm'
                  ) : (
                    'Load more'
                  )}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <input
                  value={timelineGroupId}
                  onChange={(event) => setTimelineGroupId(event.target.value)}
                  placeholder={vi ? 'Id nhóm đơn' : 'Order group id'}
                  className="h-9 min-w-[16rem] flex-1 rounded-lg border border-hairline bg-surface px-2 font-mono text-sm"
                />
                <button
                  type="button"
                  disabled={!timelineGroupId.trim() || timelineLoading}
                  onClick={() => void loadTimeline(timelineGroupId)}
                  className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {vi ? 'Xem' : 'View'}
                </button>
                <button
                  type="button"
                  disabled={!timelineGroupId.trim() || timelineLoading}
                  onClick={() => void loadTimeline(timelineGroupId)}
                  className="h-9 rounded-lg border border-hairline px-3 text-sm disabled:opacity-50"
                >
                  {vi ? 'Tải lại' : 'Reload'}
                </button>
              </div>
              {timelineError ? (
                <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {timelineError}
                </p>
              ) : null}
              {timelineLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                </div>
              ) : timelineItems.length === 0 ? (
                <p className="text-sm text-ink-subtle">
                  {vi
                    ? 'Nhập id nhóm đơn để xem dòng thời gian.'
                    : 'Enter an order group id to view its timeline.'}
                </p>
              ) : (
                <ol className="space-y-2">
                  {timelineItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-ink">{item.summary || item.action}</p>
                      <p className="text-xs text-ink-muted">
                        {formatDateTime(item.occurredAt)}
                        {item.categoryLabel ? ` · ${item.categoryLabel}` : ''}
                        {item.fromStatus && item.toStatus
                          ? ` · ${item.fromStatus} → ${item.toStatus}`
                          : ''}
                      </p>
                      {historyShippingLine(item) ? (
                        <p className="text-xs text-ink-subtle">{historyShippingLine(item)}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
