/**
 * Loại sản phẩm (21/09/2026) — kho chọn khi xác nhận hồ sơ SKU. Dùng cho
 * hình 3D đại diện trong animation đóng gói và cho lời hướng dẫn (gọi
 * đúng "áo", "quần", "hộp giày"...). KHÔNG ảnh hưởng hình học engine.
 */
export enum ProductCategory {
  T_SHIRT = 't_shirt',
  SHIRT = 'shirt',
  JACKET = 'jacket',
  SHORTS = 'shorts',
  TROUSERS = 'trousers',
  DRESS = 'dress',
  SHOES = 'shoes',
  SANDALS = 'sandals',
  ACCESSORY = 'accessory',
  OTHER = 'other',
}

export const PRODUCT_CATEGORY_VALUES = Object.values(ProductCategory);

/** Tên tiếng Việt — dùng trong câu hướng dẫn đóng gói. */
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  [ProductCategory.T_SHIRT]: 'áo thun',
  [ProductCategory.SHIRT]: 'áo sơ mi',
  [ProductCategory.JACKET]: 'áo khoác',
  [ProductCategory.SHORTS]: 'quần đùi/short',
  [ProductCategory.TROUSERS]: 'quần dài/jean',
  [ProductCategory.DRESS]: 'váy/đầm',
  [ProductCategory.SHOES]: 'giày (hộp)',
  [ProductCategory.SANDALS]: 'dép/sandal',
  [ProductCategory.ACCESSORY]: 'phụ kiện',
  [ProductCategory.OTHER]: 'sản phẩm',
};
