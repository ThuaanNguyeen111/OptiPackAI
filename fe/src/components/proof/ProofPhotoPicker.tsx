import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { MAX_PROOF_PHOTO_BYTES, MAX_PROOF_PHOTOS } from '../../api/proof-photos.api'
import { CameraCapture } from './CameraCapture'
import { canUseCamera } from './camera'

/**
 * Chọn tối đa 3 ảnh bằng chứng: chụp bằng webcam, hoặc chọn file khi máy không có camera.
 * Ảnh chỉ giữ trên trình duyệt; màn hình gọi `uploadProofPhotos` lúc bấm xác nhận.
 */
export function ProofPhotoPicker({
  vi,
  files,
  onChange,
  label,
  required = false,
  disabled = false,
}: {
  vi: boolean
  files: File[]
  onChange: (files: File[]) => void
  label: string
  required?: boolean
  disabled?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = files.length >= MAX_PROOF_PHOTOS
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  function add(next: File[]) {
    const tooBig = next.filter((f) => f.size > MAX_PROOF_PHOTO_BYTES)
    const ok = next.filter((f) => f.size <= MAX_PROOF_PHOTO_BYTES && f.type.startsWith('image/'))
    const room = MAX_PROOF_PHOTOS - files.length
    setError(
      tooBig.length > 0
        ? vi
          ? 'Ảnh lớn hơn 10 MB bị bỏ qua.'
          : 'Photos over 10 MB were skipped.'
        : ok.length > room
          ? vi
            ? `Chỉ giữ ${MAX_PROOF_PHOTOS} ảnh.`
            : `Only ${MAX_PROOF_PHOTOS} photos are kept.`
          : null,
    )
    if (room > 0 && ok.length > 0) onChange([...files, ...ok.slice(0, room)])
  }

  return (
    <div className="space-y-2">
      <p className={`text-xs font-semibold ${required && files.length === 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
        {label} ({files.length}/{MAX_PROOF_PHOTOS}) — {required ? (vi ? 'bắt buộc' : 'required') : vi ? 'không bắt buộc' : 'optional'}
      </p>
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {previews.map((url, i) => (
            <div key={url} className="relative">
              <img src={url} alt={`${label} ${i + 1}`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
              <button
                type="button"
                disabled={disabled}
                aria-label={vi ? `Bỏ ảnh ${i + 1}` : `Remove photo ${i + 1}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900/80 p-0.5 text-white hover:bg-slate-900"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canUseCamera() ? (
          <button
            type="button"
            disabled={disabled || full}
            onClick={() => setCameraOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Camera className="h-3.5 w-3.5" />
            {vi ? 'Chụp bằng camera' : 'Use camera'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {vi ? 'Chọn ảnh' : 'Pick photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {cameraOpen ? (
        <CameraCapture
          vi={vi}
          onCapture={(file) => add([file])}
          onClose={() => setCameraOpen(false)}
          hint={
            vi
              ? `Đã có ${String(files.length)}/${String(MAX_PROOF_PHOTOS)} ảnh. Chụp xong bấm "Xong".`
              : `${String(files.length)}/${String(MAX_PROOF_PHOTOS)} photos. Press "Done" when finished.`
          }
        />
      ) : null}
    </div>
  )
}
