import { useRef, useState } from 'react'
import { Camera, Loader2, RefreshCw, X } from 'lucide-react'
import { scanReceipt, uploadReceiptPhotos } from '../../api/receipt-evidence.api'
import { formatApiError } from '../../lib/api'
import { EMPTY_RECEIPT_EVIDENCE, guessLine, MAX_PHOTOS, selectedLine, type ReceiptEvidenceState } from './receipt-evidence'

export function ReceiptEvidencePanel({
  vi,
  itemCodes,
  quantity,
  value,
  onChange,
  onQuantityFromSlip,
}: {
  vi: boolean
  /** Mã của hàng đang nhập (SKU sàn, SKU nội bộ, mã vật tư) — để tự chọn dòng phiếu. */
  itemCodes: string[]
  quantity: number
  value: ReceiptEvidenceState
  onChange: (next: ReceiptEvidenceState) => void
  /** Điền sẵn số lượng theo phiếu khi AI vừa đọc xong (nhân viên vẫn sửa được). */
  onQuantityFromSlip?: (quantity: number) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'scan' | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const line = selectedLine(value)
  const diff = line ? quantity - line.quantity : 0

  async function read(photoUrls: string[], base: ReceiptEvidenceState) {
    setBusy('scan')
    try {
      const scan = await scanReceipt(photoUrls)
      const index = guessLine(scan, itemCodes)
      onChange({ ...base, photoUrls, scan, ocrLineIndex: index, ocrError: null })
      const picked = scan.lines.find((l) => l.index === index)
      if (picked && onQuantityFromSlip) onQuantityFromSlip(picked.quantity)
    } catch (err: unknown) {
      onChange({ ...base, photoUrls, scan: null, ocrLineIndex: null, ocrError: formatApiError(err) })
    } finally {
      setBusy(null)
    }
  }

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return
    const chosen = Array.from(files).slice(0, MAX_PHOTOS)
    setUploadError(
      files.length > MAX_PHOTOS
        ? vi
          ? `Chỉ lấy ${MAX_PHOTOS} ảnh đầu.`
          : `Only the first ${MAX_PHOTOS} photos are used.`
        : null,
    )
    setBusy('upload')
    try {
      const photoUrls = await uploadReceiptPhotos(chosen)
      const base = { ...EMPTY_RECEIPT_EVIDENCE, photoUrls }
      onChange(base)
      await read(photoUrls, base)
    } catch (err: unknown) {
      setUploadError(formatApiError(err))
      setBusy(null)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink">
          {vi ? 'Ảnh phiếu nhà cung cấp (bắt buộc)' : 'Supplier slip photo (required)'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void pick(e.target.files)}
        />
        <button
          type="button"
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs font-semibold text-ink hover:bg-surface-sunken disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {value.photoUrls.length > 0 ? (vi ? 'Chụp / chọn lại' : 'Replace') : vi ? 'Chụp / chọn ảnh' : 'Take / pick photo'}
        </button>
      </div>

      {value.photoUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.photoUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={vi ? 'Ảnh phiếu' : 'Slip photo'} className="h-16 w-16 rounded border border-hairline object-cover" />
            </a>
          ))}
          <button
            type="button"
            aria-label={vi ? 'Bỏ ảnh phiếu' : 'Remove slip photos'}
            className="self-start rounded p-1 text-ink-muted hover:text-ink"
            onClick={() => onChange(EMPTY_RECEIPT_EVIDENCE)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {uploadError ? <p className="text-xs text-red-600">{uploadError}</p> : null}

      {busy === 'scan' ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {vi ? 'AI đang đọc phiếu…' : 'Reading the slip…'}
        </p>
      ) : null}

      {value.ocrError ? (
        <div className="space-y-1 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p>{value.ocrError}</p>
          <p>{vi ? 'Vẫn lưu được — phiếu sẽ ghi "Chưa đối chiếu".' : 'You can still save — marked "Not checked".'}</p>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold underline"
            onClick={() => void read(value.photoUrls, value)}
          >
            <RefreshCw className="h-3 w-3" />
            {vi ? 'Đọc lại' : 'Retry'}
          </button>
        </div>
      ) : null}

      {value.scan ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">{vi ? 'Dòng trên phiếu ứng với hàng này' : 'Slip line for this item'}</span>
            <select
              className="h-9 w-full rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink"
              value={value.ocrLineIndex ?? ''}
              onChange={(e) => {
                const next = e.target.value === '' ? null : Number(e.target.value)
                onChange({ ...value, ocrLineIndex: next })
                const picked = value.scan?.lines.find((l) => l.index === next)
                if (picked && onQuantityFromSlip) onQuantityFromSlip(picked.quantity)
              }}
            >
              <option value="">{vi ? '— Không đối chiếu —' : '— Do not check —'}</option>
              {value.scan.lines.map((l) => (
                <option key={l.index} value={l.index}>
                  {`${l.index + 1}. ${l.text}${l.code ? ` (${l.code})` : ''} — ${l.quantity}${l.unit ? ` ${l.unit}` : ''}`}
                </option>
              ))}
            </select>
          </label>
          {value.scan.lines.length === 0 ? (
            <p className="text-xs text-ink-muted">{vi ? 'AI không đọc được dòng hàng nào trên phiếu.' : 'No item lines were read.'}</p>
          ) : null}
          {line ? (
            <table className="w-full text-xs">
              <thead className="text-ink-muted">
                <tr>
                  <th className="text-left font-normal">{vi ? 'Theo phiếu' : 'On slip'}</th>
                  <th className="text-left font-normal">{vi ? 'Đã nhập' : 'Entered'}</th>
                  <th className="text-left font-normal">{vi ? 'Lệch' : 'Diff'}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="tabular-nums">
                  <td>{line.quantity}</td>
                  <td>{quantity}</td>
                  <td className={diff === 0 ? 'text-emerald-600' : 'font-semibold text-red-600'}>
                    {diff === 0 ? (vi ? 'Khớp' : 'Match') : diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}
          {line && diff !== 0 ? (
            <label className="block space-y-1">
              <span className="text-[11px] text-ink-muted">{vi ? 'Lý do lệch (bắt buộc)' : 'Reason (required)'}</span>
              <input
                className="h-9 w-full rounded-md border border-hairline bg-surface-1 px-3 text-sm text-ink"
                maxLength={300}
                value={value.mismatchReason}
                placeholder={vi ? 'VD: NCC giao thiếu 2, 1 cái lỗi trả lại' : 'e.g. supplier short by 2'}
                onChange={(e) => onChange({ ...value, mismatchReason: e.target.value })}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
