import { useState } from 'react'
import { Flag, MapPin, Minus, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { cn } from '../../lib/cn'

/** BE cắt ghi chú ở 500 ký tự (order-group-picking.service.ts → reportMissing). */
const NOTE_MAX = 500

const QUICK_NOTES = [
  { vi: 'Kệ trống', en: 'Shelf is empty' },
  { vi: 'Trên kệ không đủ số lượng', en: 'Not enough on the shelf' },
  { vi: 'Hàng lỗi hoặc bẩn', en: 'Damaged or dirty item' },
  { vi: 'Không tìm thấy hàng ở ô này', en: 'Item not found in this bin' },
]

/** Một dòng SKU còn phải lấy — chỉ những dòng này mới báo thiếu được. */
export type MissingCandidate = {
  key: string
  groupId: string
  /** Mã nhóm rút gọn — chỉ truyền khi đang lấy chung nhiều nhóm. */
  groupLabel?: string
  sku: string
  binCode: string | null
  ordered: number
  picked: number
}

type Props = {
  vi: boolean
  candidates: MissingCandidate[]
  initialKey: string
  busy: boolean
  canSubmit: boolean
  error: string | null
  onClose: () => void
  onSubmit: (candidate: MissingCandidate, quantity: number, note: string) => void
}

function stillNeeded(row: MissingCandidate): number {
  return Math.max(0, row.ordered - row.picked)
}

/** Chỉ mount khi mở: state được đặt lại mỗi lần mở, giữ nguyên khi gửi lỗi. */
export function ReportMissingDialog({
  vi,
  candidates,
  initialKey,
  busy,
  canSubmit,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [selectedKey, setSelectedKey] = useState(initialKey)
  const selected = candidates.find((row) => row.key === selectedKey) ?? candidates[0] ?? null
  const max = selected ? stillNeeded(selected) : 0
  // null = mặc định thiếu toàn bộ phần còn cần.
  const [typed, setTyped] = useState<number | null>(null)
  const quantity = Math.min(max, Math.max(1, typed ?? max))
  const [note, setNote] = useState('')

  function choose(key: string) {
    setSelectedKey(key)
    setTyped(null)
  }

  const stepClass =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-4 overflow-hidden rounded-2xl text-slate-900 dark:text-slate-100 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-amber-500">
        <DialogHeader className="flex-row items-start gap-3 pr-8 text-left">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <Flag className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-lg">{vi ? 'Báo thiếu hàng' : 'Report missing item'}</DialogTitle>
            <DialogDescription>
              {vi
                ? 'Dùng khi không lấy được đủ số lượng đơn yêu cầu.'
                : 'Use this when you cannot pick the ordered quantity.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {selected ? (
          <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-0.5">
            {candidates.length > 1 ? (
              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 text-sm font-semibold">
                  {vi ? 'Sản phẩm bị thiếu' : 'Missing product'}
                </legend>
                <div className="max-h-44 space-y-1.5 overflow-y-auto">
                  {candidates.map((row) => (
                    <label
                      key={row.key}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2',
                        row.key === selected.key
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900',
                      )}
                    >
                      <input
                        type="radio"
                        name="missing-line"
                        checked={row.key === selected.key}
                        onChange={() => choose(row.key)}
                        className="accent-amber-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-semibold">{row.sku}</span>
                        {row.groupLabel ? (
                          <span className="block text-xs text-slate-500">
                            {vi ? 'Nhóm' : 'Group'} {row.groupLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {vi ? 'còn cần' : 'needed'} {stillNeeded(row)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="break-all font-mono text-base font-bold">{selected.sku}</p>
              {selected.binCode ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="font-mono">{selected.binCode}</span>
                  {selected.groupLabel ? <span>· {vi ? 'Nhóm' : 'Group'} {selected.groupLabel}</span> : null}
                </p>
              ) : null}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: vi ? 'Đơn đặt' : 'Ordered', value: selected.ordered, strong: false },
                  { label: vi ? 'Đã lấy' : 'Picked', value: selected.picked, strong: false },
                  { label: vi ? 'Còn cần' : 'Still needed', value: max, strong: true },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-white px-2 py-1.5 dark:bg-slate-950">
                    <dt className="text-xs text-slate-500">{stat.label}</dt>
                    <dd className={cn('font-mono text-lg font-bold', stat.strong && 'text-amber-700 dark:text-amber-300')}>
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <label htmlFor="missing-qty" className="block text-sm font-semibold">
                {vi ? 'Số lượng không lấy được' : 'Quantity you cannot pick'}
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={stepClass}
                  onClick={() => setTyped(quantity - 1)}
                  disabled={busy || quantity <= 1}
                  aria-label={vi ? 'Giảm số lượng' : 'Decrease'}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  id="missing-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  value={quantity}
                  onChange={(e) => setTyped(Math.trunc(Number(e.target.value)) || 1)}
                  className="h-11 w-24 rounded-xl border border-slate-200 bg-white text-center font-mono text-xl font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 [appearance:textfield] dark:border-slate-700 dark:bg-slate-950 [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  className={stepClass}
                  onClick={() => setTyped(quantity + 1)}
                  disabled={busy || quantity >= max}
                  aria-label={vi ? 'Tăng số lượng' : 'Increase'}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="text-sm text-slate-500">
                  / {max} {vi ? 'còn cần' : 'needed'}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="missing-note" className="block text-sm font-semibold">
                {vi ? 'Ghi chú' : 'Note'}{' '}
                <span className="font-normal text-slate-500">{vi ? '(không bắt buộc)' : '(optional)'}</span>
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {QUICK_NOTES.map((item) => {
                  const text = vi ? item.vi : item.en
                  return (
                    <button
                      key={item.en}
                      type="button"
                      onClick={() => setNote(note === text ? '' : text)}
                      aria-pressed={note === text}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium cursor-pointer',
                        note === text
                          ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900',
                      )}
                    >
                      {text}
                    </button>
                  )
                })}
              </div>
              <textarea
                id="missing-note"
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={vi ? 'Mô tả thêm nếu cần' : 'Add details if needed'}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-slate-700 dark:bg-slate-950"
              />
              <p className="mt-0.5 text-right text-xs text-slate-400">
                {note.length}/{NOTE_MAX}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">{vi ? 'Sau khi gửi' : 'After sending'}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>
                  {vi
                    ? 'Cả nhóm tạm dừng lấy hàng, chuyển sang «Thiếu hàng — cần duyệt».'
                    : 'The whole group pauses and moves to partial review.'}
                </li>
                <li>
                  {vi
                    ? 'Chủ shop và nhân viên đóng gói nhận thông báo.'
                    : 'Store Owner and Packaging Staff are notified.'}
                </li>
                <li>
                  {vi
                    ? 'Nhân viên đóng gói hoặc Admin chọn giao phần có sẵn hoặc cho lấy lại. Bạn không tự quyết định.'
                    : 'Packaging Staff or Admin decides to ship short or pick again.'}
                </li>
                {candidates.length > 1 ? (
                  <li>
                    {vi
                      ? 'Mỗi lần chỉ báo được 1 sản phẩm. Nếu còn sản phẩm khác bị thiếu, hãy ghi vào ghi chú.'
                      : 'Only one product per report. List other missing items in the note.'}
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {vi ? 'Đã lấy đủ mọi sản phẩm, không còn gì để báo thiếu.' : 'Everything is picked.'}
          </p>
        )}

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <DialogFooter className="shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold cursor-pointer disabled:opacity-50 dark:border-slate-700"
          >
            {vi ? 'Hủy' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => (selected ? onSubmit(selected, quantity, note) : undefined)}
            disabled={busy || !canSubmit || !selected || max <= 0}
            className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white cursor-pointer hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? vi ? 'Đang gửi…' : 'Sending…'
              : vi
                ? `Gửi báo thiếu ${max > 0 ? quantity : 0} sản phẩm`
                : `Report ${max > 0 ? quantity : 0} missing`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
