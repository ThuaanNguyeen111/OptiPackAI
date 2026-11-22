import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  backToPicking,
  manualPackPlan,
  recomputePackingPlan,
} from '../../api/packing-plan.api'
import { listPackagingMaterials, type PackagingMaterialStock } from '../../api/packaging-materials.api'
import { formatApiError } from '../../lib/api'
import { PACKING_REASON_LABELS, type PackingPlan, type RejectReason } from '../../types/packing-plan'
import {
  initialManualDraft,
  manualDraftProblem,
  unitsOfPlan,
  type ManualParcelDraft,
  type ManualUnit,
} from './manual-pack-draft'
import { formatDateTime } from '../../utils/format'

/**
 * AOFP-322 — kế hoạch bị từ chối: nhóm về `picked`, cron không tự tính lại. Thẻ này là
 * 3 lối ra của BE: Tính lại (chính), Đóng gói thủ công, Trả về lấy hàng.
 */

function reasonText(plan: PackingPlan, vi: boolean): string {
  const raw = plan.rejectionReason ?? ''
  const code = (plan.rejection?.reasonCode ?? raw.split(':')[0] ?? '') as RejectReason
  const label = PACKING_REASON_LABELS[code]
  const note = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : ''
  const head = label ? (vi ? label.vi : label.en) : raw
  return note ? `${head} — ${note}` : head || (vi ? 'Không ghi lý do' : 'No reason')
}

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50'
const secondaryBtn =
  'inline-flex items-center rounded-lg border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink disabled:opacity-50'
const inputClass = 'rounded-lg border border-hairline bg-canvas px-2 py-1 text-sm'

