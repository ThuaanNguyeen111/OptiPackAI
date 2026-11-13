import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Loader2, X } from 'lucide-react'

function cameraErrorText(err: unknown, vi: boolean): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return vi
      ? 'Trình duyệt chặn camera. Cho phép camera cho trang này rồi thử lại, hoặc dùng "Chọn ảnh".'
      : 'Camera access was blocked. Allow it for this site or use "Pick photo".'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return vi ? 'Không tìm thấy camera. Dùng "Chọn ảnh" thay thế.' : 'No camera found. Use "Pick photo" instead.'
  }
  if (name === 'NotReadableError') {
    return vi
      ? 'Camera đang bị ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại.'
      : 'The camera is used by another app. Close it and try again.'
  }
  return vi ? 'Không mở được camera.' : 'Could not open the camera.'
}

/**
 * Hộp chụp ảnh bằng webcam (`getUserMedia`). Mỗi lần bấm "Chụp" trả về 1 ảnh JPG (≤ 1600 px cạnh dài).
 * Đóng hộp là tắt camera.
 */
export function CameraCapture({
  vi,
  onCapture,
  onClose,
  hint,
}: {
  vi: boolean
  onCapture: (file: File) => void
  onClose: () => void
  /** Dòng nhắc dưới khung hình (VD "Đã chụp 1/3 ảnh"). */
  hint?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [taking, setTaking] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          void video.play().then(() => setReady(true))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(cameraErrorText(err, vi))
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [vi])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function take() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setTaking(true)
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        setTaking(false)
        if (!blob) return
        onCapture(new File([blob], `anh-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.82,
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={vi ? 'Chụp ảnh bằng camera' : 'Take a photo'}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl dark:bg-surface-1">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {vi ? 'Chụp ảnh bằng camera' : 'Take a photo'}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={vi ? 'Đóng' : 'Close'}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="aspect-video w-full object-contain" />
            {!ready ? (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : null}
          </div>
        )}
        {hint ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {vi ? 'Xong' : 'Done'}
          </button>
          <button
            type="button"
            disabled={!ready || taking || error !== null}
            onClick={take}
            className="owner-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            {vi ? 'Chụp' : 'Capture'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
