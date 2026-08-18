import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Check,
  ChevronDown,
  GitMerge,
  Leaf,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Search,
  Sparkles,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import {
  Hero3DCanvas,
  type PackingCameraView,
} from '../marketing/Hero3DCanvas'
import { Button } from '../ui/Button'
import { usePortal } from '../../context/use-portal'
import {
  packingJobs,
  type PackingJob,
} from '../../data/packing-dashboard-mock'
import {
  CARTON_INVENTORY,
  formatCartonDimensions,
  getCartonByCode,
} from '../../data/cartons'
import { channelColors, channelLabels } from '../../data/portal-mock'
import { formatCurrency } from '../../utils/format'

const glass =
  'rounded-xl border border-hairline/90 bg-surface-1/75 backdrop-blur-xl shadow-[0_0_40px_rgba(94,106,210,0.07)]'

function formatKg(g: number) {
  return `${g.toLocaleString('vi-VN')}g`
}

const CHANNEL_PILL: Record<string, string> = {
  shopee: 'border-shopee/30 bg-shopee/10 text-shopee',
  tiktok: 'border-tiktok/30 bg-tiktok/10 text-tiktok',
  lazada: 'border-[#0F146D]/30 bg-[#0F146D]/10 text-[#4F6BFF]',
  facebook: 'border-[#1877F2]/30 bg-[#1877F2]/10 text-[#1877F2]',
}

