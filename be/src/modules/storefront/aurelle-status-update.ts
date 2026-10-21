/**
 * 20/10/2026 — Phía AURELLE nhận cập nhật trạng thái đơn từ đối tác (OptiPack)
 * qua `POST /order/status/update` (AURELLE_MARKETPLACE_DESIGN.md mục 7.8).
 *
 * Hàm thuần theo giao diện collection tối thiểu để dùng chung cho mock Open API
 * (collection thô của MongoDB) và để test bằng đối tượng giả. Quy tắc:
 *  - Idempotent theo `idempotency_key`: gửi lại cùng khóa → trả kết quả cũ, không ghi gì thêm.
 *  - Sự kiện CŨ hơn trạng thái đã ghi (event_time nhỏ hơn) vẫn được lưu vào lịch sử nhưng
 *    không kéo trạng thái đơn lùi lại.
 *  - Đơn đã hủy không đổi trạng thái giao hàng nữa.
 *  - KHÔNG phát webhook ngược về OptiPack (tránh vòng lặp — mục 8.1).
 */

import { deductOrderStock, type StockSettleCollections } from './storefront-stock.util';

export type PartnerStatus =
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'failed_delivery'
  | 'shipped_back'
  | 'returned';

export const PARTNER_STATUSES: readonly PartnerStatus[] = [
  'packed',
  'shipped',
  'delivered',
  'failed_delivery',
  'shipped_back',
  'returned',
];

/** Nhãn tiếng Việt hiện cho khách trong hành trình đơn. */
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  packed: 'Đã đóng gói',
  shipped: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  failed_delivery: 'Giao hàng không thành công',
  shipped_back: 'Đang hoàn trả về người bán',
  returned: 'Người bán đã nhận lại hàng',
};

export function isPartnerStatus(value: unknown): value is PartnerStatus {
  return typeof value === 'string' && (PARTNER_STATUSES as readonly string[]).includes(value);
}

export interface StatusUpdateInput {
  publicOrderId: number;
  status: PartnerStatus;
  eventTime: Date;
  trackingCode?: string | null;
  tripCode?: string | null;
  /** (21/10/2026) Tên hãng vận chuyển (GHN...) — trước đây website luôn ghi "OptiPack". */
  carrier?: string | null;
  reason?: string | null;
  idempotencyKey: string;
}

export interface StatusUpdateResult {
  order_id: number;
  status: PartnerStatus;
  updated_at: string;
  /** false khi sự kiện bị bỏ qua (cũ hơn trạng thái hiện tại / đơn đã hủy) hoặc là lần gửi lại. */
  applied: boolean;
}

type Doc = Record<string, unknown>;

export interface MinimalCollection {
  findOne(filter: Doc): Promise<Doc | null>;
  updateOne(
    filter: Doc,
    update: Doc,
    options?: { upsert?: boolean },
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount?: number }>;
}

export interface StatusUpdateCollections {
  orders: MinimalCollection;
  shipments: MinimalCollection;
  events: MinimalCollection;
  /** (21/10/2026) Có thì trừ giữ chỗ tồn website khi hàng rời kho; thiếu (test cũ) thì bỏ qua. */
  stock?: StockSettleCollections;
}

/** Trạng thái nghĩa là hàng đã rời kho OptiPack — trừ hẳn phần giữ chỗ trên website. */
const LEFT_WAREHOUSE: readonly PartnerStatus[] = ['shipped', 'delivered', 'failed_delivery', 'shipped_back', 'returned'];

/** Trạng thái vận đơn nội bộ của website tương ứng. */
function shipmentStatusFor(status: PartnerStatus): string | null {
  switch (status) {
    case 'shipped':
      return 'in_transit';
    case 'delivered':
      return 'delivered';
    case 'returned':
    case 'shipped_back':
      return 'returned';
    default:
      return null;
  }
}

