import { Types } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';
import type { PackingUnit } from '../../packaging/engine/types';
import type { PlanParcel } from '../schemas/packing-plan.schema';

/**
 * ===================================================================
 * Kiện gộp nhiều đơn (AOFP-224, 31/10/2026) — hàm thuần
 * ===================================================================
 * PACKAGING_STANDARD §8: đơn AURELLE cùng người nhận (cùng `consolidation_key`)
 * trong 1 nhóm được giải CHUNG một bài đóng gói — 1 kiện có thể chứa hàng của
 * nhiều đơn. Lazada giữ mỗi đơn 1 kiện (mã vận đơn do sàn quản lý từng đơn).
 *
 * Mã món `${sku}#n` chỉ duy nhất TRONG 1 đơn; trong bài gộp mọi mã món được
 * thêm tiền tố mã đơn sàn: `${platform_order_id}/${sku}#n` để 2 đơn cùng SKU
 * không trùng mã (quét, chuyển món, tháo kiện dựa vào mã món).
 * ===================================================================
 */

export const SHARED_KEY_SEPARATOR = '/';

export function sharedItemKey(platformOrderId: string, itemKey: string): string {
  return `${platformOrderId}${SHARED_KEY_SEPARATOR}${itemKey}`;
}

/** Thêm tiền tố mã đơn vào mã món (bài gộp nhiều đơn). */
export function prefixUnits(units: PackingUnit[], platformOrderId: string): PackingUnit[] {
  return units.map((u) => ({ ...u, item_key: sharedItemKey(platformOrderId, u.item_key) }));
}

/** Mọi đơn có hàng trong kiện; dữ liệu cũ (order_ids rỗng) = [order_id]. */
export function orderIdsOf(parcel: Pick<PlanParcel, 'order_id' | 'order_ids'>): Types.ObjectId[] {
  return parcel.order_ids && parcel.order_ids.length > 0 ? parcel.order_ids : [parcel.order_id];
}

export function parcelHasOrder(parcel: Pick<PlanParcel, 'order_id' | 'order_ids'>, orderId: string): boolean {
  return orderIdsOf(parcel).some((id) => id.toString() === orderId);
}

export interface BucketableAllocation {
  order_id: string;
  consolidation_key?: string | null;
}

/**
 * Chia các đơn của nhóm thành "bài giải": đơn AURELLE cùng khóa gộp (khác null) vào
 * chung 1 bài, còn lại mỗi đơn 1 bài. Giữ thứ tự đơn (sớm trước) — đơn đầu bài là đơn chủ.
 */
export function bucketAllocations<A extends BucketableAllocation>(allocations: A[], platform: string): A[][] {
  if (platform !== (MarketplacePlatform.AURELLE as string)) return allocations.map((a) => [a]);
  const buckets: A[][] = [];
  const byKey = new Map<string, A[]>();
  for (const a of allocations) {
    const key = a.consolidation_key ?? null;
    if (key === null) {
      buckets.push([a]);
      continue;
    }
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(a);
      continue;
    }
    const fresh = [a];
    byKey.set(key, fresh);
    buckets.push(fresh);
  }
  return buckets;
}

/**
 * Dựng lại món đúng dạng của 1 kiện từ món đã lấy của các đơn trong kiện. Kiện gộp
 * có mã món mang tiền tố; kiện 1 đơn có thể mang mã thường (bài 1 đơn) hoặc mã tiền
 * tố (bài gộp nhưng kiện chỉ có hàng 1 đơn) — thử cả hai, lọc đúng mã của kiện.
 */
export function unitsOfParcelFrom(
  parcel: Pick<PlanParcel, 'order_id' | 'order_ids' | 'placements'>,
  allocations: { order_id: string; platform_order_id: string; units: PackingUnit[] }[],
): PackingUnit[] {
  const keys = new Set(parcel.placements.map((p) => p.item_key));
  const ids = orderIdsOf(parcel).map((id) => id.toString());
  const shared = ids.length > 1;
  const out: PackingUnit[] = [];
  for (const a of allocations) {
    if (!ids.includes(a.order_id)) continue;
    const candidates = shared ? prefixUnits(a.units, a.platform_order_id) : [...a.units, ...prefixUnits(a.units, a.platform_order_id)];
    for (const u of candidates) if (keys.has(u.item_key)) out.push(u);
  }
  return out;
}
