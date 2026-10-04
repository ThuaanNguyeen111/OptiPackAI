import type {
  PackagingRecommendationDocument,
  CartonEntry,
} from '../schemas/packaging-recommendation.schema';

/** Bản sao thuần (không subdocument) của 1 kiện, để `$set` cả mảng an toàn. */
export function plainCarton(c: CartonEntry): CartonEntry {
  return {
    index: c.index,
    box_code: c.box_code,
    box_name: c.box_name,
    box_inner_mm: {
      length_mm: c.box_inner_mm.length_mm,
      width_mm: c.box_inner_mm.width_mm,
      height_mm: c.box_inner_mm.height_mm,
    },
    box_outer_mm: {
      length_mm: c.box_outer_mm.length_mm,
      width_mm: c.box_outer_mm.width_mm,
      height_mm: c.box_outer_mm.height_mm,
    },
    placements: c.placements.map((p) => ({
      item_key: p.item_key,
      sku: p.sku,
      step: p.step,
      x: p.x,
      y: p.y,
      z: p.z,
      dx: p.dx,
      dy: p.dy,
      dz: p.dz,
      orientation: p.orientation,
      folded: p.folded,
    })),
    fill_ratio: c.fill_ratio,
    items_weight_g: c.items_weight_g,
    estimated_package_weight_g: c.estimated_package_weight_g,
    volumetric_weight_g: c.volumetric_weight_g,
    materials: c.materials.map((m) => ({
      type: m.type,
      quantity: m.quantity,
      code: m.code,
      name: m.name,
      unit: m.unit,
      weight_g: m.weight_g,
      cost_vnd: m.cost_vnd,
    })),
    materials_weight_g: c.materials_weight_g,
    materials_cost_vnd: c.materials_cost_vnd,
    actual_measured_weight_kg: c.actual_measured_weight_kg,
    is_abnormal: c.is_abnormal,
    packing_guide: c.packing_guide
      ? {
          source: c.packing_guide.source,
          model: c.packing_guide.model,
          fallback_reason: c.packing_guide.fallback_reason,
          summary: c.packing_guide.summary,
          steps: c.packing_guide.steps.map((st) => ({
            step: st.step,
            instruction: st.instruction,
            tip: st.tip,
          })),
          generated_at: c.packing_guide.generated_at,
        }
      : null,
  };
}

/**
 * Các kiện của 1 phương án, đọc thống nhất: có `cartons` thì dùng, bản ghi cũ
 * (mỗi đơn 1 kiện, trước 30/09) suy ra đúng 1 kiện từ field cấp trên;
 * no_fit -> rỗng.
 */
export function cartonsOf(rec: PackagingRecommendationDocument): CartonEntry[] {
  if (rec.cartons.length > 0) return rec.cartons.map((c) => plainCarton(c));
  if (
    rec.solution_status !== 'ok' ||
    !rec.box_code ||
    !rec.box_inner_mm ||
    !rec.box_outer_mm
  )
    return [];
  return [
    plainCarton({
      index: 0,
      box_code: rec.box_code,
      box_name: rec.box_name,
      box_inner_mm: rec.box_inner_mm,
      box_outer_mm: rec.box_outer_mm,
      placements: rec.placements,
      fill_ratio: rec.fill_ratio ?? 0,
      items_weight_g: rec.items_weight_g ?? 0,
      estimated_package_weight_g: rec.estimated_package_weight_g ?? 0,
      volumetric_weight_g: rec.volumetric_weight_g ?? 0,
      materials: rec.materials,
      materials_weight_g: rec.materials_weight_g,
      materials_cost_vnd: rec.materials_cost_vnd,
      actual_measured_weight_kg: rec.actual_measured_weight_kg,
      is_abnormal: rec.is_abnormal,
      packing_guide: rec.packing_guide,
    }),
  ];
}
