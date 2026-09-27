export const CATEGORY_ERROR_CODES = {
  NOT_FOUND: 'CAT_NOT_FOUND',
  CODE_IN_USE: 'CAT_CODE_IN_USE',
  PARENT_NOT_FOUND: 'CAT_PARENT_NOT_FOUND',
  PARENT_NOT_LEVEL_1: 'CAT_PARENT_NOT_LEVEL_1', // chỉ cho 2 cấp — cha phải là cấp 1
  PARENT_INACTIVE: 'CAT_PARENT_INACTIVE',
  SIZE_SCALE_REQUIRED: 'CAT_SIZE_SCALE_REQUIRED', // cấp 2 bắt buộc có thang size
  SIZE_SCALE_NOT_ALLOWED: 'CAT_SIZE_SCALE_NOT_ALLOWED', // cấp 1 không có thang size
  SIZE_IN_USE: 'CAT_SIZE_IN_USE', // bỏ size mà kệ đang đăng ký dùng
  HAS_ACTIVE_CHILDREN: 'CAT_HAS_ACTIVE_CHILDREN',
  IN_USE: 'CAT_IN_USE', // kệ đang đăng ký danh mục này
  INACTIVE: 'CAT_INACTIVE',
  NOT_LEVEL_2: 'CAT_NOT_LEVEL_2', // kệ/sản phẩm chỉ gắn được danh mục cấp 2
  NOTHING_TO_UPDATE: 'CAT_NOTHING_TO_UPDATE',
} as const;
