import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AlertTriangle, Camera, Check, CheckCircle2, Images, Info, Loader2, RefreshCw, ScanText, X } from 'lucide-react'
import { CameraCapture } from '../proof/CameraCapture'
import { canUseCamera } from '../proof/camera'
import { listReceiptPhotos, scanReceipt, uploadReceiptPhotos, type StoredReceiptPhoto } from '../../api/receipt-evidence.api'
import { formatApiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import {
  EMPTY_RECEIPT_EVIDENCE,
  guessLine,
  MAX_PHOTOS,
  receiptEvidenceProblem,
  selectedLine,
  type ReceiptEvidenceState,
} from './receipt-evidence'

const inputClass =
  'h-9 w-full rounded-md border border-hairline bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

/**
 * 16/11/2026 — một khối theo đúng thứ tự làm việc: ảnh phiếu → AI đọc → chọn dòng →
 * nhập số đếm thật → so với phiếu → lý do nếu lệch. Ô số lượng nằm trong panel để
 * số đếm luôn đứng cạnh số trên phiếu.
 */
export function ReceiptEvidencePanel({
  vi,
  itemCodes,
  quantity,
  onQuantityChange,
  value,
  onChange,
}: {
  vi: boolean
  /** Mã của hàng đang nhập (SKU sàn, SKU nội bộ, mã vật tư) — để tự chọn dòng phiếu. */
  itemCodes: string[]
  /** Số đếm thực tế; 0 = chưa nhập. */
  quantity: number
  /** Nhân viên gõ số, hoặc AI vừa đọc xong / đổi dòng phiếu thì điền sẵn số trên phiếu. */
  onQuantityChange: (quantity: number) => void
  value: ReceiptEvidenceState
  onChange: (next: ReceiptEvidenceState) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'scan' | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  /** (13/11/2026) Ảnh chụp bằng webcam, gom tới khi bấm "Dùng ảnh" rồi mới tải + đọc phiếu. */
  const [cameraOpen, setCameraOpen] = useState(false)
  const [shots, setShots] = useState<File[]>([])
  const line = selectedLine(value)
  const diff = line && quantity > 0 ? quantity - line.quantity : 0
  const problem = busy ? null : receiptEvidenceProblem(value, quantity, vi)
  const t = (a: string, b: string) => (vi ? a : b)

  async function read(photoUrls: string[], base: ReceiptEvidenceState) {
    setBusy('scan')
    try {
      const scan = await scanReceipt(photoUrls)
      const index = guessLine(scan, itemCodes)
      onChange({ ...base, photoUrls, scan, ocrLineIndex: index, ocrError: null })
      const picked = scan.lines.find((l) => l.index === index)
      if (picked) onQuantityChange(picked.quantity)
    } catch (err: unknown) {
      onChange({ ...base, photoUrls, scan: null, ocrLineIndex: null, ocrError: formatApiError(err) })
    } finally {
      setBusy(null)
    }
  }

  async function pick(files: FileList | File[] | null) {
    if (!files || files.length === 0) return
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) {
      setUploadError(t('Chỉ nhận ảnh (JPG, PNG, WebP, HEIC). PDF hãy in ra rồi chụp lại.', 'Images only (JPG, PNG, WebP, HEIC).'))
      return
    }
    const chosen = images.slice(0, MAX_PHOTOS)
    setUploadError(images.length > MAX_PHOTOS ? t(`Chỉ lấy ${MAX_PHOTOS} ảnh đầu.`, `Only the first ${MAX_PHOTOS} photos are used.`) : null)
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

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDragging(false)
    if (busy === null) void pick(e.dataTransfer.files)
  }

  const hasPhotos = value.photoUrls.length > 0

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-3" aria-label={t('Phiếu nhà cung cấp', 'Supplier slip')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">{t('Phiếu nhà cung cấp', 'Supplier slip')}</h3>
        <span className="shrink-0 text-[11px] text-ink-muted">{t('Bắt buộc · tối đa 3 ảnh', 'Required · up to 3 photos')}</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />

      {hasPhotos ? (
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {value.photoUrls.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md border border-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title={t('Mở ảnh cỡ lớn', 'Open full size')}
              >
                <img
                  src={url}
                  alt={t(`Ảnh phiếu ${i + 1}`, `Slip photo ${i + 1}`)}
                  className="h-28 w-20 bg-surface-1 object-cover object-top"
                />
              </a>
            ))}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              disabled={busy !== null}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs font-semibold whitespace-nowrap text-ink hover:bg-surface-sunken disabled:opacity-50"
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {busy === 'upload' ? t('Đang tải…', 'Uploading…') : t('Đổi ảnh', 'Replace')}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
              onClick={() => onChange(EMPTY_RECEIPT_EVIDENCE)}
            >
              <X className="h-3.5 w-3.5" />
              {t('Bỏ ảnh', 'Remove')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-3 py-5 text-center transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
            dragging ? 'border-primary bg-primary/5' : 'border-hairline-strong bg-surface-1 hover:border-primary hover:bg-primary/5',
          )}
        >
          {busy === 'upload' ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Camera className="h-5 w-5 text-primary" />}
          <span className="text-sm font-semibold text-ink">
            {busy === 'upload' ? t('Đang tải ảnh…', 'Uploading…') : t('Tải ảnh từ máy hoặc chụp phiếu', 'Upload or take slip photos')}
          </span>
          <span className="text-[11px] text-ink-muted">
            {t('Kéo thả ảnh vào đây · AI sẽ đọc số lượng trên phiếu', 'Drop photos here · AI reads the quantities')}
          </span>
        </button>
      )}

      {libraryOpen ? (
        <StoredPhotoPicker
          vi={vi}
          onCancel={() => setLibraryOpen(false)}
          onPick={(photoUrls) => {
            setLibraryOpen(false)
            setUploadError(null)
            const base = { ...EMPTY_RECEIPT_EVIDENCE, photoUrls }
            onChange(base)
            void read(photoUrls, base)
          }}
        />
      ) : (
        <div className="flex gap-1.5">
          {canUseCamera() ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setLibraryOpen(false)
                setShots([])
                setCameraOpen(true)
              }}
              className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-hairline bg-surface-1 px-2.5 text-xs font-semibold text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              {t('Chụp bằng camera', 'Use camera')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setLibraryOpen(true)}
            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-hairline bg-surface-1 px-2.5 text-xs font-semibold text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <Images className="h-3.5 w-3.5" />
            {t('Ảnh đã tải lên', 'Uploaded photos')}
          </button>
        </div>
      )}

      {cameraOpen ? (
        <CameraCapture
          vi={vi}
          onCapture={(file) => {
            const next = [...shots, file].slice(0, MAX_PHOTOS)
            setShots(next)
            // Đủ số ảnh tối đa thì dùng luôn.
            if (next.length >= MAX_PHOTOS) {
              setCameraOpen(false)
              void pick(next)
            }
          }}
          onClose={() => {
            setCameraOpen(false)
            if (shots.length > 0) void pick(shots)
          }}
          hint={
            vi
              ? `Đã chụp ${String(shots.length)}/${String(MAX_PHOTOS)} ảnh. Bấm "Xong" để tải lên và đọc phiếu.`
              : `${String(shots.length)}/${String(MAX_PHOTOS)} taken. Press "Done" to upload.`
          }
        />
      ) : null}

      {uploadError ? (
        <p role="alert" className="text-xs text-red-600">
          {uploadError}
        </p>
      ) : null}

      {busy === 'scan' ? (
        <p role="status" className="flex items-center gap-1.5 rounded-md bg-surface-1 px-2.5 py-2 text-xs text-ink-muted">
          <ScanText className="h-3.5 w-3.5 animate-pulse text-primary" />
          {t('AI đang đọc phiếu…', 'Reading the slip…')}
        </p>
      ) : null}

      {value.ocrError && busy === null ? (
        <div role="alert" className="space-y-1 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">{value.ocrError}</p>
          <p>{t('Vẫn lưu được bằng số đếm tay.', 'You can still save with a manual count.')}</p>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            onClick={() => void read(value.photoUrls, value)}
          >
            <RefreshCw className="h-3 w-3" />
            {t('Đọc lại', 'Retry')}
          </button>
        </div>
      ) : null}

      {value.scan && busy === null ? (
        <label className="block space-y-1">
          <span className="text-[11px] text-ink-muted">{t('Dòng trên phiếu ứng với hàng này', 'Slip line for this item')}</span>
          <select
            className={inputClass}
            value={value.ocrLineIndex ?? ''}
            onChange={(e) => {
              const next = e.target.value === '' ? null : Number(e.target.value)
              onChange({ ...value, ocrLineIndex: next })
              const picked = value.scan?.lines.find((l) => l.index === next)
              if (picked) onQuantityChange(picked.quantity)
            }}
          >
            <option value="">{t('— Không đối chiếu —', '— Do not check —')}</option>
            {value.scan.lines.map((l) => (
              <option key={l.index} value={l.index}>
                {`${l.index + 1}. ${l.text}${l.code ? ` (${l.code})` : ''} — ${l.quantity}${l.unit ? ` ${l.unit}` : ''}`}
              </option>
            ))}
          </select>
          {value.scan.lines.length === 0 ? (
            <span className="block text-[11px] text-ink-muted">{t('AI không đọc được dòng hàng nào — nhập số đếm tay.', 'No item lines were read — enter your count.')}</span>
          ) : value.ocrLineIndex === null ? (
            <span className="block text-[11px] text-ink-muted">{t('Chưa khớp được mã hàng — chọn dòng để đối chiếu.', 'No code match — pick a line to check.')}</span>
          ) : null}
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">{t('Số lượng đếm thực tế', 'Counted quantity')}</span>
        <input
          className={cn(inputClass, 'tabular-nums')}
          type="number"
          inputMode="numeric"
          min={1}
          value={quantity > 0 ? quantity : ''}
          placeholder={line ? String(line.quantity) : t('Đếm hàng thật rồi nhập', 'Count the goods')}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value))
            onQuantityChange(Number.isFinite(n) && n > 0 ? n : 0)
          }}
        />
      </label>

      {line && quantity > 0 && busy === null ? (
        <div
          className={cn(
            'grid grid-cols-3 gap-2 rounded-md px-3 py-2',
            diff === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30',
          )}
        >
          <div>
            <p className="text-[11px] text-ink-muted">{t('Phiếu ghi', 'On slip')}</p>
            <p className="text-base font-semibold text-ink tabular-nums">{line.quantity}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-muted">{t('Đếm được', 'Counted')}</p>
            <p className="text-base font-semibold text-ink tabular-nums">{quantity}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-muted">{t('Chênh lệch', 'Difference')}</p>
            <p
              className={cn(
                'flex items-center gap-1 text-base font-semibold tabular-nums',
                diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
              )}
            >
              {diff === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {diff === 0 ? t('Khớp', 'Match') : diff > 0 ? `+${diff}` : diff}
            </p>
          </div>
        </div>
      ) : null}

      {line && diff !== 0 && busy === null ? (
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">{t('Lý do lệch (bắt buộc)', 'Reason (required)')}</span>
          <input
            className={inputClass}
            maxLength={300}
            value={value.mismatchReason}
            placeholder={t('VD: NCC giao thiếu 2, 1 cái lỗi trả lại', 'e.g. supplier short by 2')}
            onChange={(e) => onChange({ ...value, mismatchReason: e.target.value })}
          />
          <span className="block text-[11px] text-ink-muted">
            {t('Phiếu sẽ gắn nhãn "Lệch phiếu" và báo chủ shop.', 'The receipt is flagged and the owner notified.')}
          </span>
        </label>
      ) : null}

      {problem && !(line && diff !== 0) ? (
        <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          {problem}
        </p>
      ) : null}
    </section>
  )
}

