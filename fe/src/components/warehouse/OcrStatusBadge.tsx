import type { OcrStatus } from '../../api/receipt-evidence.api'
import { Badge } from '../ui/Badge'

/** 11/11/2026 — nhãn đối chiếu phiếu NCC: Khớp phiếu / Lệch phiếu / Chưa đối chiếu. */
export function OcrStatusBadge({ status, vi }: { status: OcrStatus | null; vi: boolean }) {
  if (!status) return null
  if (status === 'mismatch') return <Badge tone="danger">{vi ? 'Lệch phiếu' : 'Mismatch'}</Badge>
  if (status === 'matched') return <Badge tone="success">{vi ? 'Khớp phiếu' : 'Matched'}</Badge>
  return <Badge tone="default">{vi ? 'Chưa đối chiếu' : 'Not checked'}</Badge>
}

/** 17/11/2026 (AOFP-311) — ảnh phiếu rất giống ảnh đã dùng cho lần nhập trước: không chặn, chỉ cảnh báo để Store Owner / Admin kiểm tra. */
export function PhotoSuspectBadge({ suspect, vi }: { suspect: boolean; vi: boolean }) {
  if (!suspect) return null
  return (
    <span title={vi ? 'Ảnh phiếu rất giống ảnh đã dùng cho một lần nhập trước đó' : 'Slip photo looks very similar to one used for an earlier receipt'}>
      <Badge tone="warning">{vi ? 'Nghi dùng lại ảnh' : 'Photo may be reused'}</Badge>
    </span>
  )
}
