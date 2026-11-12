/** 11/11/2026 — phiếu NCC: ảnh minh chứng + OCR đối chiếu số lượng (STOCK_RECEIPT_OCR_HANDOFF). */
export const RECEIPT_OCR_ERROR_CODES = {
  PHOTO_REQUIRED: 'WH_RECEIPT_PHOTO_REQUIRED', // nhập kho từ NCC không kèm ảnh phiếu
  PURCHASE_PHOTO_REQUIRED: 'PKG_PURCHASE_PHOTO_REQUIRED', // mua vật liệu không kèm ảnh phiếu
  OCR_UNAVAILABLE: 'WH_RECEIPT_OCR_UNAVAILABLE', // 503 — chưa cấu hình AI (AI_API_KEY)
  OCR_FAILED: 'WH_RECEIPT_OCR_FAILED', // 502 — AI lỗi / hết hạn mức / trả sai định dạng
  OCR_SCAN_INVALID: 'WH_RECEIPT_OCR_SCAN_INVALID', // scan không tồn tại / hết hạn / ảnh không thuộc phiếu
  OCR_LINE_INVALID: 'WH_RECEIPT_OCR_LINE_INVALID', // ocr_line_index ngoài phạm vi / 2 dòng cùng 1 dòng phiếu / thiếu scan
  MISMATCH_REASON_REQUIRED: 'WH_RECEIPT_MISMATCH_REASON_REQUIRED', // số nhập khác số trên phiếu mà không ghi lý do
} as const;
