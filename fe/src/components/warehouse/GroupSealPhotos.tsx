import { useEffect, useState, type ReactElement } from 'react'
import { getOrderGroupTimeline, type HistoryItem } from '../../api/history.api'
import { PhotoThumbs } from '../ui/PhotoThumbs'

/**
 * 13/11/2026 — Ảnh chụp lúc niêm phong các kiện của nhóm đơn, để người kiểm hàng hoàn so
 * với hàng nhận về. Lấy từ dòng thời gian nhóm đơn; không có ảnh / không xem được thì ẩn.
 */
export function GroupSealPhotos({ groupId, vi }: { groupId: string; vi: boolean }): ReactElement | null {
  const [seals, setSeals] = useState<HistoryItem[]>([])

  useEffect(() => {
    let cancelled = false
    getOrderGroupTimeline(groupId)
      .then((res) => {
        if (!cancelled) setSeals(res.items.filter((i) => i.action === 'packing.parcel_sealed' && (i.photoUrls?.length ?? 0) > 0))
      })
      .catch(() => {
        if (!cancelled) setSeals([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  if (seals.length === 0) return null
  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface p-3">
      <p className="text-xs font-semibold text-ink">{vi ? 'Ảnh lúc niêm phong (trước khi giao)' : 'Photos at sealing (before shipping)'}</p>
      {seals.map((s) => (
        <div key={s.id} className="space-y-1">
          <p className="text-[11px] text-ink-muted">{s.summary}</p>
          <PhotoThumbs urls={s.photoUrls ?? []} alt={vi ? 'Ảnh niêm phong' : 'Seal photo'} size="h-14 w-14" />
        </div>
      ))}
    </div>
  )
}
