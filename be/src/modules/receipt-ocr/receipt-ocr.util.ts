import type { OcrStatus, ReceiptOcrCheck, ReceiptOcrLine } from './schemas/receipt-ocr-scan.schema';

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
