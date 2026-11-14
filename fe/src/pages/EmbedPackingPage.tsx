import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { EmbedPlanFrame } from '../components/embed/EmbedPlanFrame'
import { Packing3DBoxViewer } from '../components/packing/Packing3DBoxViewer'

/**
 * Trang CHỈ có khung 3D đóng gói, để app mobile nhúng trong WebView (`/embed/packing/:groupId?parcel=N`).
 * Phần hướng dẫn (vật tư, các bước, so sánh thùng) ở trang riêng `/embed/packing/:groupId/guide`.
 * Phiên đăng nhập do app truyền qua fragment (xem `lib/embed-session.ts`).
 */
export function EmbedPackingPage() {
  const { groupId = '' } = useParams()
  const [search] = useSearchParams()
  const [parcelNo, setParcelNo] = useState<number | null>(Number(search.get('parcel')) || null)

  return (
    <EmbedPlanFrame groupId={groupId}>
      {(plan) => (
        <div className="fixed inset-0 bg-[#f8faff]">
          <Packing3DBoxViewer
            plan={plan}
            parcelNo={parcelNo}
            onParcelChange={setParcelNo}
            className="relative h-full w-full select-none overflow-hidden bg-[#f8faff]"
          />
        </div>
      )}
    </EmbedPlanFrame>
  )
}
