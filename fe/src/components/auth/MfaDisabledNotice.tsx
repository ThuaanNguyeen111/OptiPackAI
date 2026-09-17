import { useEffect, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  listNotifications,
  markNotificationRead,
} from '../../api/notifications.api'
import { usePortal } from '../../context/use-portal'
import type { AppNotification } from '../../types/notifications'

const POLL_MS = 10_000

export function MfaDisabledNotice() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [notice, setNotice] = useState<AppNotification | null>(null)
  const [ackLoading, setAckLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refresh = (): void => {
      void listNotifications({ is_read: false })
        .then((list) => {
          if (cancelled) return
          const mfaNotice = list.find((item) => item.type === 'mfa_disabled')
          setNotice(mfaNotice ?? null)
        })
        .catch(() => {
          // Chuông thông báo không được làm gián đoạn màn hình chính.
        })
    }

    const startId = window.setTimeout(refresh, 0)
    const intervalId = window.setInterval(refresh, POLL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(startId)
      window.clearInterval(intervalId)
    }
  }, [])

  async function handleAck() {
    if (!notice) return
    setAckLoading(true)
    try {
      await markNotificationRead(notice.id)
    } catch {
      // Vẫn đóng popup để không kẹt user nếu đánh dấu đã đọc thất bại.
    } finally {
      setNotice(null)
      setAckLoading(false)
    }
  }

  if (!notice) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mfa-disabled-title"
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-xl border border-hairline bg-surface-1 sm:rounded-xl"
      >
        <div className="flex h-14 items-center gap-2 border-b border-hairline px-4 text-sm font-medium text-ink">
          <ShieldOff className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
          <span id="mfa-disabled-title">{notice.title}</span>
        </div>
        <div className="p-4">
          <p className="text-sm leading-relaxed text-ink-muted">{notice.message}</p>
        </div>
        <div className="border-t border-hairline p-4">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => void handleAck()}
            disabled={ackLoading}
          >
            {vi ? 'Đã hiểu' : 'Got it'}
          </Button>
        </div>
      </div>
    </div>
  )
}
