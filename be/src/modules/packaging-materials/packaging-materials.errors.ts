export const PACKAGING_MATERIAL_ERROR_CODES = {
  NOT_FOUND: 'PKG_MATERIAL_NOT_FOUND',
  CODE_IN_USE: 'PKG_MATERIAL_CODE_IN_USE',
  INVALID_DEFINITION: 'PKG_MATERIAL_INVALID_DEFINITION', // thùng thiếu kích thước / đệm thiếu match_material_type
  INACTIVE: 'PKG_MATERIAL_INACTIVE',
  NOTHING_TO_UPDATE: 'PKG_MATERIAL_NOTHING_TO_UPDATE',
  HAS_STOCK: 'PKG_MATERIAL_HAS_STOCK', // vô hiệu hóa khi còn tồn
  OLD_LABEL_NOT_REMOVED: 'PKG_OLD_LABEL_NOT_REMOVED', // xếp hạng A mà chưa gỡ nhãn cũ
  NOT_REUSABLE: 'PKG_MATERIAL_NOT_REUSABLE', // xếp hạng A cho vật liệu không tái sử dụng được
  INSUFFICIENT_INTERNAL: 'PKG_INSUFFICIENT_INTERNAL', // xuất dùng nội bộ vượt tồn hạng B
} as const;
