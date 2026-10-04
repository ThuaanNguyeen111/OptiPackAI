import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Box,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Loader2,
  PackageCheck,
  PackagePlus,
  Play,
  RefreshCw,
  Truck,
  Zap,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Packing3DViewer } from '../components/packing3d/Packing3DViewer'
import { ParcelList } from '../components/packing-workspace/ParcelList'
import { PackingMode } from '../components/packing-workspace/PackingMode'
import {
  ChangeBoxDialog,
  MoveItemDialog,
  RecomputeDialog,
  RejectDialog,
} from '../components/packing-workspace/PlanDialogs'
import { dims, kg, orderLabel, sortedPlacements, vnd } from '../components/packing-workspace/format'
import { usePortal } from '../context/use-portal'
import { useAuth } from '../context/use-auth'
import { usePackingWorkspace } from '../hooks/usePackingWorkspace'
import { UserRole } from '../types/auth'
import { ADJUSTMENT_REASON_LABELS, materialLabel, type AdjustmentReason } from '../types/packaging'
import { PLAN_STATUS_LABELS, PROOF_LABELS, type PackingPlan, type PlanParcel } from '../types/packing-plan'
import {
  approvePlan,
  changeParcelBox,
  moveParcelItem,
  packPlan,
  recomputePlan,
  rejectPlan,
} from '../api/packing-plan.api'

type DialogState =
  | { kind: 'change-box' }
  | { kind: 'move'; itemKey: string }
  | { kind: 'recompute' }
  | { kind: 'reject' }
  | null

/**
 * /app/packing/:groupId — một màn hình làm việc cho mỗi nhóm (04/10/2026):
 * trái = danh sách kiện, giữa = 3D, phải = việc cần làm theo trạng thái
 * (đang tính → duyệt/chỉnh tay → đóng từng bước + cân → đã đóng).
 */
