import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  ClipboardList,
  ScanLine,
  Timer,
} from 'lucide-react'
import { WarehouseScannerModal } from '../components/warehouse/WarehouseScannerModal'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { warehousePickerName, warehouseWave } from '../data/warehouse-mock'
import {
  type WarehouseFilter,
  useWarehouseFloor,
} from '../hooks/useWarehouseFloor'
import type { PickStatus, WarehousePickLine } from '../types/warehouse'

const FILTERS: Array<{ key: WarehouseFilter; vi: string; en: string }> = [
  { key: 'all', vi: 'Toàn bộ', en: 'All' },
  { key: 'queued', vi: 'Chờ lấy', en: 'Queued' },
  { key: 'picking', vi: 'Đang lấy', en: 'Picking' },
  { key: 'picked', vi: 'Đã lấy', en: 'Picked' },
  { key: 'short', vi: 'Thiếu hàng', en: 'Short' },
]

function statusLabel(status: PickStatus, vi: boolean): string {
  switch (status) {
    case 'queued':
      return vi ? 'Chờ lấy' : 'Queued'
    case 'picking':
      return vi ? 'Đang lấy' : 'Picking'
    case 'picked':
      return vi ? 'Đã lấy' : 'Picked'
    default:
      return vi ? 'Thiếu hàng' : 'Short pick'
  }
}

function statusClass(status: PickStatus): string {
  switch (status) {
    case 'picked':
      return 'border-success/20 bg-success-bg text-success'
    case 'picking':
      return 'border-primary/20 bg-primary/10 text-primary-hover'
    case 'short':
      return 'border-error/20 bg-error/10 text-error'
    default:
      return 'border-hairline bg-surface-2 text-ink-muted'
  }
}

function PickCard({
  line,
  vi,
  busy,
  onStart,
  onShort,
  onScan,
}: {
  line: WarehousePickLine
  vi: boolean
  busy: boolean
  onStart: () => void
  onShort: () => void
  onScan: () => void
}) {
  const done = line.status === 'picked'
  const short = line.status === 'short'

  return (
    <article className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-2xl font-semibold tracking-tight text-ink">
            {line.bin}
          </p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {vi ? 'Khu' : 'Zone'} {line.zone} · {line.packageId}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(line.status)}`}
        >
          {statusLabel(line.status, vi)}
        </span>
      </div>

      <p className="mt-3 text-sm font-medium text-ink">{line.productName}</p>
      <p className="mt-1 font-mono text-xs text-ink-subtle">
        {line.sku} · {line.barcode}
      </p>
      <p className="mt-1 text-xs text-ink-tertiary">
        {line.orderCodes.join(' · ')} ·{' '}
        {line.channels
          .map((c) => (c === 'shopee' ? 'Shopee' : 'TikTok'))
          .join(' + ')}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md border border-hairline bg-surface-2 px-2 py-1 font-mono text-ink">
          {line.qtyPicked}/{line.qty} {vi ? 'SP' : 'pcs'}
        </span>
        <span className="inline-flex items-center gap-1 text-ink-subtle">
          <Timer className="h-3.5 w-3.5" />
          SLA {line.slaMinutes} {vi ? 'phút' : 'min'}
        </span>
        {line.fragile ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {vi ? 'Dễ vỡ' : 'Fragile'}
          </span>
        ) : null}
      </div>

      {done || short ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          {line.status === 'queued' ? (
            <Button
              variant="primary"
              className="h-9 min-h-9"
              disabled={busy}
              onClick={onStart}
            >
              {vi ? 'Lấy hàng' : 'Pick'}
            </Button>
          ) : (
            <Button
              variant="primary"
              className="h-9 min-h-9"
              disabled={busy}
              onClick={onScan}
            >
              <ScanLine className="mr-1.5 h-3.5 w-3.5" />
              {vi ? 'Quét xác nhận' : 'Scan to confirm'}
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-9 min-h-9 text-error hover:text-error"
            disabled={busy}
            onClick={onShort}
          >
            {vi ? 'Thiếu hàng' : 'Short pick'}
          </Button>
        </div>
      )}
    </article>
  )
}

export function WarehousePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const floor = useWarehouseFloor()
  const [scanOpen, setScanOpen] = useState(false)
  const [scanMessage, setScanMessage] = useState<string>()

  const hints = floor.lines.flatMap((line) => [
    line.barcode,
    line.sku,
    line.packageId,
  ])

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app/warehouse' },
          { label: vi ? 'Lấy hàng' : 'Warehouse picking' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Sàn lấy hàng' : 'Picking floor'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {warehouseWave.label} · {warehouseWave.shift} ·{' '}
                {warehouseWave.zone}
                {' · '}
                {warehousePickerName}
              </p>
            </div>
            <Button
              variant="primary"
              className="h-10 min-h-10"
              onClick={() => {
                setScanMessage(undefined)
                setScanOpen(true)
              }}
            >
              <ScanLine className="mr-1.5 h-4 w-4" />
              {vi ? 'Quét' : 'Scan'}
            </Button>
          </div>

          {floor.notice ? (
            <div className="rounded-lg border border-success/20 bg-success-bg px-3 py-2 text-sm text-success">
              {floor.notice}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: vi ? 'Chờ lấy' : 'Queued',
                value: floor.stats.queued,
                icon: ClipboardList,
              },
              {
                label: vi ? 'Đang lấy' : 'In progress',
                value: floor.stats.picking,
                icon: ScanLine,
              },
              {
                label: vi ? 'Đã lấy' : 'Picked',
                value: floor.stats.picked,
                icon: Check,
              },
              {
                label: vi ? 'Thiếu hàng' : 'Short',
                value: floor.stats.short,
                icon: AlertTriangle,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-hairline bg-surface-1 p-4"
              >
                <card.icon
                  className="h-4 w-4 text-primary-hover"
                  strokeWidth={1.75}
                />
                <p className="mt-2 text-xs text-ink-subtle">{card.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-ink-tertiary">
            {vi
              ? `Còn ${floor.stats.unitsLeft} sản phẩm chưa lấy trong wave.`
              : `${floor.stats.unitsLeft} units left in this wave.`}
          </p>

          <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface-1 p-1">
            {FILTERS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => floor.setFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  floor.filter === tab.key
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-subtle hover:bg-canvas hover:text-ink'
                }`}
              >
                {vi ? tab.vi : tab.en}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {floor.lines.map((line) => (
              <PickCard
                key={line.id}
                line={line}
                vi={vi}
                busy={floor.busyId === line.id}
                onStart={() => floor.startPick(line.id)}
                onShort={() => floor.markShort(line.id)}
                onScan={() => {
                  setScanMessage(undefined)
                  setScanOpen(true)
                }}
              />
            ))}
          </div>
        </div>
      </main>

      <WarehouseScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        locale={locale}
        hints={hints}
        confirmLabel={vi ? 'Xác nhận đã lấy hàng' : 'Confirm picked'}
        onConfirm={(code) => {
          const result = floor.confirmScan(code)
          setScanMessage(result.message)
          return result.ok
        }}
        resultMessage={scanMessage}
      />
    </>
  )
}