export function RejectedPlanPanel({
  groupId,
  plan,
  vi,
  canAct,
  onPlan,
  onDone,
}: {
  groupId: string
  plan: PackingPlan
  vi: boolean
  /** Packaging Staff / Admin — BE chỉ cho 2 vai trò này. */
  canAct: boolean
  onPlan: (next: PackingPlan) => void
  /** Sau khi xử lý xong: tải lại hàng đợi (nhóm rời tab Đã lấy hàng). */
  onDone: (message: string) => void
}) {
  const [mode, setMode] = useState<'none' | 'manual' | 'back'>('none')
  const [busy, setBusy] = useState<'recompute' | 'manual' | 'back' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const units = useMemo(() => unitsOfPlan(plan), [plan])
  const skus = useMemo(() => [...new Set(units.map((u) => u.sku))], [units])
  const t = (a: string, b: string): string => (vi ? a : b)
  const locked = busy !== null || !canAct

  async function onRecompute(): Promise<void> {
    setBusy('recompute')
    setError(null)
    try {
      const next = await recomputePackingPlan(groupId, plan.version)
      onPlan(next)
      if (next.status === 'failed') {
        setError(
          t(
            `Không tính được: ${next.failureReason ?? 'lỗi không rõ'}. Nhờ kho đo SKU rồi tính lại.`,
            `Could not compute: ${next.failureReason ?? 'unknown error'}. Measure the SKU, then recompute.`,
          ),
        )
        return
      }
      onDone(t('Đã tính kế hoạch mới — nhóm chuyển sang «Chờ chấp nhận kế hoạch».', 'New plan computed — group moved to pending approval.'))
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-rose-950 dark:text-rose-100">
          {t('Kế hoạch đã bị từ chối', 'Plan was rejected')}: {reasonText(plan, vi)}
        </p>
        <p className="text-xs text-rose-900 dark:text-rose-200">
          {t('Bởi', 'By')} {plan.rejection?.rejectedByName ?? '—'}
          {plan.rejectedAt ? ` · ${formatDateTime(plan.rejectedAt)}` : ''}
          {plan.rejection?.overdue ? t(' · Quá hạn xử lý', ' · Overdue') : ''}
        </p>
      </div>

      {busy === 'recompute' ? (
        <p className="text-sm text-rose-950 dark:text-rose-100">{t('Đang tính kế hoạch mới…', 'Computing a new plan…')}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryBtn} disabled={locked} onClick={() => void onRecompute()}>
          <RefreshCw className="h-4 w-4" />
          {t('Tính lại kế hoạch', 'Recompute plan')}
        </button>
        <button type="button" className={secondaryBtn} disabled={locked} onClick={() => setMode(mode === 'manual' ? 'none' : 'manual')}>
          {t('Đóng gói thủ công', 'Pack manually')}
        </button>
        <button type="button" className={secondaryBtn} disabled={locked} onClick={() => setMode(mode === 'back' ? 'none' : 'back')}>
          {t('Trả về lấy hàng', 'Back to picking')}
        </button>
      </div>
      {!canAct ? (
        <p className="text-xs text-rose-900 dark:text-rose-200">
          {t('Chỉ Nhân viên đóng gói hoặc Admin xử lý được kế hoạch bị từ chối.', 'Only packing staff or Admin can resolve a rejected plan.')}
        </p>
      ) : null}

      {mode === 'back' && canAct ? (
        <BackToPickingForm
          skus={skus}
          vi={vi}
          busy={busy !== null}
          onSubmit={async (items, note) => {
            setBusy('back')
            setError(null)
            try {
              onPlan(await backToPicking(groupId, { expectedVersion: plan.version, items, note }))
              onDone(t('Đã trả về lấy hàng — kho quét bù số món đã khai.', 'Sent back to picking.'))
            } catch (err: unknown) {
              setError(formatApiError(err))
            } finally {
              setBusy(null)
            }
          }}
        />
      ) : null}

      {mode === 'manual' && canAct ? (
        <ManualPackForm
          plan={plan}
          units={units}
          vi={vi}
          busy={busy !== null}
          onSubmit={async (parcels, note) => {
            setBusy('manual')
            setError(null)
            try {
              onPlan(await manualPackPlan(groupId, { expectedVersion: plan.version, parcels, note }))
              onDone(t('Đã lưu kế hoạch đóng tay — cần NGƯỜI KHÁC chấp nhận.', 'Manual plan saved — someone else must approve it.'))
            } catch (err: unknown) {
              setError(formatApiError(err))
            } finally {
              setBusy(null)
            }
          }}
        />
      ) : null}

      {error ? <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  )
}

function BackToPickingForm({
  skus,
  vi,
  busy,
  onSubmit,
}: {
  skus: string[]
  vi: boolean
  busy: boolean
  onSubmit: (items: { sku: string; quantity: number; restock?: boolean }[], note?: string) => Promise<void>
}) {
  const [sku, setSku] = useState(skus[0] ?? '')
  const [qty, setQty] = useState('1')
  const [restock, setRestock] = useState(false)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const t = (a: string, b: string): string => (vi ? a : b)
  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface p-3 text-sm">
      <p className="font-semibold text-ink">{t('Món phải lấy lại', 'Items to pick again')}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
        <select className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)} aria-label="SKU">
          {skus.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" aria-label={t('Số lượng', 'Quantity')} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        {t('Hàng còn tốt (lấy nhầm), nhập lại kệ — bỏ trống nếu hàng hỏng', 'Good item picked by mistake, restock — leave unchecked if damaged')}
      </label>
      <input className={`${inputClass} w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Ghi chú (tuỳ chọn)', 'Note (optional)')} />
      {problem ? <p className="text-xs text-rose-700 dark:text-rose-300">{problem}</p> : null}
      <button
        type="button"
        className={secondaryBtn}
        disabled={busy}
        onClick={() => {
          const quantity = Number(qty)
          if (!sku || !Number.isInteger(quantity) || quantity < 1) {
            setProblem(t('Chọn SKU và nhập số lượng ≥ 1.', 'Pick a SKU and a quantity ≥ 1.'))
            return
          }
          setProblem(null)
          void onSubmit([{ sku, quantity, restock }], note.trim() || undefined)
        }}
      >
        {t('Xác nhận trả về lấy hàng', 'Confirm back to picking')}
      </button>
    </div>
  )
}

function ManualPackForm({
  plan,
  units,
  vi,
  busy,
  onSubmit,
}: {
  plan: PackingPlan
  units: ManualUnit[]
  vi: boolean
  busy: boolean
  onSubmit: (parcels: { orderId: string; boxCode: string; itemKeys: string[] }[], note: string) => Promise<void>
}) {
  const initial = useMemo(() => initialManualDraft(plan, units), [plan, units])
  const [parcels, setParcels] = useState<ManualParcelDraft[]>(initial.parcels)
  const [assign, setAssign] = useState<Record<string, number>>(initial.assign)
  const [note, setNote] = useState('')
  const [boxes, setBoxes] = useState<PackagingMaterialStock[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const t = (a: string, b: string): string => (vi ? a : b)

  useEffect(() => {
    let cancelled = false
    void listPackagingMaterials()
      .then((rows) => {
        if (!cancelled) setBoxes(rows.filter((r) => r.isActive && (r.kind === 'box' || r.kind === 'mailer')))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const orders = plan.orders.filter((o): o is typeof o & { orderId: string } => Boolean(o.orderId))
  const nextId = (): number => Math.max(0, ...parcels.map((p) => p.id)) + 1

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
      <p className="text-xs text-ink-muted">
        {t(
          'Nhập kiện thật đã đóng: mỗi món nằm đúng 1 kiện của đơn mình. Kế hoạch đóng tay cần NGƯỜI KHÁC chấp nhận.',
          'Enter the real parcels: each item in exactly one parcel of its order. Someone else must approve a manual plan.',
        )}
      </p>
      {orders.map((order) => {
        const mine = parcels.filter((p) => p.orderId === order.orderId)
        const items = units.filter((u) => u.orderId === order.orderId)
        return (
          <fieldset key={order.orderId} className="space-y-2 rounded-lg border border-hairline p-2">
            <legend className="px-1 text-xs font-semibold text-ink">
              {t('Đơn', 'Order')} {order.platformOrderId ?? order.orderId.slice(-6)}
              {order.recipientName ? ` · ${order.recipientName}` : ''}
            </legend>
            {mine.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">#{p.id}</span>
                <select
                  className={inputClass}
                  value={p.boxCode}
                  aria-label={t(`Thùng kiện ${String(p.id)}`, `Box of parcel ${String(p.id)}`)}
                  onChange={(e) => setParcels((all) => all.map((x) => (x.id === p.id ? { ...x, boxCode: e.target.value } : x)))}
                >
                  <option value="">{t('— Chọn thùng —', '— Pick a box —')}</option>
                  {/* Giữ mã thùng cũ dù danh mục chưa tải xong / đã hết. */}
                  {p.boxCode && !boxes.some((b) => b.code === p.boxCode) ? <option value={p.boxCode}>{p.boxCode}</option> : null}
                  {boxes.map((b) => (
                    <option key={b.code} value={b.code}>
                      {`${b.code} · ${b.name} (${t('còn', 'left')} ${String(b.qtyNew + b.qtyReused)})`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-rose-700 underline dark:text-rose-300"
                  onClick={() => {
                    setParcels((all) => all.filter((x) => x.id !== p.id))
                    setAssign((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== p.id)))
                  }}
                >
                  {t('Xoá kiện', 'Remove')}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-emerald-800 underline dark:text-emerald-300"
              onClick={() => setParcels((all) => [...all, { id: nextId(), orderId: order.orderId, boxCode: '' }])}
            >
              {t('+ Thêm kiện cho đơn này', '+ Add parcel for this order')}
            </button>
            <ul className="space-y-1">
              {items.map((u) => (
                <li key={u.itemKey} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{u.itemKey}</span>
                  <select
                    className={inputClass}
                    value={assign[u.itemKey] ?? ''}
                    aria-label={t(`Kiện của món ${u.itemKey}`, `Parcel of ${u.itemKey}`)}
                    onChange={(e) => setAssign((a) => ({ ...a, [u.itemKey]: Number(e.target.value) }))}
                  >
                    <option value="">{t('— Kiện —', '— Parcel —')}</option>
                    {mine.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}
      <input
        className={`${inputClass} w-full`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('Vì sao đóng thủ công (bắt buộc)', 'Why pack manually (required)')}
      />
      {problem ? <p className="text-xs text-rose-700 dark:text-rose-300">{problem}</p> : null}
      <button
        type="button"
        className={primaryBtn}
        disabled={busy}
        onClick={() => {
          const issue = manualDraftProblem(units, parcels, assign, note, vi)
          setProblem(issue)
          if (issue) return
          void onSubmit(
            parcels.map((p) => ({
              orderId: p.orderId,
              boxCode: p.boxCode,
              itemKeys: units.filter((u) => assign[u.itemKey] === p.id).map((u) => u.itemKey),
            })),
            note.trim(),
          )
        }}
      >
        {t('Lưu kế hoạch đóng tay', 'Save manual plan')}
      </button>
    </div>
  )
}
