/**
 * ===================================================================
 * DANH SÁCH MÃ LỖI — module order-groups (prefix: ORD_GROUP_)
 * ===================================================================
 * Cùng nguyên tắc đã áp dụng ở ORD_ERROR_CODES/MKT_ERROR_CODES: prefix
 * theo MODULE, đăng ký hết vào đây, không gõ string lỗi trực tiếp.
 * ===================================================================
 */
export const ORD_GROUP_ERROR_CODES = {
  INVALID_GROUP_ID: 'ORD_GROUP_INVALID_ID',
  GROUP_NOT_FOUND: 'ORD_GROUP_NOT_FOUND',
  STATE_CONFLICT: 'ORD_GROUP_STATE_CONFLICT', // Rule #18 optimistic concurrency — version không khớp
  INVALID_TRANSITION: 'ORD_GROUP_INVALID_TRANSITION', // MỚI — chuyển trạng thái không hợp lệ theo allowed-status-transitions.ts
} as const;
