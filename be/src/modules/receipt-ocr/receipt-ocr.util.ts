import { HttpStatus } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { RECEIPT_OCR_ERROR_CODES } from './receipt-ocr.errors';
import type { OcrStatus, ReceiptOcrCheck, ReceiptOcrLine, ReceiptOcrSnapshot } from './schemas/receipt-ocr-scan.schema';

export const MAX_OCR_LINES = 200;

export interface ParsedOcrResult {
  supplier: string | null;
  document_date: string | null;
  lines: ReceiptOcrLine[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

/** Kiểm output AI. Sai khuôn → null. Dòng thiếu tên hoặc số lượng không phải số nguyên ≥ 0 → bỏ dòng đó. */
export function parseOcrResult(raw: unknown): ParsedOcrResult | null {
  if (!isRecord(raw) || !Array.isArray(raw.lines)) return null;
  const lines: ReceiptOcrLine[] = [];
  for (const item of raw.lines.slice(0, MAX_OCR_LINES)) {
    if (!isRecord(item)) continue;
    const name = text(item.text, 200);
    // "1.000" / "1,000" trên phiếu VN là một nghìn.
    const qty = typeof item.quantity === 'string' && item.quantity.trim() !== '' ? Number(item.quantity.replace(/[.,\s]/g, '')) : item.quantity;
    if (!name || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0) continue;
    lines.push({ text: name, code: text(item.code, 80), quantity: qty, unit: text(item.unit, 20) });
  }
  return { supplier: text(raw.supplier, 120), document_date: text(raw.document_date, 40), lines };
}

/** 1 dòng nhân viên nhập, kèm dòng phiếu (OCR) mà nó ứng với. */
export interface OcrCheckInput {
  lineIndex: number;
  label: string;
  quantity: number;
  ocrLineIndex?: number;
  mismatchReason?: string;
}

export type OcrCheckProblem =
  | { kind: 'no_scan'; lineIndex: number }
  | { kind: 'out_of_range'; lineIndex: number; ocrLineIndex: number }
  | { kind: 'duplicate'; lineIndex: number; ocrLineIndex: number }
  | { kind: 'reason_required'; lineIndex: number; label: string; ocrQuantity: number; quantity: number };

export type OcrCheckResult = { ok: true; checks: ReceiptOcrCheck[]; status: OcrStatus } | { ok: false; problem: OcrCheckProblem };

/**
 * Đối chiếu số đã nhập với số AI đọc trên phiếu. Lệch không chặn nhưng bắt lý do (Q2).
 * Không dòng nào gắn với phiếu → `not_checked` (chưa đối chiếu).
 */
export function checkAgainstScan(scanLines: ReceiptOcrLine[] | null, inputs: OcrCheckInput[]): OcrCheckResult {
  const checks: ReceiptOcrCheck[] = [];
  const used = new Set<number>();
  for (const input of inputs) {
    if (input.ocrLineIndex === undefined) continue;
    if (!scanLines) return { ok: false, problem: { kind: 'no_scan', lineIndex: input.lineIndex } };
    const ocr = scanLines[input.ocrLineIndex];
    if (!ocr) return { ok: false, problem: { kind: 'out_of_range', lineIndex: input.lineIndex, ocrLineIndex: input.ocrLineIndex } };
    if (used.has(input.ocrLineIndex)) return { ok: false, problem: { kind: 'duplicate', lineIndex: input.lineIndex, ocrLineIndex: input.ocrLineIndex } };
    used.add(input.ocrLineIndex);
    const trimmed = input.mismatchReason?.trim() ?? '';
    const reason = trimmed.length > 0 ? trimmed : null;
    const differs = ocr.quantity !== input.quantity;
    if (differs && !reason) {
      return { ok: false, problem: { kind: 'reason_required', lineIndex: input.lineIndex, label: input.label, ocrQuantity: ocr.quantity, quantity: input.quantity } };
    }
    checks.push({
      line_index: input.lineIndex,
      label: input.label,
      ocr_line_index: input.ocrLineIndex,
      ocr_text: ocr.text,
      ocr_quantity: ocr.quantity,
      quantity: input.quantity,
      mismatch_reason: differs ? reason : null,
    });
  }
  const status: OcrStatus = checks.length === 0 ? 'not_checked' : checks.some((c) => c.ocr_quantity !== c.quantity) ? 'mismatch' : 'matched';
  return { ok: true, checks, status };
}

/** Kết quả đối chiếu dùng chung cho phiếu nhập kho và nhập vật tư. */
export interface ResolvedOcrChecks {
  scanId: Types.ObjectId | null;
  snapshot: ReceiptOcrSnapshot | null;
  checks: ReceiptOcrCheck[];
  status: OcrStatus;
}

export const NOT_CHECKED: ResolvedOcrChecks = { scanId: null, snapshot: null, checks: [], status: 'not_checked' };

/** Các field ghi vào 1 dòng sổ `packaging_movements` loại purchase. */
export interface MaterialIntakeFields {
  document_photo_urls: string[];
  supplier: string | null;
  ocr_status: OcrStatus;
  ocr_scan_id: Types.ObjectId | null;
  ocr_text: string | null;
  ocr_quantity: number | null;
  mismatch_reason: string | null;
}

/** Nhập vật tư từ NCC phải kèm ảnh phiếu (Q3). Trả mảng ảnh đã kiểm. */
export function requireMaterialPhotos(urls: string[] | undefined): string[] {
  if (!urls || urls.length === 0) {
    throw new AppException(RECEIPT_OCR_ERROR_CODES.PURCHASE_PHOTO_REQUIRED, 'Tải ảnh phiếu giao hàng / hoá đơn của nhà cung cấp trước khi lưu.', HttpStatus.BAD_REQUEST);
  }
  return urls;
}

export function materialIntakeFields(photoUrls: string[], supplier: string | undefined, ocr: ResolvedOcrChecks): MaterialIntakeFields {
  const check = ocr.checks[0];
  const typed = supplier?.trim() ?? '';
  return {
    document_photo_urls: photoUrls,
    supplier: typed.length > 0 ? typed : (ocr.snapshot?.supplier ?? null),
    ocr_status: ocr.status,
    ocr_scan_id: ocr.scanId,
    ocr_text: check?.ocr_text ?? null,
    ocr_quantity: check?.ocr_quantity ?? null,
    mismatch_reason: check?.mismatch_reason ?? null,
  };
}

/** Phần "phiếu NCC" của 1 dòng sổ vật tư trả cho FE (dòng cũ trước 11/11/2026 đọc `.lean()` có thể thiếu field). */
export interface IntakeEvidenceResponse {
  documentPhotoUrls: string[];
  supplier: string | null;
  ocrStatus: OcrStatus | null;
  ocrText: string | null;
  ocrQuantity: number | null;
  mismatchReason: string | null;
}

export function toIntakeEvidenceResponse(m: { [K in keyof MaterialIntakeFields]?: MaterialIntakeFields[K] | null }): IntakeEvidenceResponse {
  return {
    documentPhotoUrls: m.document_photo_urls ?? [],
    supplier: m.supplier ?? null,
    ocrStatus: m.ocr_status ?? null,
    ocrText: m.ocr_text ?? null,
    ocrQuantity: m.ocr_quantity ?? null,
    mismatchReason: m.mismatch_reason ?? null,
  };
}
