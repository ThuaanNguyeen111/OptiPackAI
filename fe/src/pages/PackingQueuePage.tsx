import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Clock, Loader2, PackageCheck, ShieldCheck, Zap } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { useAuth } from '../context/use-auth'
import { listOrderGroups } from '../api/packaging.api'
import { listPlanSummaries } from '../api/packing-plan.api'
import { formatApiError } from '../lib/api'
import { canAccessPath } from '../lib/rbac'
import { cn } from '../lib/cn'
import type { OrderGroupSummary } from '../types/packaging'
import type { GroupQueueInfo, PackingPlanSummary } from '../types/packing-plan'

/** Trạng thái nhóm có việc đóng gói. */
const STAGE_STATUSES = ['picked', 'pending_approval', 'approved_for_packing', 'packed'] as const
type Stage = 'attention' | 'review' | 'pack' | 'computing' | 'done'
/** Thứ tự tab = thứ tự ưu tiên công việc; tab mặc định là tab đầu tiên còn việc. */
const STAGE_ORDER: Stage[] = ['attention', 'review', 'pack', 'computing', 'done']
const REFRESH_MS = 10000
const DONE_LIMIT = 20
const PROFILE_PATH = '/app/inventory/packaging-profiles'

type Row = { group: OrderGroupSummary; plan: PackingPlanSummary | undefined; info: GroupQueueInfo | undefined }

function stageOf({ group, plan }: Row): Stage {
  if (plan?.status === 'failed' || plan?.status === 'rejected') return 'attention'
  switch (group.fulfillmentStatus) {
    case 'pending_approval':
      return 'review'
    case 'approved_for_packing':
      return 'pack'
    case 'packed':
      return 'done'
    default:
      return 'computing'
  }
}

/** 14:05 · 05/10 — giờ trước vì nhân viên làm theo ca. */
function formatTime(value: string | Date): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

const PLATFORM_LABELS: Record<string, string> = { lazada: 'Lazada', aurelle: 'AURELLE', tiktok: 'TikTok Shop', tiki: 'Tiki' }

/**
 * /app/packing — hàng chờ đóng gói. Viết lại 05/10/2026: một danh sách theo
 * từng bước (thay 4 cột kanban phần lớn trống), mỗi dòng nhận diện bằng mã đơn
 * sàn + người nhận + hàng, lỗi tính phương án được diễn giải kèm cách sửa.
 */
