/**
 * Mã lỗi module packaging — từ 04/10/2026 chỉ còn danh mục thùng, túi zip,
 * vật tư và tồn kho. Lỗi của kế hoạch đóng gói (tính/duyệt/chỉnh/đóng) nằm ở
 * `PACKING_ERROR_CODES` (`modules/packing/packing.errors.ts`); các mã
 * `PKG_*` của luồng phương án cũ đã gỡ cùng `PackagingService`.
 */
export const PACKAGING_ERROR_CODES = {
  // Danh mục thùng (21/09/2026, Bước 0 engine 3D)
  INVALID_BOX_ID: 'PKG_INVALID_BOX_ID',
  BOX_NOT_FOUND: 'PKG_BOX_NOT_FOUND',
  BOX_CODE_IN_USE: 'PKG_BOX_CODE_IN_USE',
  BOX_INVALID_DIMENSIONS: 'PKG_BOX_INVALID_DIMENSIONS', // kích thước ngoài nhỏ hơn lòng thùng
  BOX_OUT_OF_STOCK: 'PKG_BOX_OUT_OF_STOCK', // (22/09/2026) thùng không còn trống (tồn − đang giữ chỗ) khi đổi thùng/đóng gói
  // Danh mục túi zip (21/09/2026)
  INVALID_BAG_ID: 'PKG_INVALID_BAG_ID',
  BAG_NOT_FOUND: 'PKG_BAG_NOT_FOUND',
  BAG_CODE_IN_USE: 'PKG_BAG_CODE_IN_USE',
  // Danh mục vật tư chèn + bộ luật (28/09/2026, P1)
  INVALID_MATERIAL_ID: 'PKG_INVALID_MATERIAL_ID',
  MATERIAL_NOT_FOUND: 'PKG_MATERIAL_NOT_FOUND',
  MATERIAL_CODE_IN_USE: 'PKG_MATERIAL_CODE_IN_USE',
  MATERIAL_RULES_CONFLICT: 'PKG_MATERIAL_RULES_CONFLICT', // 2 Admin lưu bộ luật cùng lúc
} as const;