export function PackingWorkspacePage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const { session } = useAuth()
  const role = session?.role
  const ws = usePackingWorkspace(groupId)
  const [selectedNo, setSelectedNo] = useState<number | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [packing, setPacking] = useState(false)

  const isAdmin = role === UserRole.ADMIN
  const canDecide = isAdmin || role === UserRole.PACKAGING_STAFF
  const canPack = canDecide || role === UserRole.WAREHOUSE_STAFF
  const plan = ws.plan
  const parcel: PlanParcel | null =
    plan?.parcels.find((p) => p.parcelNo === selectedNo) ?? plan?.parcels[0] ?? null
  const groupLabel = `#${groupId.slice(-6).toUpperCase()}`
  const showsPlan = plan !== null && ['ready', 'approved', 'packed'].includes(plan.status)

  const act = async (fn: (current: PackingPlan) => Promise<PackingPlan>): Promise<boolean> => {
    const ok = await ws.run((current) => {
      if (!current) return Promise.reject(new Error(vi ? 'Chưa có kế hoạch' : 'No plan yet'))
      return fn(current)
    })
    if (ok) setDialog(null)
    return ok
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Đóng gói' : 'Packing', to: '/app/packing' },
          { label: groupLabel },
        ]}
      />
      <main className="flex min-h-0 flex-1 flex-col bg-canvas">
        {/* Thanh tiêu đề nhóm */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {vi ? 'Nhóm' : 'Group'} <span className="font-mono">{groupLabel}</span>
          </h1>
          {ws.group && (
            <span className="text-sm text-ink-muted">
              {ws.group.orderCount} {vi ? 'đơn' : 'orders'}
            </span>
          )}
          {ws.group?.orderPriority === 'express' && (
            <Badge tone="warning" className="gap-1">
              <Zap className="h-3 w-3" />
              {vi ? 'Hỏa tốc' : 'Express'}
            </Badge>
          )}
          {plan && (
            <Badge tone={plan.status === 'packed' ? 'success' : plan.status === 'ready' ? 'primary' : 'default'}>
              {vi ? PLAN_STATUS_LABELS[plan.status].vi : PLAN_STATUS_LABELS[plan.status].en}
            </Badge>
          )}
          {plan && showsPlan && (
            <span className="ml-auto flex items-center gap-4 text-sm tabular-nums text-ink-muted">
              <span>
                <span className="font-semibold text-ink">{plan.totals.parcels}</span> {vi ? 'kiện' : 'parcels'}
              </span>
              <span>{vnd(plan.totals.packagingCostVnd)}</span>
              <span>{kg(plan.totals.estimatedWeightG, vi)}</span>
              <span title={vi ? 'Tổng thể tích hàng ÷ tổng lòng thùng' : 'Goods volume ÷ box volume'}>
                {vi ? 'lấp đầy' : 'fill'} {Math.round(plan.totals.avgFill * 100)}%
              </span>
            </span>
          )}
        </div>

        {ws.error && (
          <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error sm:mx-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{ws.error}</span>
            <button type="button" onClick={ws.clearError} className="text-xs underline-offset-2 hover:underline">
              {vi ? 'Đóng' : 'Dismiss'}
            </button>
          </div>
        )}

        {ws.loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi ? 'Đang tải…' : 'Loading…'}
          </div>
        ) : !showsPlan || !plan || !parcel ? (
          <EmptyState ws={ws} vi={vi} canDecide={canDecide} onRecompute={() => setDialog({ kind: 'recompute' })} />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[240px_minmax(0,1fr)_360px] lg:overflow-hidden">
            <aside className="lg:overflow-y-auto">
              <ParcelList
                plan={plan}
                selected={parcel.parcelNo}
                onSelect={(no) => {
                  setSelectedNo(no)
                  setFocusKey(null)
                }}
                vi={vi}
              />
            </aside>

            <Packing3DViewer
              key={`${String(parcel.parcelNo)}-${String(plan.version)}`}
              parcel={parcel}
              itemProfiles={plan.itemProfiles}
              vi={vi}
              focusItemKey={focusKey}
              onSelectItem={setFocusKey}
              className="h-[52vh] lg:h-full"
            />

            <aside className="space-y-4 lg:overflow-y-auto lg:pr-1">
              {plan.status === 'ready' && (
                <ReviewActions
                  plan={plan}
                  vi={vi}
                  canDecide={canDecide}
                  busy={ws.busy}
                  onApprove={() => void act((c) => approvePlan(groupId, c.version))}
                  onChangeBox={() => setDialog({ kind: 'change-box' })}
                  onRecompute={() => setDialog({ kind: 'recompute' })}
                  onReject={() => setDialog({ kind: 'reject' })}
                />
              )}
              {plan.status === 'approved' && (
                <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-ink">{vi ? 'Đã duyệt — sẵn sàng đóng' : 'Approved — ready to pack'}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {vi
                      ? `Đóng lần lượt ${String(plan.totals.parcels)} kiện theo từng bước, cân từng kiện rồi xác nhận.`
                      : `Pack ${String(plan.totals.parcels)} parcel(s) step by step, weigh each one, then confirm.`}
                  </p>
                  {canPack && (
                    <Button className="mt-3 min-h-11 w-full gap-2" onClick={() => setPacking(true)}>
                      <Play className="h-4 w-4" />
                      {vi ? 'Bắt đầu đóng gói' : 'Start packing'}
                    </Button>
                  )}
                </section>
              )}
              {plan.status === 'packed' && (
                <section className="rounded-xl border border-success/30 bg-success-bg p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-success">
                    <PackageCheck className="h-4 w-4" />
                    {vi ? 'Đã đóng xong' : 'Packed'}
                  </p>
                  {plan.parcels.some((p) => p.isAbnormal) && (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                      {vi ? 'Có kiện cân lệch hơn 20% — đã báo chủ shop.' : 'Some parcels are >20% off the estimate — flagged.'}
                    </p>
                  )}
                  <Link
                    to="/app/shipping/dispatch"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <Truck className="h-4 w-4" />
                    {vi ? 'Sang điều phối vận chuyển' : 'Go to shipping dispatch'}
                  </Link>
                </section>
              )}

              <StockSuggestionCard plan={plan} vi={vi} isAdmin={isAdmin} />
              <ProofCard plan={plan} vi={vi} />
              <ParcelDetails
                plan={plan}
                parcel={parcel}
                vi={vi}
                focusKey={focusKey}
                onFocus={setFocusKey}
                canMove={plan.status === 'ready' && canDecide}
                onMove={(itemKey) => setDialog({ kind: 'move', itemKey })}
              />
              {plan.adjustments.length > 0 && <Adjustments plan={plan} vi={vi} />}
            </aside>
          </div>
        )}
      </main>

      {plan && parcel && dialog?.kind === 'change-box' && (
        <ChangeBoxDialog
          key={`cb-${String(parcel.parcelNo)}`}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          parcel={parcel}
          boxes={ws.boxes}
          busy={ws.busy}
          vi={vi}
          onSubmit={(input) =>
            void act((c) => changeParcelBox(groupId, parcel.parcelNo, { ...input, expectedVersion: c.version }))
          }
        />
      )}
      {plan && parcel && dialog?.kind === 'move' && (
        <MoveItemDialog
          key={`mv-${dialog.itemKey}`}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          plan={plan}
          parcel={parcel}
          itemKey={dialog.itemKey}
          busy={ws.busy}
          vi={vi}
          onSubmit={(input) =>
            void act((c) =>
              moveParcelItem(groupId, parcel.parcelNo, { ...input, itemKey: dialog.itemKey, expectedVersion: c.version }),
            ).then((ok) => {
              if (ok) setFocusKey(null)
            })
          }
        />
      )}
      {dialog?.kind === 'recompute' && (
        <RecomputeDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          plan={plan}
          boxes={ws.boxes}
          busy={ws.busy}
          vi={vi}
          onSubmit={(input) =>
            void ws
              .run((current) => recomputePlan(groupId, { ...input, expectedVersion: current?.version }))
              .then((ok) => {
                if (ok) {
                  setDialog(null)
                  setSelectedNo(null)
                }
              })
          }
        />
      )}
      {plan && dialog?.kind === 'reject' && (
        <RejectDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          busy={ws.busy}
          vi={vi}
          onSubmit={(reason) => void act((c) => rejectPlan(groupId, c.version, reason))}
        />
      )}
      {packing && plan?.status === 'approved' && (
        <PackingMode
          plan={plan}
          groupLabel={groupLabel}
          vi={vi}
          busy={ws.busy}
          error={ws.error}
          guideLoading={ws.guideLoading}
          guideError={ws.guideError}
          onLoadGuide={ws.loadGuide}
          onPack={(weights) => act((c) => packPlan(groupId, c.version, weights))}
          onClose={() => setPacking(false)}
        />
      )}
    </>
  )
}

