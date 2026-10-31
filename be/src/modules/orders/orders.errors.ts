/**
 * ===================================================================
 * DANH SÁCH MÃ LỖI — module orders (prefix: ORD_)
 * ===================================================================
 * Cùng nguyên tắc đã áp dụng ở MKT_ERROR_CODES (marketplace-integration.errors.ts):
 * đăng ký hết vào đây, không gõ string lỗi trực tiếp tại nơi ném lỗi.
 * ===================================================================
 */
export const ORD_ERROR_CODES = {
  SYNC_FAILED: 'ORD_SYNC_FAILED',
  UNSUPPORTED_PLATFORM: 'ORD_UNSUPPORTED_PLATFORM',
  INVALID_ORDER_ID: 'ORD_INVALID_ORDER_ID',
  ORDER_NOT_FOUND: 'ORD_ORDER_NOT_FOUND',
  // 15/10/2026 — tiêu chí đồng bộ & gom đơn do Admin cấu hình
  SYNC_SETTINGS_INVALID: 'ORD_SYNC_SETTINGS_INVALID',
  SYNC_SETTINGS_CONFLICT: 'ORD_SYNC_SETTINGS_CONFLICT',
  // 31/10/2026 — quy tắc gộp đơn bổ sung (GUIDE_DOC/CONSOLIDATION_RULES_DESIGN.md)
  CONSOLIDATION_RULE_NOT_FOUND: 'ORD_CONSOLIDATION_RULE_NOT_FOUND',
  CONSOLIDATION_RULE_INVALID: 'ORD_CONSOLIDATION_RULE_INVALID',
  CONSOLIDATION_RULE_LIMIT: 'ORD_CONSOLIDATION_RULE_LIMIT',
  CONSOLIDATION_RULE_AI_UNAVAILABLE: 'ORD_CONSOLIDATION_RULE_AI_UNAVAILABLE',
} as const;
