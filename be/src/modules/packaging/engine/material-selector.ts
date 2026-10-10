import { ProductCategory } from '../../../common/enums/product-category.enum';
import type {
  MaterialLine,
  MaterialPlanning,
  MaterialRule,
  MaterialSpec,
  MaterialType,
  PackingUnit,
} from './types';

/**
 * ===================================================================
 * Chọn vật tư chèn theo luật (28/09/2026, P1) — hàm thuần
 * ===================================================================
 * KẾT QUẢ LÀ ƯỚC LƯỢNG THEO LUẬT, không phải lượng đệm tính từ hình học:
 * vật tư không chiếm thể tích trong validator (xem ghi chú ở types.ts).
 *
 * Luật là dữ liệu (DB, có version) — bộ mặc định dưới đây dùng khi DB chưa
 * có luật nào, và là nội dung seed ban đầu. Catalog thiếu loại vật tư mà
 * luật yêu cầu → bỏ qua luật đó (không lỗi), nhân viên tự bổ sung danh mục.
 * ===================================================================
 */
export const DEFAULT_MATERIAL_RULES: MaterialRule[] = [
  // Giày trong hộp cứng: góc xốp bảo vệ góc hộp, mỗi hộp 4 góc.
  {
    material_type: 'foam_corner',
    applies_to: 'shoes',
    basis: 'per_unit',
    quantity: 4,
  },
  // ≥ 2 hộp giày chung thùng: tấm ngăn giữa các hộp.
  {
    material_type: 'corrugated_divider',
    applies_to: 'shoes',
    min_units: 2,
    basis: 'per_extra_unit',
    quantity: 1,
  },
  // Hàng dễ vỡ: bọc xốp hơi mỗi món.
  {
    material_type: 'bubble_wrap',
    applies_to: 'fragile',
    basis: 'per_unit',
    quantity: 1,
  },
  // Thùng trống nhiều: gối hơi lấp khoảng trống chống xê dịch (áp cả đơn chỉ có quần áo).
  {
    material_type: 'air_pillow',
    applies_to: 'any',
    basis: 'void_band',
    void_bands: [
      { min_void_ratio: 0.5, quantity: 2 },
      { min_void_ratio: 0.7, quantity: 4 },
    ],
  },
  // Kiện có hộp giày hoặc hàng dễ vỡ: dán tem cảnh báo bên ngoài.
  {
    material_type: 'fragile_tape',
    applies_to: 'fragile_or_shoes',
    basis: 'per_carton',
    quantity: 1,
  },
];

function inScope(
  unit: PackingUnit,
  scope: MaterialRule['applies_to'],
): boolean {
  const isShoes = unit.product_category === ProductCategory.SHOES;
  switch (scope) {
    case 'fragile':
      return unit.is_fragile;
    case 'shoes':
      return isShoes;
    case 'fragile_or_shoes':
      return unit.is_fragile || isShoes;
    case 'any':
      return true;
  }
}

function ruleQuantity(
  rule: MaterialRule,
  scopedCount: number,
  fillRatio: number,
): number {
  const minUnits = rule.min_units ?? 1;
  if (scopedCount < minUnits || scopedCount === 0) return 0;
  const factor = rule.quantity ?? 0;
  switch (rule.basis) {
    case 'per_unit':
      return factor * scopedCount;
    case 'per_extra_unit':
      return factor * (scopedCount - 1);
    case 'per_carton':
      return factor;
    case 'void_band': {
      const voidRatio = 1 - fillRatio;
      const matching = (rule.void_bands ?? []).filter(
        (band) => voidRatio >= band.min_void_ratio,
      );
      return matching.reduce((best, band) => Math.max(best, band.quantity), 0);
    }
  }
}

/** Vật tư đại diện cho 1 loại: mã nhỏ nhất theo thứ tự chữ cái (xác định, không phụ thuộc thứ tự DB). */
function catalogByType(
  catalog: MaterialSpec[],
): Map<MaterialType, MaterialSpec> {
  const byType = new Map<MaterialType, MaterialSpec>();
  for (const spec of [...catalog].sort((a, b) =>
    a.code.localeCompare(b.code),
  )) {
    if (!byType.has(spec.type)) byType.set(spec.type, spec);
  }
  return byType;
}

/**
 * Tính vật tư cho MỘT kiện. `fillRatio` = thể tích hàng / lòng thùng (0..1).
 * Cùng loại vật tư do nhiều luật sinh ra được cộng dồn thành 1 dòng.
 */
export function selectMaterials(
  units: PackingUnit[],
  fillRatio: number,
  planning: MaterialPlanning,
): MaterialLine[] {
  const specs = catalogByType(planning.catalog);
  const totals = new Map<MaterialType, number>();
  for (const rule of planning.rules) {
    if (!specs.has(rule.material_type)) continue;
    const scopedCount = units.filter((u) => inScope(u, rule.applies_to)).length;
    const quantity = ruleQuantity(rule, scopedCount, fillRatio);
    if (quantity > 0)
      totals.set(
        rule.material_type,
        (totals.get(rule.material_type) ?? 0) + quantity,
      );
  }
  const lines: MaterialLine[] = [];
  for (const [type, quantity] of totals) {
    const spec = specs.get(type);
    if (!spec) continue;
    lines.push({
      code: spec.code,
      type,
      name: spec.name,
      unit: spec.unit,
      quantity,
      weight_g: quantity * spec.weight_g_per_unit,
      cost_vnd: quantity * spec.price_vnd_per_unit,
    });
  }
  return lines.sort((a, b) => a.code.localeCompare(b.code));
}
