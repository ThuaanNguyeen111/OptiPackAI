import { useState } from 'react'
import { Check, ScanLine, X } from 'lucide-react'
import { Button } from '../ui/Button'

type WarehouseScannerModalProps = {
  open: boolean
  onClose: () => void
  locale?: 'vi' | 'en'
}

const SCAN_CATALOG: Record<
  string,
  { box: string; cushion: string; sku: string }
> = {
  'PKG-8801': {
    box: 'CARTON-A2',
    cushion: 'Bubble Wrap 2 layers',
    sku: 'SKU-A01',
  },
  'ORD-2042': {
    box: 'CARTON-A2',
    cushion: 'Bubble Wrap 2 layers',
    sku: 'SKU-C03',
  },
  'SKU-F06': {
    box: 'CARTON-A1',
    cushion: 'Bubble Wrap 1 layer · Fragile',
    sku: 'SKU-F06',
  },
}

export function WarehouseScannerModal({
  open,
  onClose,
  locale = 'vi',
}: WarehouseScannerModalProps) {
  const vi = locale === 'vi'
  const [scanValue, setScanValue] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [scanning, setScanning] = useState(true)

  function resetAndClose() {
    setScanValue('')
    setConfirmed(false)
    setScanning(true)
    onClose()
  }

  if (!open) return null

  const key = scanValue.trim().toUpperCase()
  const match =
    SCAN_CATALOG[key] ??
    (key.length >= 4
      ? {
          box: 'CARTON-A2',
          cushion: 'Bubble Wrap 2 layers',
          sku: key,
        }
      : null)

  function handleConfirm() {
    setConfirmed(true)
    window.setTimeout(() => {
      resetAndClose()
    }, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Đóng"
        onClick={resetAndClose}
      />
      <div className="relative z-10 flex max-h-[92svh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-hairline bg-[#0B0E14] sm:rounded-2xl">
        <div className="flex h-12 items-center justify-between border-b border-[#222734] px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[#F3F4F6]">
            <ScanLine className="h-4 w-4 text-[#6366F1]" />
            {vi ? 'Warehouse Quick Scanner' : 'Warehouse Quick Scanner'}
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-auto p-4">
          {/* Camera preview mock */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-2 border-[#6366F1]/50 bg-black">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
            <div className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-[#10B981] shadow-[0_0_12px_#10B981]" />
            <div className="absolute inset-8 rounded-lg border border-[#10B981]/40" />
            {scanning ? (
              <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-[#6366F1]" />
            ) : null}
            <p className="absolute bottom-3 left-0 right-0 text-center font-mono text-[11px] text-[#9CA3AF]">
              {vi
                ? 'Hướng barcode / QR vào khung'
                : 'Align barcode / QR in frame'}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-subtle">
              {vi ? 'Quét / nhập SKU · Package ID' : 'Scan / enter SKU · Package ID'}
            </label>
            <input
              autoFocus
              value={scanValue}
              onChange={(e) => {
                setScanValue(e.target.value)
                setConfirmed(false)
              }}
              onFocus={() => setScanning(true)}
              placeholder="PKG-8801 · ORD-2042 · SKU-…"
              className="w-full rounded-lg border border-[#222734] bg-[#151922] px-3 py-3 font-mono text-base text-[#F3F4F6] placeholder:text-[#6B7280] focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40"
            />
            <p className="mt-1 text-[11px] text-ink-tertiary">
              Try: <span className="font-mono">PKG-8801</span> or{' '}
              <span className="font-mono">SKU-F06</span>
            </p>
          </div>

          {match ? (
            <div className="rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/10 p-4 text-center">
              <p className="text-[11px] font-medium tracking-wide text-[#818CF8] uppercase">
                Live AI Packing Result
              </p>
              <p className="mt-2 font-mono text-lg font-semibold text-[#F3F4F6] sm:text-xl">
                Box: {match.box}
              </p>
              <p className="mt-1 font-mono text-sm text-[#10B981]">
                {match.cushion}
              </p>
              <p className="mt-2 font-mono text-[11px] text-ink-subtle">
                scan_ref={match.sku}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#222734] bg-[#151922] px-4 py-6 text-center text-sm text-ink-subtle">
              {vi
                ? 'Chờ quét mã để hiện gợi ý AI…'
                : 'Waiting for scan to show AI packing…'}
            </div>
          )}
        </div>

        <div className="border-t border-[#222734] p-4">
          <Button
            variant="primary"
            className="h-12 min-h-12 w-full text-base shadow-[0_0_24px_rgba(99,102,241,0.35)]"
            disabled={!match || confirmed}
            onClick={handleConfirm}
          >
            {confirmed ? (
              <>
                <Check className="mr-2 h-5 w-5" />
                {vi ? 'Đã xác nhận' : 'Confirmed'}
              </>
            ) : (
              vi ? 'Xác nhận đã đóng gói' : 'Confirm packed'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
