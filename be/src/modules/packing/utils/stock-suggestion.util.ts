import type { BoxSpec, PackingUnit } from '../../packaging/engine';
import { compareObjective, solveOrder, type SolveOptions, type SolveResult } from '../solver';
import type { PlanStockSuggestion } from '../schemas/packing-plan.schema';

/**
 * ===================================================================
 * Gợi ý kho thùng (04/10/2026)
 * ===================================================================
 * Đơn bị buộc dùng thùng to/nhiều kiện chỉ vì kho hết thùng vừa hơn → giải
 * thêm 1 lần "giả định kho đủ mọi thùng đang dùng" (cùng seed, xác định).
 * Chỉ trả gợi ý khi phương án giả định TỐT HƠN theo đúng mục tiêu bậc của bộ
 * giải; kèm danh sách thùng thiếu (cần bao nhiêu, đang trống bao nhiêu).
 * Chỉ giải lại khi có thùng mà tồn trống ít hơn số món của đơn (tồn đó mới có
 * thể là nút thắt), để không tốn thời gian với đơn kho dư thùng.
 * ===================================================================
 */

interface Dims {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}
const innerVolume = (b: { inner: Dims }): number =>
  b.inner.length_mm * b.inner.width_mm * b.inner.height_mm;

/** Lấp đầy trung bình = tổng thể tích hàng ÷ tổng lòng thùng (0..1). Dùng cho cả kiện vừa giải lẫn kiện đã lưu. */
export function averageFill(
  parcels: { box: { inner: Dims }; placements: { dx: number; dy: number; dz: number }[] }[],
): number {
  const boxes = parcels.reduce((s, p) => s + innerVolume(p.box), 0);
  if (boxes === 0) return 0;
  const goods = parcels.reduce(
    (s, p) => s + p.placements.reduce((t, q) => t + q.dx * q.dy * q.dz, 0),
    0,
  );
  return goods / boxes;
}

export function suggestStock(
  units: PackingUnit[],
  boxes: BoxSpec[],
  actual: SolveResult,
  stock: Map<string, number>,
  options: Omit<SolveOptions, 'availability'>,
): PlanStockSuggestion | null {
  const excluded = new Set(options.excludeBoxCodes ?? []);
  const usable = boxes.filter((b) => !excluded.has(b.code));
  const constrained = usable.some((b) => (stock.get(b.code) ?? 0) < units.length);
  if (units.length === 0 || !constrained) return null;

  const whatIf = solveOrder(units, boxes, { ...options, availability: undefined });
  const prefer = options.prefer ?? 'fewest_parcels';
  if (compareObjective(whatIf.objective, actual.objective, prefer) >= 0) return null;

  const needed = new Map<string, number>();
  for (const p of whatIf.parcels) needed.set(p.box.code, (needed.get(p.box.code) ?? 0) + 1);
  const missing = [...needed]
    .map(([code, count]) => ({
      box_code: code,
      box_name: usable.find((b) => b.code === code)?.name ?? code,
      needed: count,
      available: Math.max(0, stock.get(code) ?? 0),
    }))
    .filter((m) => m.needed > m.available)
    .sort((a, b) => a.box_code.localeCompare(b.box_code));
  // Tốt hơn mà không thiếu thùng nào = khác biệt do tìm kiếm, không phải do kho → không gợi ý.
  if (missing.length === 0) return null;

  return {
    parcels: whatIf.parcels.length,
    packaging_cost_vnd: whatIf.objective.packaging_cost_vnd,
    avg_fill: averageFill(whatIf.parcels),
    current_parcels: actual.parcels.length,
    current_avg_fill: averageFill(actual.parcels),
    saving_vnd: actual.objective.packaging_cost_vnd - whatIf.objective.packaging_cost_vnd,
    missing,
  };
}

/** Câu giải thích ngắn cho mục "Vì sao phương án này?". */
export function describeSuggestion(s: PlanStockSuggestion): string {
  const boxes = s.missing
    .map((m) => `${m.box_code} (thiếu ${String(m.needed - m.available)})`)
    .join(', ');
  const pct = (x: number): string => `${String(Math.round(x * 100))}%`;
  const money =
    s.saving_vnd > 0
      ? `, rẻ hơn ${s.saving_vnd.toLocaleString('vi-VN')} đ`
      : s.saving_vnd < 0
        ? `, đắt hơn ${(-s.saving_vnd).toLocaleString('vi-VN')} đ`
        : '';
  return `Nếu kho có đủ thùng ${boxes}: ${String(s.parcels)} kiện, lấp đầy ${pct(s.avg_fill)} (hiện ${String(s.current_parcels)} kiện, ${pct(s.current_avg_fill)})${money}.`;
}
