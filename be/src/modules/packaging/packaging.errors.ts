export const PACKAGING_ERROR_CODES = {
  INVALID_RECOMMENDATION_ID: 'PKG_INVALID_RECOMMENDATION_ID',
  RECOMMENDATION_NOT_FOUND: 'PKG_RECOMMENDATION_NOT_FOUND',
  NO_ACTIVE_RECOMMENDATION: 'PKG_NO_ACTIVE_RECOMMENDATION', // group chưa có recommendation nào (chưa generate)
  ALREADY_DECIDED: 'PKG_ALREADY_DECIDED', // recommendation đã Approve/Adjust/Reject trước đó, không cho quyết định lại
  GROUP_NOT_PENDING_APPROVAL: 'PKG_GROUP_NOT_PENDING_APPROVAL', // group không ở đúng trạng thái pending_approval khi Approve/Adjust/Reject
  // Danh mục thùng (21/09/2026, Bước 0 engine 3D)
  INVALID_BOX_ID: 'PKG_INVALID_BOX_ID',
  BOX_NOT_FOUND: 'PKG_BOX_NOT_FOUND',
  BOX_CODE_IN_USE: 'PKG_BOX_CODE_IN_USE',
  BOX_INVALID_DIMENSIONS: 'PKG_BOX_INVALID_DIMENSIONS', // kích thước ngoài nhỏ hơn lòng thùng
  // Engine 3D + mỗi đơn một kiện (21/09/2026)
  HAS_NO_FIT: 'PKG_HAS_NO_FIT', // approve khi còn đơn chưa có thùng hợp lệ — cần adjust trước
  BOX_DOES_NOT_FIT: 'PKG_BOX_DOES_NOT_FIT', // adjust chọn thùng mà validator không chấp nhận
  ORDER_NOT_IN_PLAN: 'PKG_ORDER_NOT_IN_PLAN', // order_id không có phương án active trong group
  PACK_PACKAGES_MISMATCH: 'PKG_PACK_PACKAGES_MISMATCH', // danh sách cân không khớp đúng các kiện của group
  ADJUSTMENT_NOTE_REQUIRED: 'PKG_ADJUSTMENT_NOTE_REQUIRED', // reason = OTHER mà không ghi chú
} as const;