export function PackingQueuePage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    let cancelled = false
    listOrderGroups()
      .then(async (all) => {
        const groups = all.filter((g) => (STAGE_STATUSES as readonly string[]).includes(g.fulfillmentStatus))
        const { summaries, groups: infos } = await listPlanSummaries(groups.map((g) => g.id))
        const plans = new Map(summaries.map((s) => [s.orderGroupId, s]))
        const details = new Map(infos.map((i) => [i.orderGroupId, i]))
        if (!cancelled) {
          setRows(groups.map((group) => ({ group, plan: plans.get(group.id), info: details.get(group.id) })))
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  // Làm mới định kỳ: nhóm "Đang tính" tự sang "Chờ duyệt" khi máy chủ tính xong.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  const byStage = useMemo(() => {
    const out: Record<Stage, Row[]> = { attention: [], review: [], pack: [], computing: [], done: [] }
    for (const row of rows) out[stageOf(row)].push(row)
    // Hỏa tốc lên đầu, rồi hạn chót gần nhất, rồi nhóm cũ nhất.
    const order = (a: Row, b: Row) =>
      Number(b.group.orderPriority === 'express') - Number(a.group.orderPriority === 'express') ||
      (a.group.packagingDeadline ?? '9').localeCompare(b.group.packagingDeadline ?? '9') ||
      a.group.createdAt.localeCompare(b.group.createdAt)
    for (const list of Object.values(out)) list.sort(order)
    out.done = out.done.sort((a, b) => b.group.updatedAt.localeCompare(a.group.updatedAt)).slice(0, DONE_LIMIT)
    return out
  }, [rows])

  const requested = params.get('stage') as Stage | null
  const fallback = STAGE_ORDER.find((s) => s !== 'done' && byStage[s].length > 0) ?? 'review'
  const active: Stage = requested && STAGE_ORDER.includes(requested) ? requested : fallback
  const list = byStage[active]
  const canEditProfiles = session ? canAccessPath(session.role, PROFILE_PATH) : false

  const stageMeta: Record<Stage, { label: string; empty: string }> = {
    attention: {
      label: vi ? 'Cần xử lý' : 'Needs attention',
      empty: vi ? 'Không có nhóm nào bị lỗi.' : 'Nothing needs attention.',
    },
    review: {
      label: vi ? 'Chờ duyệt' : 'To approve',
      empty: vi ? 'Không có kế hoạch nào chờ duyệt.' : 'No plans waiting for approval.',
    },
    pack: {
      label: vi ? 'Chờ đóng' : 'To pack',
      empty: vi ? 'Chưa có nhóm nào được duyệt để đóng.' : 'No approved groups to pack.',
    },
    computing: {
      label: vi ? 'Đang tính' : 'Computing',
      empty: vi
        ? 'Không có nhóm nào đang tính. Kế hoạch tự tính ngay khi nhóm lấy hàng xong.'
        : 'Nothing computing. Plans start as soon as picking finishes.',
    },
    done: {
      label: vi ? 'Đã đóng' : 'Packed',
      empty: vi ? 'Chưa có nhóm nào được đóng.' : 'No packed groups yet.',
    },
  }

  const openCount = byStage.attention.length + byStage.review.length + byStage.pack.length + byStage.computing.length

  return (
    <>
      <PortalTopBar breadcrumbs={[{ label: 'OptiPackAI', to: '/app' }, { label: vi ? 'Đóng gói' : 'Packing' }]} />
      <main className="flex-1 overflow-y-auto bg-canvas">
        <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">{vi ? 'Hàng chờ đóng gói' : 'Packing queue'}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {loading && rows.length === 0
                  ? vi
                    ? 'Đang tải…'
                    : 'Loading…'
                  : vi
                    ? `${openCount} nhóm đang cần đóng gói. Kế hoạch tự tính khi lấy hàng xong.`
                    : `${openCount} groups in progress. Plans are computed once picking finishes.`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              {vi ? 'Tự làm mới mỗi 10 giây' : 'Refreshes every 10 s'}
            </span>
          </header>

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <nav aria-label={vi ? 'Bước đóng gói' : 'Packing stage'} className="mt-6 flex gap-1 overflow-x-auto border-b border-hairline">
            {STAGE_ORDER.filter((s) => s !== 'attention' || byStage.attention.length > 0).map((s) => {
              const selected = s === active
              const count = byStage[s].length
              return (
                <button
                  key={s}
                  type="button"
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => setParams(s === fallback ? {} : { stage: s }, { replace: true })}
                  className={cn(
                    '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                    selected ? 'border-primary font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink',
                    s === 'attention' && !selected && 'text-amber-700 dark:text-amber-300',
                  )}
                >
                  {s === 'attention' && <AlertTriangle className="h-3.5 w-3.5" />}
                  {stageMeta[s].label}
                  <span
                    className={cn(
                      'min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums',
                      selected ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-ink-subtle',
                      s === 'attention' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                    )}
                  >
                    {s === 'done' && count >= DONE_LIMIT ? `${DONE_LIMIT}+` : count}
                  </span>
                </button>
              )
            })}
          </nav>

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <PackageCheck className="h-6 w-6 text-ink-subtle" />
              <p className="text-sm text-ink-muted">{loading ? (vi ? 'Đang tải…' : 'Loading…') : stageMeta[active].empty}</p>
            </div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div aria-hidden className="hidden gap-x-6 border-b border-hairline px-4 py-2 text-xs text-ink-subtle sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_14.5rem]">
              <span>{vi ? 'Đơn' : 'Order'}</span>
              <span>{vi ? 'Hàng' : 'Items'}</span>
              <span>{active === 'attention' ? (vi ? 'Vấn đề' : 'Issue') : vi ? 'Kế hoạch' : 'Plan'}</span>
              <span className="text-right">{active === 'done' ? (vi ? 'Đóng lúc' : 'Packed at') : vi ? 'Hạn / vào hàng' : 'Due / queued'}</span>
            </div>
            <ul className="divide-y divide-hairline">
              {list.map((row) => (
                <li key={row.group.id}>
                  <QueueRow row={row} stage={active} vi={vi} canEditProfiles={canEditProfiles} />
                </li>
              ))}
            </ul>
            </div>
          )}
          {active === 'done' && list.length > 0 && (
            <p className="mt-3 text-xs text-ink-subtle">
              {vi ? `Hiện ${list.length} nhóm đóng gần nhất.` : `Showing the ${list.length} most recently packed groups.`}
            </p>
          )}
        </div>
      </main>
    </>
  )
}

/** Diễn giải lỗi tính phương án thành vấn đề + cách sửa. */
function describeFailure(plan: PackingPlanSummary, vi: boolean): { title: string; detail: string | null; sku: string | null } {
  if (plan.status === 'rejected') {
    return {
      title: vi ? 'Đã chuyển xử lý ngoài hệ thống' : 'Moved to manual handling',
      detail: vi ? 'Mở nhóm để xem lý do hoặc tính lại.' : 'Open the group to see why or recompute.',
      sku: null,
    }
  }
  const reason = plan.failureReason ?? ''
  const profile = /SKU\s+(\S+)\s+chưa có hồ sơ đóng gói/i.exec(reason)
  if (profile?.[1]) {
    return {
      title: vi ? `Thiếu hồ sơ đóng gói của ${profile[1]}` : `Missing packing profile for ${profile[1]}`,
      detail: vi
        ? 'Kho cần đo và xác nhận số đo SKU này, sau đó bấm Tính lại trong nhóm.'
        : 'The warehouse must measure and confirm this SKU, then recompute the group.',
      sku: profile[1],
    }
  }
  return {
    title: vi ? 'Không tính được phương án' : 'Could not compute a plan',
    detail: reason || null,
    sku: null,
  }
}

