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
  // ---- phiên đóng gói (05/10/2026)
  PARCEL_WRONG_STATUS: 'PACKING_PARCEL_WRONG_STATUS', // thao tác không hợp với trạng thái KIỆN
  SCAN_NOT_IN_PLAN: 'PACKING_SCAN_NOT_IN_PLAN', // mã quét không thuộc kế hoạch
  SCAN_WRONG_PARCEL: 'PACKING_SCAN_WRONG_PARCEL', // món thuộc kiện khác
  SCAN_OVER: 'PACKING_SCAN_OVER', // quét nhiều hơn số món của kiện
  SCAN_NOT_FOUND: 'PACKING_SCAN_NOT_FOUND', // gỡ lần quét không tồn tại
  PARCEL_NOT_FULLY_SCANNED: 'PACKING_PARCEL_NOT_FULLY_SCANNED', // niêm phong khi chưa quét đủ
  SCAN_REQUIRED: 'PACKING_SCAN_REQUIRED', // cài đặt bắt buộc quét — lối tắt pack bị chặn
  WEIGHT_REQUIRED: 'PACKING_WEIGHT_REQUIRED', // cân lại mà không gửi cân
  SELF_REVIEW_FORBIDDEN: 'PACKING_SELF_REVIEW_FORBIDDEN', // tự chấp nhận kiện mình niêm phong
  NOT_COMPLETE: 'PACKING_NOT_COMPLETE', // hoàn tất khi còn kiện chưa niêm phong/đang giữ
  PARCEL_LIMIT_EXCEEDED: 'PACKING_PARCEL_LIMIT_EXCEEDED', // vượt số kiện tối đa, duyệt thiếu lý do
  ISSUE_HAS_SEALED_PARCELS: 'PACKING_ISSUE_HAS_SEALED_PARCELS', // trả về lấy hàng khi đã có kiện niêm phong
  REPLACEMENT_WAREHOUSE_REQUIRED: 'PACKING_REPLACEMENT_WAREHOUSE_REQUIRED',
  PACKER_INVALID: 'PACKING_PACKER_INVALID', // người được giao không phải Packaging Staff đang hoạt động
  NO_PACKER_AVAILABLE: 'PACKING_NO_PACKER_AVAILABLE',
  SETTINGS_CONFLICT: 'PACKING_SETTINGS_CONFLICT',
  INVALID_DATE_RANGE: 'PACKING_INVALID_DATE_RANGE',
  SAME_BOX: 'PACKING_SAME_BOX', // đổi thùng lúc đóng nhưng chọn đúng thùng đang dùng và khai chưa dùng
  MANUAL_PACK_INVALID: 'PACKING_MANUAL_PACK_INVALID', // đóng thủ công: thiếu/trùng/sai món, quá tải thùng
  RECOVER_MATERIAL_INVALID: 'PACKING_RECOVER_MATERIAL_INVALID', // thu hồi vật tư không có trong kiện / vượt số lượng
} as const;
