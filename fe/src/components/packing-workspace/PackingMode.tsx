import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Lightbulb, Loader2, PackageCheck, RefreshCw, Scale, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Packing3DViewer } from '../packing3d/Packing3DViewer'
import { materialLabel } from '../../types/packaging'
import type { PackingPlan, PlanParcel } from '../../types/packing-plan'
import { dims, fallbackInstruction, kg, orderLabel, sortedPlacements } from './format'

/**
 * Chế độ đóng gói toàn màn hình (04/10/2026, thay trang từng bước cũ).
 * Với mỗi kiện: chuẩn bị → từng món (3D + câu chữ to) → cân kiện;
 * cuối cùng xác nhận đã đóng cả nhóm. Phím ←/→ để chuyển bước.
 */
type Frame =
  | { kind: 'prepare'; parcelNo: number }
  | { kind: 'item'; parcelNo: number; step: number }
  | { kind: 'weigh'; parcelNo: number }
  | { kind: 'confirm' }

const ABNORMAL_RATIO = 0.2

export function PackingMode({
  plan,
  groupLabel,
  vi,
  busy,
  error,
  guideLoading,
  guideError,
  onLoadGuide,
  onPack,
  onClose,
}: {
  plan: PackingPlan
  groupLabel: string
  vi: boolean
  busy: boolean
  error: string | null
  guideLoading: number | null
  guideError: string | null
  onLoadGuide: (parcelNo: number, regenerate?: boolean) => void
  onPack: (weights: { parcelNo: number; weightKg: number }[]) => Promise<boolean>
  onClose: () => void
}) {
  const frames = useMemo<Frame[]>(
    () => [
      ...plan.parcels.flatMap((p): Frame[] => [
        { kind: 'prepare', parcelNo: p.parcelNo },
        ...sortedPlacements(p).map((_, i): Frame => ({ kind: 'item', parcelNo: p.parcelNo, step: i + 1 })),
        { kind: 'weigh', parcelNo: p.parcelNo },
      ]),
      { kind: 'confirm' },
    ],
    [plan.parcels],
  )
  const [index, setIndex] = useState(0)
  const [weights, setWeights] = useState<Record<number, string>>({})
  const frame = frames[Math.min(index, frames.length - 1)] ?? { kind: 'confirm' }
  const parcel = frame.kind === 'confirm' ? null : (plan.parcels.find((p) => p.parcelNo === frame.parcelNo) ?? null)
  const placements = parcel ? sortedPlacements(parcel) : []
  const parcelPosition = parcel ? plan.parcels.indexOf(parcel) + 1 : plan.parcels.length

  // Vào kiện mới mà chưa có hướng dẫn → xin máy chủ viết (AI hoặc câu mẫu).
  const needsGuide = parcel !== null && parcel.guide === null && guideLoading === null && guideError === null
  const parcelNo = parcel?.parcelNo ?? null
  useEffect(() => {
    if (needsGuide && parcelNo !== null) onLoadGuide(parcelNo)
  }, [needsGuide, parcelNo, onLoadGuide])

  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(frames.length - 1, i + delta)))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const parsed = (no: number): number | null => {
    const v = Number((weights[no] ?? '').replace(',', '.'))
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const allWeighed = plan.parcels.every((p) => parsed(p.parcelNo) !== null)
  const currentItem = frame.kind === 'item' ? placements[frame.step - 1] : undefined
  const guideStep = frame.kind === 'item' ? parcel?.guide?.steps.find((s) => s.step === frame.step) : undefined

  return (
    <div role="dialog" aria-modal="true" aria-label={vi ? 'Chế độ đóng gói' : 'Packing mode'} className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink">
      {/* Đầu trang + tiến độ */}
      <header className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <PackageCheck className="h-5 w-5 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {vi ? 'Đóng gói nhóm' : 'Packing group'} <span className="font-mono">{groupLabel}</span>
          </p>
          <p className="text-xs tabular-nums text-ink-muted">
            {frame.kind === 'confirm'
              ? vi
                ? 'Xác nhận cuối'
                : 'Final check'
              : `${vi ? 'Kiện' : 'Parcel'} ${String(parcelPosition)}/${String(plan.parcels.length)}${
                  frame.kind === 'item' ? ` · ${vi ? 'Bước' : 'Step'} ${String(frame.step)}/${String(placements.length)}` : ''
                }`}
          </p>
        </div>
        <Button variant="tertiary" onClick={onClose} className="ml-auto gap-1.5">
          <X className="h-4 w-4" />
          {vi ? 'Thoát' : 'Exit'}
        </Button>
      </header>
      <div className="h-1 bg-surface-2" aria-hidden>
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${String(((index + 1) / frames.length) * 100)}%` }} />
      </div>

      {/* Thân: 3D + nội dung bước */}
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:overflow-hidden">
        {parcel ? (
          <Packing3DViewer
            key={parcel.parcelNo}
            parcel={parcel}
            itemProfiles={plan.itemProfiles}
            vi={vi}
            visibleCount={frame.kind === 'prepare' ? 0 : frame.kind === 'item' ? frame.step : undefined}
            focusItemKey={currentItem?.itemKey ?? null}
            animateDrops={frame.kind === 'item'}
            muteOthers={frame.kind === 'item'}
            className="h-[48vh] lg:h-full"
          />
        ) : (
          <ConfirmTable plan={plan} vi={vi} parsed={parsed} />
        )}

        <section className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto" aria-live="polite">
          {frame.kind === 'prepare' && parcel && (
            <PreparePanel
              parcel={parcel}
              plan={plan}
              vi={vi}
              guideLoading={guideLoading === parcel.parcelNo}
              guideError={guideError}
              onRegenerate={() => onLoadGuide(parcel.parcelNo, true)}
            />
          )}

          {frame.kind === 'item' && currentItem && (
            <div className="space-y-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                {vi ? 'Bước' : 'Step'} {frame.step}/{placements.length}
              </p>
              <p className="text-2xl leading-snug font-semibold text-balance">
                {guideStep?.instruction ?? fallbackInstruction(currentItem, vi)}
              </p>
              {guideStep?.tip && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                  {guideStep.tip}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md bg-surface-2 px-2.5 py-1 font-mono">{currentItem.sku}</span>
                <span className="tabular-nums text-ink-muted">
                  {dims({ lengthMm: currentItem.dx, widthMm: currentItem.dy, heightMm: currentItem.dz }, vi)}
                </span>
                {currentItem.folded && <Badge tone="primary">{vi ? 'Gập đôi' : 'Fold in half'}</Badge>}
                {currentItem.z > 0 && <Badge>{vi ? 'Đặt chồng' : 'Stacked'}</Badge>}
              </div>
            </div>
          )}

          {frame.kind === 'weigh' && parcel && (
            <WeighPanel
              parcel={parcel}
              vi={vi}
              value={weights[parcel.parcelNo] ?? ''}
              parsed={parsed(parcel.parcelNo)}
              onChange={(v) => setWeights((w) => ({ ...w, [parcel.parcelNo]: v }))}
              onEnter={() => go(1)}
            />
          )}

          {frame.kind === 'confirm' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">{vi ? 'Xác nhận đã đóng xong' : 'Confirm packing is done'}</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                {vi
                  ? 'Hệ thống trừ thùng và vật tư khỏi kho, ghi cân thật từng kiện. Kiện lệch hơn 20% so với ước tính sẽ được đánh dấu để kiểm tra.'
                  : 'Boxes and materials are deducted from stock and each parcel’s real weight is recorded. Parcels more than 20% off the estimate are flagged.'}
              </p>
              {!allWeighed && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {vi ? 'Còn kiện chưa nhập cân — quay lại bước cân của kiện đó.' : 'Some parcels have no weight yet.'}
                </p>
              )}
              {error && (
                <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                  {error}
                </p>
              )}
              <Button
                className="min-h-12 w-full gap-2 text-base"
                disabled={!allWeighed || busy}
                onClick={() => {
                  void onPack(
                    plan.parcels.map((p) => ({ parcelNo: p.parcelNo, weightKg: parsed(p.parcelNo) ?? 0 })),
                  ).then((ok) => {
                    if (ok) onClose()
                  })
                }}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {vi ? 'Xác nhận đã đóng' : 'Confirm packed'}
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Điều hướng */}
      <footer className="flex items-center gap-3 border-t border-hairline px-4 py-3 sm:px-6">
        <Button variant="secondary" className="min-h-12 gap-2 px-5" onClick={() => go(-1)} disabled={index === 0}>
          <ArrowLeft className="h-4 w-4" />
          {vi ? 'Trước' : 'Back'}
        </Button>
        <span className="hidden text-xs text-ink-subtle sm:inline">{vi ? 'Phím ← → để chuyển bước' : 'Use ← → keys'}</span>
        {frame.kind !== 'confirm' && (
          <Button
            className="ml-auto min-h-12 gap-2 px-6"
            onClick={() => go(1)}
            disabled={frame.kind === 'weigh' && parcel !== null && parsed(parcel.parcelNo) === null}
          >
            {frame.kind === 'prepare' ? (vi ? 'Bắt đầu xếp' : 'Start') : vi ? 'Tiếp' : 'Next'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </footer>
    </div>
  )
}

function PreparePanel({
  parcel,
  plan,
  vi,
  guideLoading,
  guideError,
  onRegenerate,
}: {
  parcel: PlanParcel
  plan: PackingPlan
  vi: boolean
  guideLoading: boolean
  guideError: string | null
  onRegenerate: () => void
}) {
  const counts = new Map<string, number>()
  for (const p of parcel.placements) counts.set(p.sku, (counts.get(p.sku) ?? 0) + 1)
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          {vi ? 'Chuẩn bị' : 'Prepare'} · {vi ? 'đơn' : 'order'} {orderLabel(parcel)}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">
          {vi ? 'Lấy thùng' : 'Take box'} {parcel.box.code}
        </h2>
        <p className="mt-1 text-sm tabular-nums text-ink-muted">
          {parcel.box.name} · {vi ? 'lòng trong' : 'inside'} {dims(parcel.box.innerMm, vi)}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{vi ? 'Hàng cho kiện này' : 'Items for this parcel'}</h3>
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {[...counts].map(([sku, n]) => {
            const profile = plan.itemProfiles.find((i) => i.sku === sku)
            return (
              <li key={sku} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono">{sku}</span>
                <span className="flex items-center gap-2 text-ink-muted">
                  {profile?.zipBagCode && (
                    <Badge>
                      {vi ? 'Túi' : 'Bag'} {profile.zipBagCode}
                    </Badge>
                  )}
                  <span className="tabular-nums">× {n}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {parcel.materials.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{vi ? 'Vật tư chèn' : 'Filler materials'}</h3>
          <ul className="space-y-1 text-sm">
            {parcel.materials.map((m) => (
              <li key={`${m.type}-${m.code ?? ''}`} className="flex justify-between">
                <span>{materialLabel(m, vi)}</span>
                <span className="tabular-nums text-ink-muted">
                  {m.quantity} {m.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="mb-1.5 flex items-center gap-2 text-xs text-ink-subtle">
          <Bot className="h-3.5 w-3.5" />
          {parcel.guide
            ? parcel.guide.source === 'ai'
              ? `AI · ${parcel.guide.model ?? ''}`
              : vi
                ? 'Câu mẫu'
                : 'Template'
            : vi
              ? 'Hướng dẫn'
              : 'Guide'}
          {parcel.guide && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={guideLoading}
              className="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${guideLoading ? 'animate-spin' : ''}`} />
              {vi ? 'Viết lại' : 'Rewrite'}
            </button>
          )}
        </div>
        {guideLoading && !parcel.guide ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi ? 'Đang viết hướng dẫn…' : 'Writing guide…'}
          </p>
        ) : parcel.guide ? (
          <p className="text-sm leading-relaxed">{parcel.guide.summary}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            {guideError ?? (vi ? 'Sẽ dùng câu hướng dẫn cơ bản cho từng bước.' : 'Basic step instructions will be used.')}
          </p>
        )}
      </div>
    </div>
  )
}

