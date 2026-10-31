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
  /** AOFP-224 (31/10/2026) — túi xách. Không nằm phẳng/gập như quần áo. */
  BAG = 'bag',
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
  [ProductCategory.BAG]: 'túi xách',
  [ProductCategory.ACCESSORY]: 'phụ kiện',
  [ProductCategory.OTHER]: 'sản phẩm',
};
