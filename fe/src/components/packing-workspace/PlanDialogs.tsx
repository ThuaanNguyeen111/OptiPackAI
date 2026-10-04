import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReason,
  type PackagingBox,
} from '../../types/packaging'
import type { PackingPlan, PlanParcel } from '../../types/packing-plan'
import { dims, orderLabel } from './format'

/** Hộp thoại chỉnh tay kế hoạch (04/10/2026): đổi thùng, chuyển món, tính lại có điều kiện, chuyển xử lý tay. */

const field = 'w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none'
const labelCls = 'mb-1.5 block text-xs font-medium text-ink-muted'

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-hairline bg-surface-1 text-ink">
        <DialogHeader>
          <DialogTitle className="text-ink">{title}</DialogTitle>
          <DialogDescription className="text-ink-muted">{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReasonFields({
  reason,
  note,
  onReason,
  onNote,
  vi,
}: {
  reason: AdjustmentReason
  note: string
  onReason: (r: AdjustmentReason) => void
  onNote: (n: string) => void
  vi: boolean
}) {
  return (
    <>
      <div>
        <label className={labelCls} htmlFor="adjust-reason">
          {vi ? 'Lý do' : 'Reason'}
        </label>
        <select
          id="adjust-reason"
          className={field}
          value={reason}
          onChange={(e) => onReason(e.target.value as AdjustmentReason)}
        >
          {ADJUSTMENT_REASONS.map((r) => (
            <option key={r} value={r}>
              {vi ? ADJUSTMENT_REASON_LABELS[r].vi : ADJUSTMENT_REASON_LABELS[r].en}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="adjust-note">
          {vi ? 'Ghi chú' : 'Note'}
          {reason === 'OTHER' && <span className="text-error"> *</span>}
        </label>
        <textarea
          id="adjust-note"
          rows={2}
          maxLength={500}
          className={field}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>
    </>
  )
}

function Submit({ busy, disabled, onClick, children }: { busy: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button onClick={onClick} disabled={busy || disabled} className="gap-1.5">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}

export function ChangeBoxDialog({
  open,
  onOpenChange,
  parcel,
  boxes,
  busy,
  vi,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parcel: PlanParcel
  boxes: PackagingBox[]
  busy: boolean
  vi: boolean
  onSubmit: (input: { boxCode: string; reason: AdjustmentReason; note?: string }) => void
}) {
  const options = boxes.filter((b) => b.isActive && b.code !== parcel.box.code)
  const [boxCode, setBoxCode] = useState(options[0]?.code ?? '')
  const [reason, setReason] = useState<AdjustmentReason>('RECOMMENDED_BOX_NOT_IN_STOCK')
  const [note, setNote] = useState('')
  const noteMissing = reason === 'OTHER' && note.trim().length === 0
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={vi ? `Đổi thùng — kiện ${String(parcel.parcelNo)}` : `Change box — parcel ${String(parcel.parcelNo)}`}
      description={
        vi
          ? 'Hệ thống xếp lại đúng các món của kiện này vào thùng mới và kiểm tra lại. Không vừa thì báo lỗi, kế hoạch giữ nguyên.'
          : 'The items of this parcel are re-packed into the new box and re-validated. If they do not fit, the plan stays unchanged.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {vi ? 'Huỷ' : 'Cancel'}
          </Button>
          <Submit
            busy={busy}
            disabled={!boxCode || noteMissing}
            onClick={() => onSubmit({ boxCode, reason, note: note.trim() || undefined })}
          >
            {vi ? 'Đổi thùng' : 'Change box'}
          </Submit>
        </>
      }
    >
      <fieldset>
        <legend className={labelCls}>{vi ? 'Thùng mới' : 'New box'}</legend>
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {options.map((b) => (
            <label
              key={b.code}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                boxCode === b.code ? 'border-primary bg-primary/10' : 'border-hairline hover:bg-surface-2'
              } ${b.available <= 0 ? 'opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="box"
                value={b.code}
                checked={boxCode === b.code}
                disabled={b.available <= 0}
                onChange={() => setBoxCode(b.code)}
                className="accent-[var(--app-primary)]"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{b.code}</span>
                <span className="ml-2 text-xs tabular-nums text-ink-subtle">{dims(b.inner, vi)}</span>
              </span>
              <span className={`text-xs tabular-nums ${b.available <= 0 ? 'text-error' : 'text-ink-subtle'}`}>
                {b.available <= 0 ? (vi ? 'hết' : 'out') : `${vi ? 'còn' : 'left'} ${String(b.available)}`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <ReasonFields reason={reason} note={note} onReason={setReason} onNote={setNote} vi={vi} />
    </Shell>
  )
}

export function MoveItemDialog({
  open,
  onOpenChange,
  plan,
  parcel,
  itemKey,
  busy,
  vi,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PackingPlan
  parcel: PlanParcel
  itemKey: string
  busy: boolean
  vi: boolean
  onSubmit: (input: { toParcelNo: number | null; reason: AdjustmentReason; note?: string }) => void
}) {
  const targets = plan.parcels.filter((p) => p.orderId === parcel.orderId && p.parcelNo !== parcel.parcelNo)
  const [target, setTarget] = useState<string>(targets[0] ? String(targets[0].parcelNo) : 'new')
  const [reason, setReason] = useState<AdjustmentReason>('OTHER')
  const [note, setNote] = useState('')
  const noteMissing = reason === 'OTHER' && note.trim().length === 0
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={vi ? `Chuyển món ${itemKey}` : `Move item ${itemKey}`}
      description={
        vi
          ? `Chỉ chuyển giữa các kiện của cùng đơn ${orderLabel(parcel)}. Hai kiện bị ảnh hưởng được xếp lại và kiểm tra.`
          : `Items can only move between parcels of order ${orderLabel(parcel)}. Both affected parcels are re-packed and validated.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {vi ? 'Huỷ' : 'Cancel'}
          </Button>
          <Submit
            busy={busy}
            disabled={noteMissing}
            onClick={() =>
              onSubmit({ toParcelNo: target === 'new' ? null : Number(target), reason, note: note.trim() || undefined })
            }
          >
            {vi ? 'Chuyển' : 'Move'}
          </Submit>
        </>
      }
    >
      <div>
        <label className={labelCls} htmlFor="move-target">
          {vi ? 'Sang kiện' : 'To parcel'}
        </label>
        <select id="move-target" className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.parcelNo} value={String(t.parcelNo)}>
              {vi ? 'Kiện' : 'Parcel'} {t.parcelNo} · {t.box.code}
            </option>
          ))}
          <option value="new">{vi ? 'Kiện mới (hệ thống chọn thùng)' : 'New parcel (box chosen automatically)'}</option>
        </select>
      </div>
      <ReasonFields reason={reason} note={note} onReason={setReason} onNote={setNote} vi={vi} />
    </Shell>
  )
}

export function RecomputeDialog({
  open,
  onOpenChange,
  plan,
  boxes,
  busy,
  vi,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PackingPlan | null
  boxes: PackagingBox[]
  busy: boolean
  vi: boolean
  onSubmit: (input: { excludeBoxCodes: string[]; prefer: 'fewest_parcels' | 'cheapest' }) => void
}) {
  const [prefer, setPrefer] = useState<'fewest_parcels' | 'cheapest'>(
    plan?.solver.options.prefer === 'cheapest' ? 'cheapest' : 'fewest_parcels',
  )
  const [excluded, setExcluded] = useState<Set<string>>(new Set(plan?.solver.options.excludeBoxCodes ?? []))
  const active = boxes.filter((b) => b.isActive)
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={vi ? 'Tính lại với điều kiện' : 'Recompute with conditions'}
      description={
        vi
          ? 'Phương án hiện tại bị thay bằng lần tính mới. Dùng khi thực tế khác dữ liệu (thùng hỏng, muốn ưu tiên chi phí…).'
          : 'The current plan is replaced by a new computation. Use it when reality differs from the data.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {vi ? 'Huỷ' : 'Cancel'}
          </Button>
          <Submit
            busy={busy}
            disabled={excluded.size >= active.length}
            onClick={() => onSubmit({ excludeBoxCodes: [...excluded], prefer })}
          >
            {vi ? 'Tính lại' : 'Recompute'}
          </Submit>
        </>
      }
    >
      <fieldset>
        <legend className={labelCls}>{vi ? 'Ưu tiên' : 'Prefer'}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['fewest_parcels', 'cheapest'] as const).map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                prefer === p ? 'border-primary bg-primary/10 text-ink' : 'border-hairline text-ink-muted hover:bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="prefer"
                checked={prefer === p}
                onChange={() => setPrefer(p)}
                className="accent-[var(--app-primary)]"
              />
              {p === 'fewest_parcels' ? (vi ? 'Ít kiện nhất' : 'Fewest parcels') : vi ? 'Rẻ nhất' : 'Cheapest'}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={labelCls}>{vi ? 'Không dùng thùng' : 'Exclude boxes'}</legend>
        <div className="flex flex-wrap gap-1.5">
          {active.map((b) => {
            const on = excluded.has(b.code)
            return (
              <button
                key={b.code}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev)
                    if (on) next.delete(b.code)
                    else next.add(b.code)
                    return next
                  })
                }
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  on ? 'border-error/40 bg-error/10 text-error line-through' : 'border-hairline text-ink-muted hover:bg-surface-2'
                }`}
              >
                {b.code}
              </button>
            )
          })}
        </div>
      </fieldset>
    </Shell>
  )
}

export function RejectDialog({
  open,
  onOpenChange,
  busy,
  vi,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  vi: boolean
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={vi ? 'Chuyển xử lý ngoài hệ thống' : 'Move to manual handling'}
      description={
        vi
          ? 'Dùng khi nhóm này không đóng theo hệ thống được (cần thùng gỗ, hàng đặc biệt…). Nhóm quay về "đã lấy hàng" và không tự tính lại.'
          : 'Use when this group cannot be packed by the system. The group returns to "picked" and is not recomputed automatically.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {vi ? 'Huỷ' : 'Cancel'}
          </Button>
          <Submit busy={busy} disabled={reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>
            {vi ? 'Xác nhận' : 'Confirm'}
          </Submit>
        </>
      }
    >
      <div>
        <label className={labelCls} htmlFor="reject-reason">
          {vi ? 'Lý do (tối thiểu 3 ký tự)' : 'Reason (at least 3 characters)'}
        </label>
        <textarea
          id="reject-reason"
          rows={3}
          maxLength={500}
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Shell>
  )
}