function WeighPanel({
  parcel,
  vi,
  value,
  parsed,
  onChange,
  onEnter,
}: {
  parcel: PlanParcel
  vi: boolean
  value: string
  parsed: number | null
  onChange: (v: string) => void
  onEnter: () => void
}) {
  const estimateKg = parcel.estimatedWeightG / 1000
  const off = parsed !== null && estimateKg > 0 ? Math.abs(parsed - estimateKg) / estimateKg : 0
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        <Scale className="mr-1 inline h-3.5 w-3.5" />
        {vi ? 'Cân kiện' : 'Weigh parcel'} {parcel.parcelNo}
      </p>
      <h2 className="text-2xl font-semibold">{vi ? 'Dán kín thùng rồi đặt lên cân' : 'Seal the box and weigh it'}</h2>
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">
          {vi ? 'Cân thật (kg)' : 'Actual weight (kg)'} · {vi ? 'ước tính' : 'estimate'} {kg(parcel.estimatedWeightG, vi)}
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsed !== null) onEnter()
          }}
          className="w-full rounded-lg border border-hairline bg-surface-1 px-4 py-3 text-3xl font-semibold tabular-nums text-ink focus:border-primary focus:outline-none"
          placeholder="0.00"
        />
      </label>
      {off > ABNORMAL_RATIO && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {vi
            ? `Lệch ${String(Math.round(off * 100))}% so với ước tính — kiểm tra lại hàng trong thùng. Vẫn có thể tiếp tục, kiện sẽ được đánh dấu.`
            : `${String(Math.round(off * 100))}% off the estimate — double-check the contents. You can continue; the parcel will be flagged.`}
        </p>
      )}
    </div>
  )
}

function ConfirmTable({ plan, vi, parsed }: { plan: PackingPlan; vi: boolean; parsed: (no: number) => number | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs text-ink-muted">
          <tr>
            <th className="px-4 py-2 font-medium">{vi ? 'Kiện' : 'Parcel'}</th>
            <th className="px-4 py-2 font-medium">{vi ? 'Đơn' : 'Order'}</th>
            <th className="px-4 py-2 font-medium">{vi ? 'Thùng' : 'Box'}</th>
            <th className="px-4 py-2 text-right font-medium">{vi ? 'Ước tính' : 'Estimate'}</th>
            <th className="px-4 py-2 text-right font-medium">{vi ? 'Cân thật' : 'Actual'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {plan.parcels.map((p) => {
            const w = parsed(p.parcelNo)
            return (
              <tr key={p.parcelNo}>
                <td className="px-4 py-2.5 tabular-nums">{p.parcelNo}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{orderLabel(p)}</td>
                <td className="px-4 py-2.5">{p.box.code}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{kg(p.estimatedWeightG, vi)}</td>
                <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${w === null ? 'text-error' : ''}`}>
                  {w === null ? (vi ? 'chưa cân' : 'missing') : kg(w * 1000, vi)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
