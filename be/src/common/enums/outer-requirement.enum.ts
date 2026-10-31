import { ProductCategory } from './product-category.enum';

/**
 * AOFP-224 (31/10/2026) — lớp vận chuyển một món đòi hỏi (docs/PACKAGING_STANDARD.md §4.1).
 * `mailer_ok`: đi được trong túi niêm phong (hàng mềm, không móp, không vỡ).
 * `box_required`: bắt buộc vào thùng (form cứng, dễ móp/vỡ, hộp thương hiệu).
 */
export const OUTER_REQUIREMENTS = ['mailer_ok', 'box_required'] as const;
export type OuterRequirement = (typeof OUTER_REQUIREMENTS)[number];

/**
 * Mặc định theo loại (bảng §5.1). Giày/sandal/túi xách mặc định `box_required`
 * (có hộp / có form) — kho hạ xuống `mailer_ok` cho sandal không hộp, túi vải mềm.
 * `other` an toàn trước.
 */
export const DEFAULT_OUTER_REQUIREMENT: Record<ProductCategory, OuterRequirement> = {
  [ProductCategory.T_SHIRT]: 'mailer_ok',
  [ProductCategory.SHIRT]: 'mailer_ok',
  [ProductCategory.JACKET]: 'mailer_ok',
  [ProductCategory.SHORTS]: 'mailer_ok',
  [ProductCategory.TROUSERS]: 'mailer_ok',
  [ProductCategory.DRESS]: 'mailer_ok',
  [ProductCategory.SHOES]: 'box_required',
  [ProductCategory.SANDALS]: 'box_required',
  [ProductCategory.BAG]: 'box_required',
  [ProductCategory.ACCESSORY]: 'mailer_ok',
  [ProductCategory.OTHER]: 'box_required',
};

function isProductCategory(value: string): value is ProductCategory {
  return (Object.values(ProductCategory) as string[]).includes(value);
}

/**
 * Lớp vận chuyển thật của 1 món: hàng dễ vỡ LUÔN vào thùng; còn lại theo giá trị
 * kho đặt cho SKU, thiếu thì theo loại, không rõ loại thì `box_required`.
 */
export function resolveOuterRequirement(item: {
  is_fragile: boolean;
  outer_requirement?: OuterRequirement | null;
  product_category?: string | null;
}): OuterRequirement {
  if (item.is_fragile) return 'box_required';
  if (item.outer_requirement) return item.outer_requirement;
  const category = item.product_category ?? null;
  if (category !== null && isProductCategory(category)) return DEFAULT_OUTER_REQUIREMENT[category];
  return 'box_required';
}