function QueueRow({ row: { group, plan, info }, stage, vi, canEditProfiles }: { row: Row; stage: Stage; vi: boolean; canEditProfiles: boolean }) {
  const money = (n: number) => `${n.toLocaleString('vi-VN')} đ`
  const deadline = group.packagingDeadline ? new Date(group.packagingDeadline) : null
  const express = group.orderPriority === 'express'
  const orders = info?.orderNumbers ?? []
  const skus = info?.skus ?? []
  const failure = stage === 'attention' && plan ? describeFailure(plan, vi) : null
  const action: Record<Stage, string> = {
    attention: vi ? 'Xử lý' : 'Resolve',
    review: vi ? 'Duyệt' : 'Review',
    pack: vi ? 'Đóng gói' : 'Pack',
    computing: vi ? 'Xem' : 'View',
    done: vi ? 'Xem' : 'View',
  }

  return (
    <div className="group relative grid gap-x-6 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_14.5rem] sm:items-center">
      {/* Nhận diện: mã đơn sàn + người nhận */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {express && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Zap className="h-3 w-3" />
              {vi ? 'Hỏa tốc' : 'Express'}
            </span>
          )}
          <Link
            to={`/app/packing/${group.id}`}
            className="truncate font-medium text-ink tabular-nums after:absolute after:inset-0 focus-visible:outline-none group-has-[a:focus-visible]:bg-surface-2"
          >
            {orders[0] ? `#${orders[0]}` : `${vi ? 'Nhóm' : 'Group'} ${group.id.slice(-6).toUpperCase()}`}
          </Link>
          {orders.length > 1 && (
            <span className="shrink-0 text-xs text-ink-subtle" title={orders.map((o) => `#${o}`).join(', ')}>
              +{orders.length - 1} {vi ? 'đơn' : orders.length === 2 ? 'order' : 'orders'}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {[info?.recipientName, PLATFORM_LABELS[group.platform] ?? group.platform].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* Hàng */}
      <div className="min-w-0 text-sm">
        {skus.length > 0 ? (
          <>
            <p className="truncate text-ink" title={skus.map((s) => `${s.sku} ×${s.quantity}`).join(', ')}>
              {skus
                .slice(0, 2)
                .map((s) => `${s.sku} ×${s.quantity}`)
                .join(', ')}
              {skus.length > 2 && <span className="text-ink-subtle"> +{skus.length - 2}</span>}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
              {info?.units} {vi ? 'món' : 'units'}
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-subtle">{vi ? 'Không còn món cần đóng' : 'No units to pack'}</p>
        )}
      </div>

      {/* Kế hoạch / lỗi */}
      <div className="min-w-0 text-sm">
        {failure ? (
          <>
            <p className="font-medium text-amber-700 dark:text-amber-300">{failure.title}</p>
            {failure.detail && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{failure.detail}</p>}
            {failure.sku && canEditProfiles && (
              <Link
                to={`/app/inventory/packaging-profiles?q=${encodeURIComponent(failure.sku)}`}
                className="relative z-10 mt-1 inline-block text-xs font-medium text-primary underline underline-offset-2"
              >
                {vi ? 'Mở hồ sơ SKU' : 'Open SKU profile'}
              </Link>
            )}
          </>
        ) : !plan || plan.status === 'computing' ? (
          <p className="inline-flex items-center gap-1.5 text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {vi ? 'Đang tính phương án…' : 'Computing…'}
          </p>
        ) : (
          <>
            <p className="text-ink tabular-nums">
              {plan.parcels} {vi ? 'kiện' : plan.parcels === 1 ? 'parcel' : 'parcels'}
              <span className="text-ink-subtle"> · </span>
              {money(plan.packagingCostVnd)}
            </p>
            {(plan.cpSatPending || (plan.proof && plan.proof !== 'heuristic')) && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted">
              {plan.cpSatPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {vi ? 'Đang kiểm chứng tối ưu' : 'Verifying optimality'}
                </>
              ) : plan.proof && plan.proof !== 'heuristic' ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-success" />
                  {vi ? 'Tối ưu' : 'Optimal'}
                </>
              ) : null}
            </p>
            )}
          </>
        )}
      </div>

      {/* Hạn + hành động */}
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {deadline && stage !== 'done' ? (
          <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', group.isOverdue ? 'font-medium text-error' : 'text-ink-muted')}>
            <Clock className="h-3 w-3" />
            {group.isOverdue ? (vi ? 'Quá hạn ' : 'Overdue ') : vi ? 'Hạn ' : 'Due '}
            {formatTime(deadline)}
          </span>
        ) : (
          <span className="text-xs text-ink-subtle tabular-nums">
            {stage === 'done' ? '' : vi ? 'Vào hàng ' : 'Queued '}
            {formatTime(stage === 'done' ? group.updatedAt : group.createdAt)}
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            stage === 'review' || stage === 'pack' || stage === 'attention'
              ? 'bg-primary text-on-primary group-hover:bg-primary-hover'
              : 'text-ink-muted group-hover:text-ink',
          )}
        >
          {action[stage]}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}
