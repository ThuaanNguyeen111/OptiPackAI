import type { PackableItem } from '../../../common/interfaces/packaging.interface';
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
 * Mở `PackableItem` (số lượng gộp theo SKU) thành từng đơn vị vật lý có
 * `item_key` riêng. KHÔNG đổi interface dùng chung — chỉ nở ra trong engine.
 */
export function expandToUnits(items: PackableItem[]): PackingUnit[] {
  const units: PackingUnit[] = [];
  for (const item of [...items].sort((a, b) => a.sku.localeCompare(b.sku))) {
    const orientations =
      item.orientation_rule === 'upright_only' ? UPRIGHT_ORIENTATIONS : ALL_ORIENTATIONS;
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
      });
    }
  }
  return units;
}
