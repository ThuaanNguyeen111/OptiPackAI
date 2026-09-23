import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import { ProductCategory } from '../../../common/enums/product-category.enum';
import {
  ALL_ORIENTATIONS,
  UPRIGHT_ORIENTATIONS,
  type Orientation,
  type PackingUnit,
} from './types';

/**
 * Đổi cm → mm làm tròn LÊN (món hàng không được nhỏ hơn thực tế).
 * Làm tròn trước 3 chữ số để tránh lỗi dấu phẩy động (28.1*10 = 281.00000000000006).
 */
export function cmToMmCeil(cm: number): number {
  return Math.ceil(Math.round(cm * 10 * 1000) / 1000);
}

/** kg → g làm tròn LÊN. */
export function kgToGCeil(kg: number): number {
  return Math.ceil(Math.round(kg * 1000 * 1000) / 1000);
}

/** Kích thước sau xoay theo trục x/y/z. */
export function orientedDims(
  unit: Pick<PackingUnit, 'length_mm' | 'width_mm' | 'height_mm'>,
  orientation: Orientation,
): [number, number, number] {
  const { length_mm: l, width_mm: w, height_mm: h } = unit;
  switch (orientation) {
    case 'LWH':
      return [l, w, h];
    case 'WLH':
      return [w, l, h];
    case 'LHW':
      return [l, h, w];
    case 'HLW':
      return [h, l, w];
    case 'WHL':
      return [w, h, l];
    case 'HWL':
      return [h, w, l];
  }
}

/**
 * (22/09/2026) Quần áo LUÔN nằm phẳng: chỉ xoay quanh trục đứng, không dựng
 * gói vải trên cạnh mỏng — áp theo loại sản phẩm, bỏ qua `orientation_rule`
 * đã lưu (kể cả hồ sơ cũ để "xoay tự do"). User chốt 22/09/2026.
 */
const FLAT_CATEGORIES: ReadonlySet<string> = new Set([
  ProductCategory.T_SHIRT,
  ProductCategory.SHIRT,
  ProductCategory.JACKET,
  ProductCategory.SHORTS,
  ProductCategory.TROUSERS,
  ProductCategory.DRESS,
]);

/**
 * (22/09/2026) Gập đôi 1 món mềm: chia đôi (làm tròn lên) cạnh lớn hơn trong
 * dài/rộng, gấp đôi độ dày, cân giữ nguyên. Số đo do hệ thống tự tính (user
 * chốt), chỉ dùng khi nhờ gập mới vừa thùng nhỏ hơn.
 */
export function foldUnit(unit: PackingUnit): PackingUnit {
  const lengthIsLonger = unit.length_mm >= unit.width_mm;
  return {
    ...unit,
    length_mm: lengthIsLonger ? Math.ceil(unit.length_mm / 2) : unit.length_mm,
    width_mm: lengthIsLonger ? unit.width_mm : Math.ceil(unit.width_mm / 2),
    height_mm: unit.height_mm * 2,
    folded: true,
  };
}

/**
 * Mở `PackableItem` (số lượng gộp theo SKU) thành từng đơn vị vật lý có
 * `item_key` riêng. KHÔNG đổi interface dùng chung — chỉ nở ra trong engine.
 */
export function expandToUnits(items: PackableItem[]): PackingUnit[] {
  const units: PackingUnit[] = [];
  for (const item of [...items].sort((a, b) => a.sku.localeCompare(b.sku))) {
    const lieFlat = FLAT_CATEGORIES.has(item.product_category ?? '');
    const orientations =
      lieFlat || item.orientation_rule === 'upright_only' ? UPRIGHT_ORIENTATIONS : ALL_ORIENTATIONS;
    const maxStack =
      item.max_stack_load_kg === null || item.max_stack_load_kg === undefined
        ? null
        : Math.floor(item.max_stack_load_kg * 1000);
    for (let n = 1; n <= item.quantity; n += 1) {
      units.push({
        item_key: `${item.sku}#${String(n)}`,
        sku: item.sku,
        length_mm: cmToMmCeil(item.length_cm),
        width_mm: cmToMmCeil(item.width_cm),
        height_mm: cmToMmCeil(item.height_cm),
        weight_g: kgToGCeil(item.weight_kg),
        is_fragile: item.is_fragile,
        orientations,
        max_stack_load_g: maxStack,
        foldable: item.can_fold_in_half === true,
      });
    }
  }
  return units;
}
