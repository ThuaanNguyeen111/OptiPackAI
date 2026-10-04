/** Mã lỗi module packing (kế hoạch đóng gói `packing_plans`, 04/10/2026). */
export const PACKING_ERROR_CODES = {
  INVALID_ID: 'PACKING_INVALID_ID',
  PLAN_NOT_FOUND: 'PACKING_PLAN_NOT_FOUND', // nhóm chưa có kế hoạch đang hoạt động
  PLAN_COMPUTING: 'PACKING_PLAN_COMPUTING', // đang có lần tính khác của cùng nhóm
  WRONG_PLAN_STATUS: 'PACKING_WRONG_PLAN_STATUS', // thao tác không hợp với trạng thái kế hoạch/nhóm
  VERSION_CONFLICT: 'PACKING_VERSION_CONFLICT', // kế hoạch vừa bị người khác/hệ thống đổi — tải lại
  HAS_UNPLACED: 'PACKING_HAS_UNPLACED', // duyệt khi còn đơn chưa xếp hết món
  PARCEL_NOT_FOUND: 'PACKING_PARCEL_NOT_FOUND',
  ITEM_NOT_IN_PARCEL: 'PACKING_ITEM_NOT_IN_PARCEL',
  MOVE_ACROSS_ORDERS: 'PACKING_MOVE_ACROSS_ORDERS', // món của đơn này không được sang kiện của đơn khác
  BOX_DOES_NOT_FIT: 'PACKING_BOX_DOES_NOT_FIT', // chỉnh tay mà validator không chấp nhận
  NOTE_REQUIRED: 'PACKING_NOTE_REQUIRED', // lý do "Khác" phải ghi chú
  PACK_WEIGHTS_MISMATCH: 'PACKING_PACK_WEIGHTS_MISMATCH', // danh sách cân không khớp đúng các kiện
  GUIDE_NOT_AVAILABLE: 'PACKING_GUIDE_NOT_AVAILABLE',
} as const;
