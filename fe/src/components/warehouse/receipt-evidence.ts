import type { ReceiptEvidencePayload, ReceiptScan } from '../../api/receipt-evidence.api'

/**
 * 11/11/2026 — Ảnh phiếu nhà cung cấp (bắt buộc) + AI đọc phiếu để đối chiếu số lượng.
 * Luồng: chọn/chụp ảnh → tải lên → AI đọc → tự chọn dòng phiếu khớp mã → so số đã đếm.
 * Lệch không chặn nhưng phải ghi lý do. AI lỗi → vẫn lưu được, phiếu "chưa đối chiếu".
 */
export type ReceiptEvidenceState = {
  photoUrls: string[]
  scan: ReceiptScan | null
  ocrLineIndex: number | null
  mismatchReason: string
  ocrError: string | null
}

export const EMPTY_RECEIPT_EVIDENCE: ReceiptEvidenceState = {
  photoUrls: [],
  scan: null,
  ocrLineIndex: null,
  mismatchReason: '',
  ocrError: null,
}

export const MAX_PHOTOS = 3

function normalizeCode(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Dòng phiếu ứng với mã đang nhập: trùng mã in trên phiếu, hoặc phiếu chỉ có 1 dòng. */
export function guessLine(scan: ReceiptScan, itemCodes: string[]): number | null {
  const codes = itemCodes.map(normalizeCode).filter(Boolean)
  const hit = scan.lines.find((l) => {
    const code = normalizeCode(l.code)
    return code !== '' && codes.includes(code)
  })
  if (hit) return hit.index
  return scan.lines.length === 1 ? (scan.lines[0]?.index ?? null) : null
}

export function selectedLine(ev: ReceiptEvidenceState) {
  if (!ev.scan || ev.ocrLineIndex === null) return null
  return ev.scan.lines.find((l) => l.index === ev.ocrLineIndex) ?? null
}

/** Lý do chưa lưu được (null = lưu được). */
export function receiptEvidenceProblem(ev: ReceiptEvidenceState, quantity: number, vi: boolean): string | null {
  if (ev.photoUrls.length === 0) {
    return vi ? 'Tải ảnh phiếu của nhà cung cấp trước khi lưu.' : 'Upload the supplier slip photo first.'
  }
  const line = selectedLine(ev)
  if (line && line.quantity !== quantity && ev.mismatchReason.trim() === '') {
    return vi ? 'Số nhập khác số trên phiếu — ghi lý do lệch.' : 'Quantity differs from the slip — enter a reason.'
  }
  return null
}

export function receiptEvidencePayload(ev: ReceiptEvidenceState): ReceiptEvidencePayload {
  const line = selectedLine(ev)
  return {
    document_photo_urls: ev.photoUrls,
    ocr_scan_id: ev.scan && line ? ev.scan.scanId : undefined,
    ocr_line_index: line ? line.index : undefined,
    mismatch_reason: line && ev.mismatchReason.trim() ? ev.mismatchReason.trim() : undefined,
  }
}
