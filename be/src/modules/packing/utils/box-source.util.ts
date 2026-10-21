import { isLiveParcel } from './parcels.util';
import type { PlanParcel } from '../schemas/packing-plan.schema';

/**
 * ===================================================================
 * Nguồn thùng của từng kiện (21/10/2026)
 * ===================================================================
 * Kho thùng có 2 ngăn giao hàng được: MỚI (`qty_new`) và TÁI SỬ DỤNG hạng A
 * (`qty_reused`, thu hồi từ hàng hoàn). Lúc niêm phong hệ thống tự lấy tái sử
 * dụng trước (tiết kiệm), trừ khi kiện có hàng dễ vỡ mà cài đặt không cho.
 * Hàm thuần dưới đây MÔ PHỎNG đúng luật đó cho các kiện CHƯA trừ thùng — theo
 * thứ tự kiện, trừ dần tồn giả lập — để nhân viên biết trước phải ra kệ nào
 * lấy thùng, và để kiểm tra lựa chọn "dùng thùng mới thay" có khác gợi ý không.
 * Hạng B (nội bộ) không bao giờ dùng để giao hàng nên không có ở đây.
 * ===================================================================
 */

export type BoxSource = 'new' | 'reused';

/** Vì sao gợi ý thùng MỚI dù hệ thống ưu tiên tái sử dụng. */
export type ForcedNewReason = 'FRAGILE' | 'NOT_REUSABLE' | 'NO_REUSED_STOCK';

export interface BoxStock {
  qtyNew: number;
  qtyReused: number;
  reusable: boolean;
}

export type BoxSourceState = 'to_consume' | 'consumed' | 'inactive';

export interface BoxSourcePlan {
  parcelNo: number;
  boxCode: string;
  /** to_consume = niêm phong sẽ trừ thùng; consumed = đã trừ; inactive = kiện đã hủy/phải tháo. */
  state: BoxSourceState;
  /** Kiện được phép dùng thùng tái sử dụng (luật hàng dễ vỡ). */
  reusedAllowed: boolean;
  /** Nguồn hệ thống sẽ lấy nếu niêm phong ngay (chỉ khi to_consume và còn hàng). */
  planned: BoxSource | null;
  forcedNewReason: ForcedNewReason | null;
  /** to_consume mà cả 2 ngăn đều không đủ cho kiện này. */
  outOfStock: boolean;
  /** Nguồn THẬT đã lấy (consumed). */
  used: BoxSource | null;
}

type ParcelInput = Pick<PlanParcel, 'parcel_no' | 'status' | 'has_fragile' | 'box_consumed'> & {
  box: Pick<PlanParcel['box'], 'code'>;
  box_source_used?: BoxSource | null;
};

export function reusedAllowedFor(parcel: Pick<PlanParcel, 'has_fragile'>, allowReusedForFragile: boolean): boolean {
  return !(parcel.has_fragile && !allowReusedForFragile);
}

export function planBoxSources(
  parcels: ParcelInput[],
  stock: ReadonlyMap<string, BoxStock>,
  allowReusedForFragile: boolean,
): BoxSourcePlan[] {
  const left = new Map([...stock].map(([code, s]) => [code, { qtyNew: s.qtyNew, qtyReused: s.qtyReused }]));
  return [...parcels]
    .sort((a, b) => a.parcel_no - b.parcel_no)
    .map((p): BoxSourcePlan => {
      const reusedAllowed = reusedAllowedFor(p, allowReusedForFragile);
      const base = {
        parcelNo: p.parcel_no,
        boxCode: p.box.code,
        reusedAllowed,
        planned: null,
        forcedNewReason: null,
        outOfStock: false,
        used: p.box_source_used ?? null,
      };
      if (!isLiveParcel(p)) return { ...base, state: 'inactive' };
      if (p.box_consumed) return { ...base, state: 'consumed' };
      const s = stock.get(p.box.code);
      const pool = left.get(p.box.code);
      if (!s || !pool) return { ...base, state: 'to_consume', outOfStock: true };
      if (s.reusable && reusedAllowed && pool.qtyReused > 0) {
        pool.qtyReused -= 1;
        return { ...base, state: 'to_consume', planned: 'reused' };
      }
      const forcedNewReason: ForcedNewReason = !reusedAllowed ? 'FRAGILE' : !s.reusable ? 'NOT_REUSABLE' : 'NO_REUSED_STOCK';
      if (pool.qtyNew > 0) {
        pool.qtyNew -= 1;
        return { ...base, state: 'to_consume', planned: 'new', forcedNewReason };
      }
      return { ...base, state: 'to_consume', forcedNewReason, outOfStock: true };
    });
}
