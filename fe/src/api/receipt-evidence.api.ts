import { apiRequest } from '../lib/api'
import { uploadProofPhotos } from './proof-photos.api'

/**
 * 11/11/2026 — Ảnh phiếu nhà cung cấp + đọc phiếu bằng AI (OCR) để đối chiếu số lượng
 * khi nhập kho (phiếu nhập) và nhập vật tư (thùng / túi / vật tư chèn / mua vật liệu).
 */

export type OcrStatus = 'matched' | 'mismatch' | 'not_checked'

export type ReceiptScanLine = {
  index: number
  text: string
  code: string | null
  quantity: number
  unit: string | null
}

export type ReceiptScan = {
  scanId: string
  model: string
  supplier: string | null
  documentDate: string | null
  lines: ReceiptScanLine[]
}

/** Phần gửi kèm body khi lưu (tên field theo BE). */
export type ReceiptEvidencePayload = {
  document_photo_urls: string[]
  ocr_scan_id?: string
  ocr_line_index?: number
  mismatch_reason?: string
}

/** Phần "phiếu NCC" BE trả trong lịch sử nhập vật tư. */
export type IntakeEvidence = {
  documentPhotoUrls: string[]
  supplier: string | null
  ocrStatus: OcrStatus | null
  ocrText: string | null
  ocrQuantity: number | null
  mismatchReason: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toOcrStatus(value: unknown): OcrStatus | null {
  return value === 'matched' || value === 'mismatch' || value === 'not_checked' ? value : null
}

export function mapIntakeEvidence(raw: Record<string, unknown>): IntakeEvidence {
  const urls = raw.documentPhotoUrls ?? raw.document_photo_urls
  return {
    documentPhotoUrls: Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string') : [],
    supplier: str(raw.supplier),
    ocrStatus: toOcrStatus(raw.ocrStatus ?? raw.ocr_status),
    ocrText: str(raw.ocrText ?? raw.ocr_text),
    ocrQuantity: num(raw.ocrQuantity ?? raw.ocr_quantity),
    mismatchReason: str(raw.mismatchReason ?? raw.mismatch_reason),
  }
}

/** POST /proof-photos?purpose=receipt — 1–3 ảnh, mỗi ảnh ≤ 10 MB. Trả URL theo thứ tự gửi. */
export function uploadReceiptPhotos(files: File[]): Promise<string[]> {
  return uploadProofPhotos(files, 'receipt')
}

/** POST /receipt-ocr — AI đọc phiếu. Lỗi 503/502 → FE cho nhập tay ("chưa đối chiếu"). */
export async function scanReceipt(photoUrls: string[]): Promise<ReceiptScan> {
  const res = asRecord(
    await apiRequest<unknown>('/receipt-ocr', {
      method: 'POST',
      auth: true,
      body: { photo_urls: photoUrls },
      timeoutMs: 90_000,
    }),
  )
  const scanId = str(res?.scanId)
  if (!res || !scanId) throw new Error('Kết quả đọc phiếu không đúng định dạng.')
  const lines = Array.isArray(res.lines) ? res.lines : []
  return {
    scanId,
    model: str(res.model) ?? '',
    supplier: str(res.supplier),
    documentDate: str(res.documentDate),
    lines: lines.flatMap((raw, i) => {
      const line = asRecord(raw)
      const quantity = num(line?.quantity)
      const text = str(line?.text)
      if (!line || quantity === null || !text) return []
      return [{ index: num(line.index) ?? i, text, code: str(line.code), quantity, unit: str(line.unit) }]
    }),
  }
}
