import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Loader2, Zap } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { usePortal } from '../context/use-portal'
import { listOrderGroups } from '../api/packaging.api'
import { listPlanSummaries } from '../api/packing-plan.api'
import { formatApiError } from '../lib/api'
import type { OrderGroupSummary } from '../types/packaging'
import { PROOF_LABELS, type PackingPlanSummary } from '../types/packing-plan'

/** Trạng thái nhóm có việc đóng gói. */
const STAGE_STATUSES = ['picked', 'pending_approval', 'approved_for_packing', 'packed'] as const
type Stage = 'computing' | 'review' | 'pack' | 'done'
const REFRESH_MS = 10000
const DONE_LIMIT = 12

type Card = { group: OrderGroupSummary; plan: PackingPlanSummary | undefined }

function stageOf({ group, plan }: Card): Stage | 'attention' {
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

/**
 * /app/packing — hàng chờ đóng gói (04/10/2026). Kế hoạch tự tính khi lấy
 * hàng xong, nên nhân viên chỉ cần nhìn cột của mình: duyệt hoặc đóng.
 */
export function PackingQueuePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    listOrderGroups()
      .then(async (all) => {
        const groups = all.filter((g) => (STAGE_STATUSES as readonly string[]).includes(g.fulfillmentStatus))
        const summaries = await listPlanSummaries(groups.map((g) => g.id))
        const byGroup = new Map(summaries.map((s) => [s.orderGroupId, s]))
        if (!cancelled) {
          setCards(groups.map((group) => ({ group, plan: byGroup.get(group.id) })))
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

  // Làm mới định kỳ: cột "Đang tính" tự chuyển sang "Chờ duyệt" khi máy chủ tính xong.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  const columns = useMemo(() => {
    const byStage: Record<Stage | 'attention', Card[]> = { attention: [], computing: [], review: [], pack: [], done: [] }
    for (const card of cards) byStage[stageOf(card)].push(card)
    // Hỏa tốc lên đầu, rồi hạn chót gần nhất, rồi nhóm cũ nhất.
    const order = (a: Card, b: Card) =>
      Number(b.group.orderPriority === 'express') - Number(a.group.orderPriority === 'express') ||
      (a.group.packagingDeadline ?? '9').localeCompare(b.group.packagingDeadline ?? '9') ||
      a.group.createdAt.localeCompare(b.group.createdAt)
    for (const list of Object.values(byStage)) list.sort(order)
    byStage.done = byStage.done.sort((a, b) => b.group.updatedAt.localeCompare(a.group.updatedAt)).slice(0, DONE_LIMIT)
    return byStage
  }, [cards])

  const stages: { id: Stage; title: string; hint: string }[] = [
    {
      id: 'computing',
      title: vi ? 'Đang tính' : 'Computing',
      hint: vi ? 'Tự tính khi lấy hàng xong' : 'Computed once picking is done',
    },
    { id: 'review', title: vi ? 'Chờ duyệt' : 'Awaiting approval', hint: vi ? 'Nhân viên đóng gói duyệt' : 'Packaging staff' },
    { id: 'pack', title: vi ? 'Chờ đóng' : 'Ready to pack', hint: vi ? 'Đóng theo từng bước' : 'Pack step by step' },
    { id: 'done', title: vi ? 'Đã đóng' : 'Packed', hint: vi ? 'Gần đây nhất' : 'Most recent' },
  ]

  return (
    <>
      <PortalTopBar
        breadcrumbs={[{ label: 'OptiPackAI', to: '/app' }, { label: vi ? 'Đóng gói' : 'Packing' }]}
      />
      <main className="flex-1 overflow-y-auto bg-canvas">
        <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 sm:p-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">{vi ? 'Hàng chờ đóng gói' : 'Packing queue'}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'Kế hoạch được tính tự động ngay khi nhóm lấy hàng xong. Mở một nhóm để duyệt hoặc đóng.'
                  : 'Plans are computed automatically once picking finishes. Open a group to approve or pack it.'}
              </p>
            </div>
            {loading && cards.length === 0 && (
              <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </span>
            )}
          </header>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {columns.attention.length > 0 && (
            <section aria-label={vi ? 'Cần xử lý' : 'Needs attention'} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                {vi ? 'Cần xử lý' : 'Needs attention'}
                <span className="font-normal tabular-nums">{columns.attention.length}</span>
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {columns.attention.map((card) => (
                  <li key={card.group.id}>
                    <QueueCard card={card} vi={vi} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stages.map((stage) => {
              const list = columns[stage.id]
              return (
                <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="flex min-h-48 flex-col rounded-xl bg-surface-1/60 p-2">
                  <div className="flex items-baseline justify-between px-2 pt-1 pb-2.5">
                    <h2 id={`stage-${stage.id}`} className="text-sm font-semibold text-ink">
                      {stage.title}
                      <span className="ml-2 font-normal tabular-nums text-ink-subtle">{list.length}</span>
                    </h2>
                    <span className="text-xs text-ink-subtle">{stage.hint}</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-xs text-ink-subtle">
                      {vi ? 'Trống' : 'Empty'}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((card) => (
                        <li key={card.group.id}>
                          <QueueCard card={card} vi={vi} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </main>
    </>
  )
}

function QueueCard({ card: { group, plan }, vi }: { card: Card; vi: boolean }) {
  const money = (n: number) => `${n.toLocaleString('vi-VN')} đ`
  const deadline = group.packagingDeadline ? new Date(group.packagingDeadline) : null
  const computing = !plan || plan.status === 'computing'
  return (
    <Link
      to={`/app/packing/${group.id}`}
      className="block rounded-lg border border-hairline bg-surface-1 p-3 transition-colors hover:border-hairline-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-ink-subtle">#{group.id.slice(-6).toUpperCase()}</span>
        <span className="text-sm font-medium text-ink">
          {group.orderCount} {vi ? 'đơn' : group.orderCount === 1 ? 'order' : 'orders'}
        </span>
        {group.orderPriority === 'express' && (
          <Badge tone="warning" className="ml-auto gap-1">
            <Zap className="h-3 w-3" />
            {vi ? 'Hỏa tốc' : 'Express'}
          </Badge>
        )}
      </div>

      {plan?.status === 'failed' || plan?.status === 'rejected' ? (
        <p className="mt-2 line-clamp-2 text-xs text-amber-700 dark:text-amber-300">
          {plan.status === 'failed'
            ? (vi ? 'Lỗi khi tính: ' : 'Failed: ') + (plan.failureReason ?? '')
            : vi
              ? 'Đã chuyển xử lý ngoài hệ thống'
              : 'Moved to manual handling'}
        </p>
      ) : computing ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          {vi ? 'Đang tính phương án…' : 'Computing…'}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="tabular-nums">
            <span className="font-medium text-ink">{plan.parcels}</span> {vi ? 'kiện' : 'parcels'}
          </span>
          <span className="tabular-nums">{money(plan.packagingCostVnd)}</span>
          {plan.proof && (
            <Badge tone={plan.proof === 'heuristic' ? 'default' : 'success'}>
              {vi ? PROOF_LABELS[plan.proof].vi : PROOF_LABELS[plan.proof].en}
            </Badge>
          )}
        </div>
      )}

      {deadline && group.fulfillmentStatus !== 'packed' && (
        <p className={`mt-2 inline-flex items-center gap-1 text-xs ${group.isOverdue ? 'text-error' : 'text-ink-subtle'}`}>
          <Clock className="h-3 w-3" />
          {group.isOverdue ? (vi ? 'Quá hạn ' : 'Overdue ') : vi ? 'Hạn ' : 'Due '}
          {deadline.toLocaleString(vi ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
        </p>
      )}
    </Link>
  )
}
