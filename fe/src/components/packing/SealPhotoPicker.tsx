import { useRef, useState, type ReactElement } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { uploadProofPhotos } from '../../api/proof-photos.api'
import { formatApiError } from '../../lib/api'
import { PhotoThumbs } from '../ui/PhotoThumbs'

const MAX_PHOTOS = 3

/**
 * 13/11/2026 — Ảnh bằng chứng lúc niêm phong kiện. Chỉ để người xem đối chiếu khi có
 * khiếu nại; hệ thống không chấm ảnh. `required` theo cài đặt "bắt buộc ảnh khi niêm phong".
 */
export function SealPhotoPicker({
  value,
  onChange,
  required,
  vi,
  disabled,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  required: boolean
  vi: boolean
  disabled?: boolean
}): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const room = MAX_PHOTOS - value.length

  async function pick(files: FileList | null) {
    if (!files || files.length === 0 || room <= 0) return
    setBusy(true)
    setError(null)
    try {
      const urls = await uploadProofPhotos(Array.from(files).slice(0, room))
      onChange([...value, ...urls])
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => void pick(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled || busy || room <= 0}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs font-semibold text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {vi ? `Chụp ảnh kiện (${String(value.length)}/${String(MAX_PHOTOS)})` : `Parcel photo (${String(value.length)}/${String(MAX_PHOTOS)})`}
        </button>
        <span className="text-[11px] text-ink-muted">
          {required ? (vi ? 'Bắt buộc ít nhất 1 ảnh. ' : 'At least 1 photo required. ') : ''}
          {vi ? 'Gợi ý: mở nắp nhìn từ trên, chụp nghiêng, đã dán tem.' : 'Tip: open top view, angled view, labelled.'}
        </span>
      </div>
      {value.length > 0 ? (
        <div className="flex items-start gap-1">
          <PhotoThumbs urls={value} alt={vi ? 'Ảnh kiện' : 'Parcel photo'} size="h-14 w-14" />
          <button
            type="button"
            aria-label={vi ? 'Bỏ ảnh vừa chụp' : 'Remove photos'}
            disabled={disabled || busy}
            onClick={() => onChange([])}
            className="rounded p-1 text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
