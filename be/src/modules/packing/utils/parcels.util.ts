import type { Types } from 'mongoose';
import {
  INACTIVE_PARCEL_STATUSES,
  type ParcelStatus,
  type PlanParcel,
} from '../schemas/packing-plan.schema';

/** Kiểu "đối tượng thuần" của 1 class schema — để sao chép/ghi đè field mà không mang prototype class. */
export type Plain<T> = { [K in keyof T]: T[K] };

/**
 * HỢP ĐỒNG DUY NHẤT cho module khác (shipping, documents) đọc kiện của 1 nhóm.
 * Không tự đọc field bên trong `packing_plans` ở nơi khác — đổi mô hình chỉ
 * cần sửa ở đây.
 */
export interface ParcelView {
  parcelNo: number;
  orderId: string;
  platformOrderId: string | null;
  /** Thứ tự kiện trong CÙNG đơn (0, 1, …). */
  indexInOrder: number;
  boxCode: string;
  boxName: string;
  outerMm: { length_mm: number; width_mm: number; height_mm: number };
  estimatedWeightG: number;
  actualWeightKg: number | null;
  shippingCostVnd: number | null;
}

/** Trường phiên đóng gói của 1 kiện MỚI (chưa quét, chưa niêm phong). */
export function freshParcelSession(hasFragile: boolean): Pick<
  PlanParcel,
  'status' | 'has_fragile' | 'scans' | 'box_consumed' | 'sealed_by' | 'sealed_at' | 'weighings' | 'reviews' | 'unpack'
> {
  return {
    status: 'pending',
    has_fragile: hasFragile,
    scans: [],
    box_consumed: false,
    sealed_by: null,
    sealed_at: null,
    weighings: [],
    reviews: [],
    unpack: null,
  };
}

/**
 * Trạng thái THẬT của kiện. Kế hoạch đã `packed` trước 05/10/2026 không có
 * trường `status` (Mongoose điền mặc định `pending`) → coi là đã niêm phong.
 */
export function effectiveParcelStatus(planStatus: string, parcel: Pick<PlanParcel, 'status' | 'sealed_at'>): ParcelStatus {
  if (planStatus === 'packed' && parcel.status === 'pending' && parcel.sealed_at === null) return 'sealed';
  return parcel.status;
}

/** Kiện còn đi giao (không phải đang/đã tháo). */
export function isLiveParcel(parcel: Pick<PlanParcel, 'status'>): boolean {
  return !INACTIVE_PARCEL_STATUSES.includes(parcel.status);
}

export function parcelsOfPlan(plan: { parcels: PlanParcel[] }): ParcelView[] {
  const seenPerOrder = new Map<string, number>();
  // Kiện đang/đã tháo (đơn bị hủy sau khi đóng) không còn là kiện để giao/in nhãn.
  return [...plan.parcels]
    .filter(isLiveParcel)
    .sort((a, b) => a.parcel_no - b.parcel_no)
    .map((p) => {
      const orderId = p.order_id.toString();
      const indexInOrder = seenPerOrder.get(orderId) ?? 0;
      seenPerOrder.set(orderId, indexInOrder + 1);
      return {
        parcelNo: p.parcel_no,
        orderId,
        platformOrderId: p.platform_order_id,
        indexInOrder,
        boxCode: p.box.code,
        boxName: p.box.name,
        outerMm: {
          length_mm: p.box.outer_mm.length_mm,
          width_mm: p.box.outer_mm.width_mm,
          height_mm: p.box.outer_mm.height_mm,
        },
        estimatedWeightG: p.estimated_weight_g,
        actualWeightKg: p.actual_weight_kg,
        shippingCostVnd: p.shipping_cost_vnd,
      };
    });
}

/**
 * Đánh lại số kiện 1..N: theo thứ tự đơn (như `orderIds`), trong mỗi đơn giữ
 * thứ tự cũ. Gọi sau mọi thao tác thêm/bớt/đổi kiện.
 */
export function renumberParcels(parcels: PlanParcel[], orderIds: Types.ObjectId[]): PlanParcel[] {
  const rank = new Map(orderIds.map((id, i) => [id.toString(), i]));
  return [...parcels]
    .sort(
      (a, b) =>
        (rank.get(a.order_id.toString()) ?? 0) - (rank.get(b.order_id.toString()) ?? 0) ||
        a.parcel_no - b.parcel_no,
    )
    .map((p, i) => ({ ...(p as Plain<PlanParcel>), parcel_no: i + 1 }));
}
