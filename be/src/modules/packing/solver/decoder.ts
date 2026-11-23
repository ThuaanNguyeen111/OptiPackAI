import { ParcelState } from './parcel-state';
import type { BoxSpec, PackingUnit } from '../../packaging/engine/types';
import type { Variant } from './types';

/**
 * ===================================================================
 * Bộ giải mã BRKGA: nhiễm sắc thể → phương án nhiều kiện
 * ===================================================================
 * Bố cục khóa (mỗi khóa ∈ [0,1)), n = số món:
 *   keys[0..n)    thứ tự đặt món (sắp tăng dần theo khóa)
 *   keys[n..2n)   chọn biến thể (gập × hướng) trong các biến thể vừa EMS
 *   keys[2n]      thiên lệch loại thùng khi phải mở kiện mới
 * Mỗi món: thử các kiện đang mở theo thứ tự mở (first-fit), trong mỗi kiện
 * dùng EMS đáy-sâu-trái. Không kiện nào chứa được → mở kiện mới (mặc định
 * thùng LỚN NHẤT còn tồn, gen dịch về thùng nhỏ hơn). Cuối cùng CO THÙNG:
 * mỗi kiện thử xếp lại vào mọi thùng khác còn tồn, giữ thùng TỐT NHẤT theo
 * mục tiêu bậc (`parcelBetter`) — không theo giá thùng, vì thùng to giá rẻ
 * (hoặc chưa nhập giá) có thể làm cước tăng (audit 20/11/2026, F1).
 * Hoàn toàn xác định: cùng khóa → cùng kết quả.
 * ===================================================================
 */

export interface DecodeContext {
  units: PackingUnit[];
  /** Biến thể hợp lệ của từng món (đã lọc theo kích thước catalog). */
  variants: Variant[][];
  /** Thùng được phép, sắp thể tích lòng GIẢM dần (để mở kiện). */
  boxesBySizeDesc: BoxSpec[];
  /** Thùng được phép, sắp RẺ dần (giá, rồi thể tích ngoài) — thứ tự thử khi co thùng. */
  boxesByCostAsc: BoxSpec[];
  /** true nếu kiện `a` tốt hơn kiện `b` theo mục tiêu bậc của bộ giải (cước, giá, …). */
  parcelBetter: (a: ParcelState, b: ParcelState) => boolean;
  /** Tồn còn trống; bỏ qua = không giới hạn. */
  stock?: Map<string, number>;
  minDim: number;
}

export interface Decoded {
  parcels: ParcelState[];
  /** Chỉ số món không đặt được (không thùng còn tồn nào chứa được). */
  unplaced: number[];
}

export function nKeys(unitCount: number): number {
  return unitCount * 2 + 1;
}

/** Thứ tự đặt món theo khóa (hòa thì theo chỉ số — ổn định). */
export function orderFromKeys(keys: ArrayLike<number>, n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => (keys[a] ?? 0) - (keys[b] ?? 0) || a - b);
  return idx;
}

function fitsEmpty(v: Variant, box: BoxSpec): boolean {
  return (
    v.dx <= box.inner.length_mm &&
    v.dy <= box.inner.width_mm &&
    v.dz <= box.inner.height_mm &&
    v.unit.weight_g <= box.max_load_g
  );
}

/** Rẻ hơn: giá thấp hơn (null coi như không biết → so thể tích ngoài), rồi thể tích ngoài. */
export function cheaper(a: BoxSpec, b: BoxSpec): boolean {
  const outer = (x: BoxSpec): number =>
    x.outer.length_mm * x.outer.width_mm * x.outer.height_mm;
  if (a.price_vnd !== null && b.price_vnd !== null && a.price_vnd !== b.price_vnd)
    return a.price_vnd < b.price_vnd;
  return outer(a) < outer(b);
}

/** Xếp đúng tập món (theo thứ tự cho trước) vào 1 thùng; null nếu có món không vừa. */
export function packInto(
  box: BoxSpec,
  order: number[],
  keys: ArrayLike<number>,
  ctx: DecodeContext,
): ParcelState | null {
  const n = ctx.units.length;
  const state = new ParcelState(box, ctx.minDim);
  for (const i of order) {
    const variants = ctx.variants[i] ?? [];
    const found = state.find(variants, keys[n + i] ?? 0);
    if (!found) return null;
    state.place(found.variant, found.at, found.check, i);
  }
  return state;
}

export function decode(keys: ArrayLike<number>, ctx: DecodeContext): Decoded {
  const n = ctx.units.length;
  const order = orderFromKeys(keys, n);
  const boxGene = keys[2 * n] ?? 0;
  const used = new Map<string, number>();
  const available = (code: string): number =>
    ctx.stock ? (ctx.stock.get(code) ?? 0) - (used.get(code) ?? 0) : Number.POSITIVE_INFINITY;
  const take = (code: string, delta: number): void => {
    used.set(code, (used.get(code) ?? 0) + delta);
  };

  const parcels: ParcelState[] = [];
  const unplaced: number[] = [];

  for (const i of order) {
    const variants = ctx.variants[i] ?? [];
    const gene = keys[n + i] ?? 0;
    let placed = false;
    for (const parcel of parcels) {
      const found = parcel.find(variants, gene);
      if (found) {
        parcel.place(found.variant, found.at, found.check, i);
        placed = true;
        break;
      }
    }
    if (placed) continue;

    const candidates = ctx.boxesBySizeDesc.filter(
      (b) => available(b.code) > 0 && variants.some((v) => fitsEmpty(v, b)),
    );
    if (candidates.length === 0) {
      unplaced.push(i);
      continue;
    }
    // Gen ≈ 0 → thùng lớn nhất; gen lớn dịch dần về thùng nhỏ hơn (nửa đầu danh sách).
    const shift = Math.floor(boxGene * boxGene * candidates.length);
    const box = candidates[Math.min(candidates.length - 1, shift)];
    if (!box) {
      unplaced.push(i);
      continue;
    }
    const parcel = new ParcelState(box, ctx.minDim);
    const found = parcel.find(variants, gene);
    if (!found) {
      unplaced.push(i);
      continue;
    }
    parcel.place(found.variant, found.at, found.check, i);
    parcels.push(parcel);
    take(box.code, 1);
  }

  // Co thùng: mỗi kiện thử mọi thùng khác còn tồn, giữ kiện tốt nhất theo mục tiêu bậc.
  for (let p = 0; p < parcels.length; p += 1) {
    const current = parcels[p];
    if (!current) continue;
    // Cận dưới rẻ để bỏ thùng chắc chắn không vừa (thể tích dạng gốc ≤ dạng gập).
    const originals = current.unitIndices.map((i) => ctx.units[i]).filter((u): u is PackingUnit => u !== undefined);
    const volume = originals.reduce((s, u) => s + u.length_mm * u.width_mm * u.height_mm, 0);
    const weight = originals.reduce((s, u) => s + u.weight_g, 0);
    let best = current;
    for (const box of ctx.boxesByCostAsc) {
      if (box.code === current.box.code || available(box.code) <= 0) continue;
      const inner = box.inner.length_mm * box.inner.width_mm * box.inner.height_mm;
      if (inner < volume || box.max_load_g < weight) continue;
      const repacked = packInto(box, current.unitIndices, keys, ctx);
      if (repacked && ctx.parcelBetter(repacked, best)) best = repacked;
    }
    if (best !== current) {
      take(current.box.code, -1);
      take(best.box.code, 1);
      parcels[p] = best;
    }
  }

  return { parcels, unplaced };
}