/** null khi không tìm thấy đơn. */
export async function applyPartnerStatusUpdate(
  cols: StatusUpdateCollections,
  input: StatusUpdateInput,
): Promise<StatusUpdateResult | null> {
  const order = await cols.orders.findOne({ public_order_id: input.publicOrderId });
  if (!order) return null;

  // 1) Ghi lịch sử (idempotent). Đã có khóa này → lần gửi lại, không làm gì thêm.
  const inserted = await cols.events.updateOne(
    { idempotency_key: input.idempotencyKey },
    {
      $setOnInsert: {
        order_id: order._id,
        public_order_id: input.publicOrderId,
        status: input.status,
        label: PARTNER_STATUS_LABELS[input.status],
        tracking_code: input.trackingCode ?? null,
        trip_code: input.tripCode ?? null,
        reason: input.reason ?? null,
        occurred_at: input.eventTime,
        source: 'partner',
        idempotency_key: input.idempotencyKey,
        created_at: new Date(),
      },
    },
    { upsert: true },
  );
  if ((inserted.upsertedCount ?? 0) === 0) {
    return {
      order_id: input.publicOrderId,
      status: input.status,
      updated_at: new Date().toISOString(),
      applied: false,
    };
  }

  // 2) Đơn đã hủy / sự kiện cũ hơn trạng thái đã ghi → chỉ giữ lịch sử.
  const lastAt = order.fulfillment_updated_at instanceof Date ? order.fulfillment_updated_at : null;
  const cancelled = order.status === 'cancelled';
  if (cancelled || (lastAt && input.eventTime.getTime() < lastAt.getTime())) {
    return {
      order_id: input.publicOrderId,
      status: input.status,
      updated_at: new Date().toISOString(),
      applied: false,
    };
  }

  // 3) Cập nhật đơn. Giao thành công = COD đã thu tiền → hoàn tất đơn.
  const set: Doc = {
    fulfillment_status: input.status,
    fulfillment_updated_at: input.eventTime,
    updated_at: new Date(),
  };
  if (input.status === 'delivered') {
    set.status = 'completed';
    set.payment_status = 'paid';
  }
  await cols.orders.updateOne({ _id: order._id }, { $set: set });

  // 3b) (21/10/2026) Hàng đã rời kho → trừ hẳn giữ chỗ tồn (đúng 1 lần, xem storefront-stock.util.ts).
  if (cols.stock && LEFT_WAREHOUSE.includes(input.status)) {
    await deductOrderStock(cols.stock, order._id);
  }

  // 4) Mã vận đơn / chuyến cho khách xem (vận đơn nội bộ của website).
  if (input.trackingCode || input.status === 'shipped' || input.status === 'delivered') {
    const shipSet: Doc = { updated_at: new Date() };
    if (input.trackingCode) shipSet.tracking_number = input.trackingCode;
    if (input.tripCode) shipSet.trip_code = input.tripCode;
    if (input.carrier) shipSet.carrier = input.carrier;
    const shipStatus = shipmentStatusFor(input.status);
    if (shipStatus) shipSet.status = shipStatus;
    if (input.status === 'shipped') shipSet.shipped_at = input.eventTime;
    if (input.status === 'delivered') shipSet.delivered_at = input.eventTime;
    await cols.shipments.updateOne(
      { order_id: order._id },
      {
        $set: shipSet,
        $setOnInsert: {
          order_id: order._id,
          // Không có tên hãng (tự giao / bản gửi cũ) → "OptiPack". Có thì nằm ở $set
          // (một field không được vừa $set vừa $setOnInsert).
          ...(input.carrier ? {} : { carrier: 'OptiPack' }),
          recipient_snapshot: order.shipping_address_snapshot ?? {},
          created_at: new Date(),
        },
      },
      { upsert: true },
    );
  }

  return {
    order_id: input.publicOrderId,
    status: input.status,
    updated_at: new Date().toISOString(),
    applied: true,
  };
}
