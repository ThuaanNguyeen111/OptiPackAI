import type { OcrStatus } from '../../api/receipt-evidence.api'
import { Badge } from '../ui/Badge'

/** 11/11/2026 — nhãn đối chiếu phiếu NCC: Khớp phiếu / Lệch phiếu / Chưa đối chiếu. */
export function OcrStatusBadge({ status, vi }: { status: OcrStatus | null; vi: boolean }) {
  if (!status) return null
  if (status === 'mismatch') return <Badge tone="danger">{vi ? 'Lệch phiếu' : 'Mismatch'}</Badge>
  if (status === 'matched') return <Badge tone="success">{vi ? 'Khớp phiếu' : 'Matched'}</Badge>
  return <Badge tone="default">{vi ? 'Chưa đối chiếu' : 'Not checked'}</Badge>
}