/** Ảnh nhỏ cắt sẵn trên Cloudinary (giữ phần đầu phiếu) để lưới tải nhanh. */
function thumbUrl(url: string): string {
  return url.replace('/image/upload/', '/image/upload/c_fill,w_200,h_260,g_north/')
}

function shortTime(iso: string | null, vi: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(vi ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 16/11/2026 — chọn lại ảnh phiếu đã tải lên trước đó (VD chụp bằng điện thoại, chọn trên máy tính). */
function StoredPhotoPicker({ vi, onCancel, onPick }: { vi: boolean; onCancel: () => void; onPick: (urls: string[]) => void }) {
  const t = (a: string, b: string) => (vi ? a : b)
  const [photos, setPhotos] = useState<StoredReceiptPhoto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  async function load(next?: string) {
    setLoading(true)
    setError(null)
    try {
      const page = await listReceiptPhotos(next)
      setPhotos((prev) => (next ? [...prev, ...page.photos] : page.photos))
      setCursor(page.nextCursor)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    listReceiptPhotos()
      .then((page) => {
        if (!alive) return
        setPhotos(page.photos)
        setCursor(page.nextCursor)
      })
      .catch((err: unknown) => {
        if (alive) setError(formatApiError(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  function toggle(url: string) {
    setSelected((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : cur.length >= MAX_PHOTOS ? cur : [...cur, url]))
  }

  return (
    <div className="space-y-2 rounded-md border border-hairline bg-surface-1 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink">{t('Ảnh phiếu đã tải lên', 'Uploaded slip photos')}</p>
        <span className="text-[11px] text-ink-muted tabular-nums">
          {t(`Đã chọn ${selected.length}/${MAX_PHOTOS}`, `${selected.length}/${MAX_PHOTOS} selected`)}
        </span>
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-2 text-xs text-red-600">
          <span>{error}</span>
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void load()}>
            {t('Thử lại', 'Retry')}
          </button>
        </div>
      ) : null}

      {!loading && !error && photos.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">{t('Chưa có ảnh phiếu nào trên hệ thống.', 'No slip photos uploaded yet.')}</p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-0.5">
          {photos.map((p, i) => {
            const order = selected.indexOf(p.url)
            const on = order >= 0
            return (
              <li key={p.url}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.url)}
                  className={cn(
                    'relative block w-full overflow-hidden rounded-md border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    on ? 'border-primary ring-2 ring-primary' : 'border-hairline hover:border-primary',
                  )}
                >
                  <img
                    src={thumbUrl(p.url)}
                    alt={t(`Ảnh phiếu tải lúc ${shortTime(p.createdAt, vi) || i + 1}`, `Slip photo ${shortTime(p.createdAt, vi) || i + 1}`)}
                    loading="lazy"
                    className="aspect-[200/260] w-full bg-surface object-cover"
                  />
                  {on ? (
                    <span className="absolute top-1 right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white tabular-nums">
                      {order + 1}
                    </span>
                  ) : null}
                  <span className="block truncate bg-surface px-1 py-0.5 text-[11px] text-ink-muted tabular-nums">
                    {shortTime(p.createdAt, vi)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {loading ? (
        <p role="status" className="flex items-center justify-center gap-1.5 py-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('Đang tải danh sách ảnh…', 'Loading photos…')}
        </p>
      ) : cursor ? (
        <button type="button" className="w-full text-xs font-semibold text-primary underline-offset-2 hover:underline" onClick={() => void load(cursor)}>
          {t('Xem thêm ảnh cũ hơn', 'Load older photos')}
        </button>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="h-8 rounded-md px-3 text-xs text-ink-muted hover:text-ink" onClick={onCancel}>
          {t('Huỷ', 'Cancel')}
        </button>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onPick(selected)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {selected.length > 0 ? t(`Dùng ${selected.length} ảnh`, `Use ${selected.length} photo(s)`) : t('Chọn ảnh', 'Select photos')}
        </button>
      </div>
    </div>
  )
}