export function PackingDashboard() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [jobId, setJobId] = useState(packingJobs[0].id)
  const [jobs, setJobs] = useState(packingJobs)
  const [activeStep, setActiveStep] = useState<string | null>(null)
  const [cameraView, setCameraView] = useState<PackingCameraView>('iso')
  const [paused, setPaused] = useState(false)
  const [replayToken, setReplayToken] = useState(0)
  const [cartonOpen, setCartonOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const selectorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!selectorRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const job = jobs.find((j) => j.id === jobId) ?? jobs[0]
  const recommended = job.couriers.find((c) => c.recommended) ?? job.couriers[0]
  const fillPct = Math.round(job.fill_ratio * 100)
  const highlightedItemIds = useMemo(() => {
    const step = job.sequence.find((s) => s.id === activeStep)
    return step?.item_ids ?? []
  }, [activeStep, job.sequence])

  const filtered = jobs.filter((j) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      j.selector_label.toLowerCase().includes(q) ||
      j.customer_name.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q)
    )
  })

  const canConsolidate =
    job.classification === 'pending_merge' && job.source_orders.length > 1

  function selectJob(next: PackingJob) {
    setJobId(next.id)
    setOpen(false)
    setQuery('')
    setActiveStep(null)
  }

  function confirmPrint() {
    setToast(
      vi
        ? 'Đã sinh nhãn QR/Barcode. Chuyển sang Vận chuyển…'
        : 'QR/Barcode label generated. Opening Shipping…',
    )
    window.setTimeout(() => navigate('/app/shipping'), 700)
  }

  function selectCarton(code: string) {
    const carton = getCartonByCode(code)
    const dims = formatCartonDimensions(carton)
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? {
              ...j,
              box_code: code,
              dimensions: dims,
              dim: {
                w: carton.width,
                l: carton.length,
                h: carton.height,
              },
            }
          : j,
      ),
    )
    setCartonOpen(false)
    setPaused(false)
    setReplayToken((n) => n + 1)
    setToast(vi ? `Đã đổi hộp sang ${code}` : `Box overridden to ${code}`)
  }

  function consolidate() {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id ? { ...j, classification: 'consolidated' as const } : j,
      ),
    )
    setToast(
      vi
        ? `Đã gộp ${job.source_orders.map((s) => s.label).join(' + ')}`
        : `Consolidated ${job.source_orders.map((s) => s.label).join(' + ')}`,
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-28 sm:p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          {/* Header — isolated stacking so dropdown floats above bento grid */}
          <header className={`${glass} relative z-30 p-4 sm:p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div ref={selectorRef} className="relative min-w-0 flex-1 lg:max-w-xl">
                <p className="text-[11px] font-medium tracking-[0.14em] text-primary-hover uppercase">
                  {vi ? 'AI 3D Bin Packing & Fulfillment' : 'AI 3D Bin Packing'}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  className={`mt-2 flex w-full items-center justify-between gap-2 rounded-lg border bg-canvas px-3 py-2.5 text-left transition-colors ${
                    open
                      ? 'border-primary/40 ring-1 ring-primary/30'
                      : 'border-hairline hover:border-hairline-strong'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] font-medium text-ink">
                      {job.selector_label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-subtle">
                      {job.customer_name} · {job.customer_address}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open ? (
                  <div className="absolute top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center gap-2 border-b border-hairline bg-canvas px-3 py-2">
                      <Search className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={
                          vi ? 'Tìm SKU / Order ID…' : 'Search order…'
                        }
                        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
                      />
                    </div>
                    <ul className="max-h-64 overflow-auto py-1">
                      {filtered.length === 0 ? (
                        <li className="px-3 py-6 text-center text-xs text-ink-subtle">
                          {vi ? 'Không tìm thấy đơn' : 'No orders found'}
                        </li>
                      ) : (
                        filtered.map((j) => {
                          const selected = j.id === job.id
                          const mergeable =
                            j.classification === 'pending_merge' &&
                            j.source_orders.length > 1
                          return (
                            <li key={j.id}>
                              <button
                                type="button"
                                onClick={() => selectJob(j)}
                                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                  selected
                                    ? 'bg-primary/10'
                                    : 'hover:bg-surface-2'
                                }`}
                              >
                                <div className="flex w-[92px] shrink-0 flex-col gap-1">
                                  {Array.from(new Set(j.channels)).map((ch) => (
                                    <span
                                      key={`${j.id}-${ch}`}
                                      className={`inline-flex w-fit items-center rounded-full border px-1.5 py-px text-[10px] font-medium ${CHANNEL_PILL[ch] ?? 'border-hairline bg-surface-2 text-ink-muted'}`}
                                    >
                                      {channelLabels[ch]}
                                    </span>
                                  ))}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-mono text-[13px] font-medium tracking-tight text-ink">
                                    #{j.id}
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
                                    {j.customer_name} · {j.sku_count} SKUs
                                    {j.fragile_count > 0
                                      ? ` (${j.fragile_count} Fragile)`
                                      : ''}
                                  </p>
                                </div>
                                {mergeable ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-hover">
                                    <GitMerge className="h-3 w-3" />
                                    {vi ? 'Có thể gộp' : 'Can Consolidate'}
                                  </span>
                                ) : (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                                    <Sparkles className="h-3 w-3 text-primary-hover" />
                                    AI Ready {Math.round(j.fill_ratio * 100)}%
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-hover shadow-[0_0_20px_rgba(94,106,210,0.25)]">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                {vi
                  ? `AI Decision Engine: hoàn tất ${job.ai_ms}s`
                  : `AI Decision Engine: Completed in ${job.ai_ms}s`}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline/60 pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas/70 px-2.5 py-1 text-[11px] text-ink">
                <Box className="h-3 w-3 text-primary-hover" />
                {job.box_code} ({job.dimensions})
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas/70 px-2.5 py-1 text-[11px] text-ink">
                <Wallet className="h-3 w-3 text-success" />
                {formatCurrency(job.shipping_saved)} ({vi ? 'tiết kiệm' : 'saved'}{' '}
                {job.shipping_saved_pct}%)
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas/70 px-2.5 py-1 text-[11px] text-ink">
                <Leaf className="h-3 w-3 text-success" />
                Fill {fillPct}%
              </span>
            </div>
          </header>

          <div className="relative z-10 grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,340px)_1fr] xl:grid-cols-[minmax(0,380px)_1fr]">
            <div className="flex min-w-0 flex-col gap-3">
              <section className={`${glass} p-4`}>
                <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
                  {vi ? 'Hộp & trọng lượng thể tích' : 'Box & volumetric weight'}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-lg font-semibold text-ink">
                      {job.box_code}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">
                      {job.dim.w} × {job.dim.l} × {job.dim.h} cm
                    </p>
                  </div>
                  <p className="text-right text-[11px] text-ink-subtle">
                    V = (D×R×C)/5000
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-hairline bg-canvas/60 px-3 py-2">
                    <p className="text-[10px] text-ink-subtle">
                      {vi ? 'Thực tế' : 'Real'}
                    </p>
                    <p className="font-mono text-sm text-ink">
                      {formatKg(job.real_weight_g)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline bg-canvas/60 px-3 py-2">
                    <p className="text-[10px] text-ink-subtle">Volumetric</p>
                    <p className="font-mono text-sm text-ink">
                      {formatKg(job.volumetric_weight_g)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between font-mono text-[11px] text-ink-muted">
                    <span>
                      {fillPct}% {vi ? 'đầy' : 'full'}
                    </span>
                    <span>
                      {job.unused_space}% {vi ? 'trống' : 'unused'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary-hover"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 border-t border-hairline/60 pt-3">
                  <p className="text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
                    {vi ? 'Kho carton' : 'Carton inventory'}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {CARTON_INVENTORY.map((carton) => {
                      const selected = job.box_code === carton.code
                      return (
                        <li key={carton.code}>
                          <button
                            type="button"
                            onClick={() => selectCarton(carton.code)}
                            className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors ${
                              selected
                                ? 'border-primary/40 bg-primary/10'
                                : 'border-hairline bg-canvas/50 hover:border-primary/25 hover:bg-canvas/80'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block font-mono text-[11px] font-medium text-ink">
                                {carton.code}
                              </span>
                              <span className="font-mono text-[10px] text-ink-subtle">
                                {formatCartonDimensions(carton)} ·{' '}
                                {carton.maxWeight}
                              </span>
                            </span>
                            <span className="shrink-0 pl-2 text-right">
                              {selected ? (
                                <Check className="h-3.5 w-3.5 text-primary-hover" />
                              ) : (
                                <span className="font-mono text-[10px] text-ink-muted">
                                  {formatCurrency(carton.unitCost)}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>

              <section className={`${glass} p-4`}>
                <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
                  {vi ? 'Thứ tự xếp đồ' : 'Packing sequence'}
                </p>
                <ol className="mt-3 space-y-1.5">
                  {job.sequence.map((step) => {
                    const on = activeStep === step.id
                    return (
                      <li key={step.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveStep(step.id)}
                          onMouseLeave={() => setActiveStep(null)}
                          onClick={() =>
                            setActiveStep((cur) =>
                              cur === step.id ? null : step.id,
                            )
                          }
                          className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            on
                              ? 'border-primary/40 bg-primary/15'
                              : 'border-hairline bg-canvas/50 hover:border-primary/25'
                          }`}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-[10px] text-ink-muted">
                            {step.step}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-ink">
                              {step.emoji}{' '}
                              {vi ? step.title_vi : step.title_en}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-ink-subtle">
                              {vi ? step.position_vi : step.position_en}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section className={`${glass} p-4`}>
                <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
                  {vi ? 'Chèn lót & vận chuyển' : 'Cushioning & courier'}
                </p>
                <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  {vi ? job.cushioning_vi : job.cushioning_en}
                </p>
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-primary-hover">
                    <Truck className="h-3.5 w-3.5" />
                    {recommended.name}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-ink-muted">
                    {recommended.eta} · {formatCurrency(recommended.price)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.couriers
                    .filter((c) => !c.recommended)
                    .map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full border border-hairline bg-canvas/60 px-2 py-0.5 font-mono text-[10px] text-ink-subtle"
                      >
                        {c.name.split('—')[0].trim()} {formatCurrency(c.price)}
                      </span>
                    ))}
                </div>
              </section>
            </div>

            <section className="relative min-w-0 overflow-hidden rounded-2xl border border-hairline bg-surface-1/80 shadow-[0_0_48px_rgba(94,106,210,0.12)] backdrop-blur-xl">
              <div className="h-[360px] w-full sm:h-[420px] lg:h-[min(560px,calc(100vh-16rem))]">
                <Hero3DCanvas
                  className="h-full w-full"
                  showLabel={false}
                  framed={false}
                  cameraView={cameraView}
                  highlightedItemIds={highlightedItemIds}
                  replayToken={replayToken}
                  paused={paused}
                  onPausedChange={setPaused}
                  cartonCode={job.box_code}
                />
              </div>

              <div className="absolute top-3 right-3 z-20 flex flex-wrap justify-end gap-1.5">
                {(
                  [
                    ['iso', vi ? 'Isometric' : 'Isometric'],
                    ['top', vi ? 'Top' : 'Top'],
                    ['front', vi ? 'Front' : 'Front'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCameraView(id)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-medium backdrop-blur-sm ${
                      cameraView === id
                        ? 'border-primary/40 bg-primary/20 text-primary-hover'
                        : 'border-hairline bg-surface-1/80 text-ink-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPaused(false)}
                  className="rounded-md border border-hairline bg-surface-1/80 p-1.5 text-ink-muted backdrop-blur-sm hover:text-ink"
                  title="Play"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPaused(true)}
                  className="rounded-md border border-hairline bg-surface-1/80 p-1.5 text-ink-muted backdrop-blur-sm hover:text-ink"
                  title="Pause"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaused(false)
                    setReplayToken((n) => n + 1)
                  }}
                  className="rounded-md border border-hairline bg-surface-1/80 p-1.5 text-ink-muted backdrop-blur-sm hover:text-ink"
                  title="Replay"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="pointer-events-none absolute bottom-4 left-4 z-20">
                <p className="rounded-full border border-hairline bg-surface-1/80 px-3 py-1.5 font-mono text-[11px] text-ink backdrop-blur-sm">
                  📦 Volumetric {fillPct}% · Fragile Protection Active
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-hairline bg-canvas/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {job.source_orders.map((src) => (
              <span
                key={src.external_id}
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${channelColors[src.channel]}`}
              >
                {channelLabels[src.channel]}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {canConsolidate ? (
              <Button variant="ghost" onClick={consolidate}>
                <GitMerge className="mr-1.5 h-4 w-4" />
                {vi ? 'Gộp đơn hàng' : 'Consolidate Order'}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setCartonOpen(true)}>
              {vi ? 'Đổi cỡ hộp thủ công' : 'Manual Override'}
            </Button>
            <Button
              variant="primary"
              className="shadow-[0_0_24px_rgba(94,106,210,0.45)]"
              onClick={confirmPrint}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              {vi ? 'Xác nhận & In nhãn dán' : 'Confirm & Print Label'}
            </Button>
          </div>
        </div>
      </footer>

      {cartonOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-1 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">
                {vi ? 'Chọn carton' : 'Select carton'}
              </h2>
              <button
                type="button"
                onClick={() => setCartonOpen(false)}
                className="rounded-md p-1 text-ink-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-3 max-h-72 space-y-1.5 overflow-auto">
              {CARTON_INVENTORY.map((carton) => (
                <li key={carton.code}>
                  <button
                    type="button"
                    onClick={() => selectCarton(carton.code)}
                    className="flex w-full items-center justify-between rounded-lg border border-hairline bg-canvas px-3 py-2 text-left hover:border-primary/35"
                  >
                    <span>
                      <span className="block font-mono text-sm text-ink">
                        {carton.code}
                      </span>
                      <span className="font-mono text-[11px] text-ink-subtle">
                        {formatCartonDimensions(carton)} · {carton.maxWeight}
                      </span>
                    </span>
                    {carton.code === job.box_code ? (
                      <Check className="h-4 w-4 text-primary-hover" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-4 bottom-24 z-50 rounded-lg border border-primary/30 bg-surface-1 px-3 py-2 text-xs text-ink shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