function EmptyState({
  ws,
  vi,
  canDecide,
  onRecompute,
}: {
  ws: ReturnType<typeof usePackingWorkspace>
  vi: boolean
  canDecide: boolean
  onRecompute: () => void
}) {
  const plan = ws.plan
  const status = ws.group?.fulfillmentStatus
  let title: string
  let body: string
  let tone: 'wait' | 'warn' | 'info' = 'info'
  if (plan?.status === 'failed') {
    tone = 'warn'
    title = vi ? 'Không tính được phương án' : 'The plan could not be computed'
    body = plan.failureReason ?? ''
  } else if (plan?.status === 'rejected') {
    tone = 'warn'
    title = vi ? 'Đã chuyển xử lý ngoài hệ thống' : 'Moved to manual handling'
    body = plan.rejectionReason ?? ''
  } else if (ws.waiting) {
    tone = 'wait'
    title = vi ? 'Đang tính phương án đóng gói…' : 'Computing the packing plan…'
    body = vi
      ? 'Hệ thống thử nhiều cách xếp, chọn ít kiện và rẻ nhất, rồi kiểm chứng tối ưu với đơn nhỏ. Thường mất vài giây.'
      : 'Many arrangements are tried; the fewest, cheapest parcels win, and small orders are proven optimal. Usually a few seconds.'
  } else {
    title = vi ? 'Nhóm chưa tới bước đóng gói' : 'This group is not at the packing stage'
    body = vi
      ? `Trạng thái hiện tại: ${status ?? '—'}. Kế hoạch tự tính khi lấy hàng xong.`
      : `Current status: ${status ?? '—'}. The plan is computed automatically once picking is done.`
  }
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
            tone === 'warn' ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/10 text-primary'
          }`}
        >
          {tone === 'wait' ? (
            <Cpu className="h-6 w-6 animate-pulse" />
          ) : tone === 'warn' ? (
            <AlertTriangle className="h-6 w-6" />
          ) : (
            <Box className="h-6 w-6" />
          )}
        </div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {body && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>}
        {canDecide && (plan?.status === 'failed' || plan?.status === 'rejected') && (
          <Button className="mt-5 gap-2" onClick={onRecompute} disabled={ws.busy}>
            <RefreshCw className="h-4 w-4" />
            {vi ? 'Tính lại' : 'Recompute'}
          </Button>
        )}
        <p className="mt-6">
          <Link to="/app/packing" className="text-sm text-ink-muted hover:text-ink">
            ← {vi ? 'Về hàng chờ' : 'Back to queue'}
          </Link>
        </p>
      </div>
    </div>
  )
}

function ReviewActions({
  plan,
  vi,
  canDecide,
  busy,
  onApprove,
  onChangeBox,
  onRecompute,
  onReject,
}: {
  plan: PackingPlan
  vi: boolean
  canDecide: boolean
  busy: boolean
  onApprove: () => void
  onChangeBox: () => void
  onRecompute: () => void
  onReject: () => void
}) {
  const unresolved = plan.orders.filter((o) => o.status !== 'ok').length
  if (!canDecide) {
    return (
      <p className="rounded-xl border border-hairline bg-surface-1 p-4 text-sm text-ink-muted">
        {vi ? 'Đang chờ nhân viên đóng gói duyệt phương án.' : 'Waiting for packaging staff to approve.'}
      </p>
    )
  }
  return (
    <section className="space-y-2 rounded-xl border border-hairline bg-surface-1 p-4">
      <Button className="min-h-11 w-full gap-2" onClick={onApprove} disabled={busy || unresolved > 0}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {vi ? 'Duyệt phương án' : 'Approve plan'}
      </Button>
      {unresolved > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {vi
            ? `${String(unresolved)} đơn còn món chưa xếp — chuyển món, đổi thùng hoặc tính lại trước khi duyệt.`
            : `${String(unresolved)} order(s) still have unplaced items.`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="gap-1.5" onClick={onChangeBox} disabled={busy}>
          <Box className="h-4 w-4" />
          {vi ? 'Đổi thùng' : 'Change box'}
        </Button>
        <Button variant="secondary" className="gap-1.5" onClick={onRecompute} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          {vi ? 'Tính lại…' : 'Recompute…'}
        </Button>
      </div>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="w-full pt-1 text-center text-xs text-ink-subtle hover:text-ink disabled:opacity-50"
      >
        {vi ? 'Không đóng theo hệ thống được? Chuyển xử lý tay' : 'Cannot pack in the system? Move to manual handling'}
      </button>
    </section>
  )
}

function ProofCard({ plan, vi }: { plan: PackingPlan; vi: boolean }) {
  const [open, setOpen] = useState(false)
  const proof = plan.proof ?? 'heuristic'
  const label = PROOF_LABELS[proof]
  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <BadgeCheck className={`mt-0.5 h-5 w-5 shrink-0 ${proof === 'heuristic' ? 'text-ink-subtle' : 'text-success'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{vi ? label.vi : label.en}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{vi ? label.hintVi : label.hintEn}</p>
          {plan.cpSatPending && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {vi ? 'CP-SAT đang kiểm chứng thêm…' : 'CP-SAT is still verifying…'}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {vi ? 'Vì sao phương án này?' : 'Why this plan?'}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {plan.orders.map((o) => {
            const parcels = plan.parcels.filter((p) => p.orderId === o.orderId).length
            return (
              <div key={o.orderId} className="rounded-lg bg-surface-2/60 p-3 text-xs">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <span className="font-mono">{o.platformOrderId ?? `…${o.orderId.slice(-6)}`}</span>
                  <Badge tone={o.proof === 'heuristic' ? 'default' : 'success'}>
                    {vi ? PROOF_LABELS[o.proof].vi : PROOF_LABELS[o.proof].en}
                  </Badge>
                </p>
                <p className="mt-1.5 tabular-nums text-ink-muted">
                  {vi
                    ? `${String(parcels)} kiện · tối thiểu có thể: ${String(o.lowerBoundParcels)}`
                    : `${String(parcels)} parcel(s) · lower bound: ${String(o.lowerBoundParcels)}`}
                </p>
                {o.explanation.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-ink-muted">
                    {o.explanation.map((line, i) => (
                      <li key={i}>· {line}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <p className="text-xs text-ink-subtle">
            {plan.solver.engineVersion} · {plan.solver.computationMs.toLocaleString('vi-VN')} ms
          </p>
        </div>
      )}
    </section>
  )
}

/**
 * Gợi ý kho thùng (04/10/2026): đơn phải dùng thùng to hơn/nhiều kiện hơn chỉ
 * vì kho hết thùng vừa hơn. Số liệu chụp lúc tính kế hoạch.
 */
function StockSuggestionCard({ plan, vi, isAdmin }: { plan: PackingPlan; vi: boolean; isAdmin: boolean }) {
  const rows = plan.orders.flatMap((o) => (o.stockSuggestion ? [{ order: o, s: o.stockSuggestion }] : []))
  if (rows.length === 0) return null
  const pct = (x: number) => `${String(Math.round(x * 100))}%`
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <PackagePlus className="h-4 w-4 text-amber-600" />
        {vi ? 'Gợi ý kho thùng' : 'Box stock suggestion'}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {vi
          ? 'Kho đang thiếu thùng vừa hơn nên phải dùng thùng to/nhiều kiện. Nhập thêm thùng dưới đây rồi bấm "Tính lại…" để dùng.'
          : 'A better-fitting box is out of stock, so larger boxes were used. Restock the boxes below, then recompute.'}
      </p>
      <ul className="mt-3 space-y-3">
        {rows.map(({ order, s }) => (
          <li key={order.orderId} className="rounded-lg bg-surface-1 p-3 text-xs">
            {plan.orders.length > 1 && (
              <p className="mb-1 font-mono text-ink-subtle">{order.platformOrderId ?? `…${order.orderId.slice(-6)}`}</p>
            )}
            <p className="text-sm text-ink">
              {s.missing
                .map((m) => `${m.boxCode} — ${vi ? 'cần' : 'need'} ${String(m.needed)}, ${vi ? 'còn trống' : 'free'} ${String(m.available)}`)
                .join(' · ')}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-ink-muted">{vi ? 'Số kiện' : 'Parcels'}</dt>
              <dd className="text-right text-ink">
                {s.currentParcels} → <span className="font-semibold">{s.parcels}</span>
              </dd>
              <dt className="text-ink-muted">{vi ? 'Lấp đầy TB' : 'Avg fill'}</dt>
              <dd className="text-right text-ink">
                {pct(s.currentAvgFill)} → <span className="font-semibold text-success">{pct(s.avgFill)}</span>
              </dd>
              {s.savingVnd !== 0 && (
                <>
                  <dt className="text-ink-muted">{vi ? 'Thùng + vật tư' : 'Box + materials'}</dt>
                  <dd className={`text-right font-semibold ${s.savingVnd > 0 ? 'text-success' : 'text-ink'}`}>
                    {s.savingVnd > 0 ? '−' : '+'}
                    {vnd(Math.abs(s.savingVnd))}
                  </dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
      {isAdmin && (
        <Link to="/app/admin/boxes" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          {vi ? 'Mở danh mục thùng để nhập thêm' : 'Open box catalog to restock'}
        </Link>
      )}
    </section>
  )
}

function ParcelDetails({
  plan,
  parcel,
  vi,
  focusKey,
  onFocus,
  canMove,
  onMove,
}: {
  plan: PackingPlan
  parcel: PlanParcel
  vi: boolean
  focusKey: string | null
  onFocus: (key: string | null) => void
  canMove: boolean
  onMove: (itemKey: string) => void
}) {
  const rows: [string, string][] = [
    [vi ? 'Thùng' : 'Box', `${parcel.box.code} · ${parcel.box.name}`],
    [vi ? 'Lòng trong' : 'Inside', dims(parcel.box.innerMm, vi)],
    [vi ? 'Cân ước tính' : 'Est. weight', kg(parcel.estimatedWeightG, vi)],
    [vi ? 'Cân quy đổi' : 'Volumetric', kg(parcel.volumetricWeightG, vi)],
    [vi ? 'Thùng + vật tư' : 'Box + materials', vnd((parcel.box.priceVnd ?? 0) + parcel.materialsCostVnd)],
  ]
  if (parcel.actualWeightKg !== null) rows.push([vi ? 'Cân thật' : 'Actual', kg(parcel.actualWeightKg * 1000, vi)])
  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-4">
      <h2 className="text-sm font-semibold text-ink">
        {vi ? 'Kiện' : 'Parcel'} {parcel.parcelNo}
        <span className="ml-2 font-normal text-ink-subtle">
          {vi ? 'đơn' : 'order'} {orderLabel(parcel)}
        </span>
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="text-right tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {parcel.materials.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">{vi ? 'Vật tư chèn' : 'Materials'}</h3>
          <ul className="space-y-1 text-sm">
            {parcel.materials.map((m) => (
              <li key={`${m.type}-${m.code ?? ''}`} className="flex justify-between">
                <span className="text-ink">{materialLabel(m, vi)}</span>
                <span className="tabular-nums text-ink-muted">
                  {m.quantity} {m.unit}
                </span>
              </li>
            ))}
          </ul>
          {parcel.materialsShortfall.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
              {vi ? 'Kho thiếu vật tư lúc đóng: ' : 'Short on materials: '}
              {parcel.materialsShortfall.map((s) => `${s.code} ×${String(s.missing)}`).join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">
          {vi ? 'Thứ tự xếp' : 'Packing order'} · {parcel.placements.length}
        </h3>
        <ol className="space-y-0.5">
          {sortedPlacements(parcel).map((p) => {
            const active = p.itemKey === focusKey
            return (
              <li key={p.itemKey} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onFocus(active ? null : p.itemKey)}
                  aria-pressed={active}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    active ? 'bg-primary/10 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-subtle">{p.step}</span>
                  <span className="truncate font-mono text-xs">{p.sku}</span>
                  {p.folded && <span className="text-xs text-primary">{vi ? 'gập' : 'fold'}</span>}
                  <span className="ml-auto text-xs tabular-nums text-ink-subtle">
                    {p.z > 0 ? (vi ? 'chồng' : 'stack') : vi ? 'đáy' : 'floor'}
                  </span>
                </button>
                {canMove && (
                  <button
                    type="button"
                    onClick={() => onMove(p.itemKey)}
                    className="rounded-md p-1.5 text-ink-subtle opacity-60 transition-opacity hover:bg-surface-2 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                    title={vi ? 'Chuyển sang kiện khác' : 'Move to another parcel'}
                    aria-label={vi ? `Chuyển ${p.itemKey}` : `Move ${p.itemKey}`}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </div>
      {plan.parcels.length === 1 && canMove && (
        <p className="mt-2 text-xs text-ink-subtle">
          {vi ? 'Chuyển món sang "kiện mới" để tách đơn thành 2 kiện.' : 'Move an item to a new parcel to split the order.'}
        </p>
      )}
    </section>
  )
}

function Adjustments({ plan, vi }: { plan: PackingPlan; vi: boolean }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">{vi ? 'Lịch sử chỉnh tay' : 'Manual edits'}</h2>
      <ul className="space-y-2 text-xs">
        {plan.adjustments.map((a, i) => {
          const reason = ADJUSTMENT_REASON_LABELS[a.reason as AdjustmentReason] as { vi: string; en: string } | undefined
          return (
            <li key={i} className="border-l-2 border-hairline-strong pl-2.5">
              <p className="text-ink">{a.detail}</p>
              <p className="text-ink-subtle">
                {reason ? (vi ? reason.vi : reason.en) : a.reason}
                {a.note ? ` — ${a.note}` : ''} · {new Date(a.at).toLocaleString(vi ? 'vi-VN' : 'en-US')}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
