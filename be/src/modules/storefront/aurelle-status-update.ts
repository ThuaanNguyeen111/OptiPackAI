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

import {
  deductOrderStock,
  releaseOrderStock,
  releaseShortStock,
  restockReturnedOrder,
  type StockSettleCollections,
} from './storefront-stock.util';

export type PartnerStatus =
  // 23/10/2026 — chia nhỏ hành trình cho khách: kho bắt đầu lấy hàng; hãng đã lấy / đang giao tới khách.
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_delivery'
  | 'shipped_back'
  | 'returned'
  // 22/10/2026 — hành động của NGƯỜI BÁN (không phải mốc giao hàng):
  | 'short_shipped' // kho giao thiếu một số đơn vị (kèm items[])
  | 'canceled_by_seller'; // người bán hủy đơn trước khi giao

export const PARTNER_STATUSES: readonly PartnerStatus[] = [
  'processing',
  'packed',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'shipped_back',
  'returned',
  'short_shipped',
  'canceled_by_seller',
];

/** Nhãn tiếng Việt hiện cho khách trong hành trình đơn. */
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  processing: 'Kho đang chuẩn bị hàng',
  packed: 'Đã đóng gói',
  // 23/10/2026 — `shipped` nay chỉ là "đã tạo vận đơn, chờ hãng lấy" (trước gộp cả chặng vận chuyển).
  shipped: 'Đã tạo vận đơn — chờ đơn vị vận chuyển lấy hàng',
  in_transit: 'Đơn vị vận chuyển đã lấy hàng — đang trung chuyển',
  out_for_delivery: 'Đang giao tới bạn',
  delivered: 'Đã giao hàng',
  failed_delivery: 'Giao hàng không thành công',
  shipped_back: 'Đang hoàn trả về người bán',
  returned: 'Người bán đã nhận lại hàng',
  short_shipped: 'Người bán giao thiếu hàng',
  canceled_by_seller: 'Người bán đã hủy đơn',
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
  /** 29/10/2026 — hỏa tốc (shop tự giao): tên + SĐT shipper cho khách liên hệ. */
  shipperName?: string | null;
  shipperPhone?: string | null;
  reason?: string | null;
  idempotencyKey: string;
  /** 22/10/2026 — chỉ `short_shipped`: số đơn vị kho GIAO ĐƯỢC theo SKU (SKU không có = giao đủ). */
  items?: { sku: string; shipped_quantity: number }[];
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
  /** 22/10/2026 — dòng hàng của đơn (ghi `short_quantity` khi giao thiếu). Thiếu thì bỏ qua giao thiếu. */
  orderItems?: {
    find(filter: Doc): { toArray(): Promise<unknown[]> };
    updateOne(filter: Doc, update: Doc): Promise<unknown>;
  };
}

/** Mốc giao hàng thật (đổi `fulfillment_status`) — khác 2 hành động người bán. */
const SELLER_ACTIONS: readonly PartnerStatus[] = ['short_shipped', 'canceled_by_seller'];

/** Trạng thái nghĩa là hàng đã rời kho OptiPack — trừ hẳn phần giữ chỗ trên website. */
const LEFT_WAREHOUSE: readonly PartnerStatus[] = [
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'shipped_back',
  'returned',
];

/** 23/10/2026 — các chặng "đang đi" (hàng đã giao cho hãng, chưa tới tay khách). */
const ON_THE_WAY: readonly PartnerStatus[] = ['shipped', 'in_transit', 'out_for_delivery'];

/**
 * 23/10/2026 — `fulfillment_status` của đơn website tương ứng (enum cũ giữ nguyên để không vỡ luật
 * hủy/trả hàng): chặng vận chuyển chi tiết đều là `shipped`; `processing` không đổi trạng thái giao
 * (vẫn `awaiting_packaging` — khách còn tự hủy được). Chi tiết chặng nằm ở `tracking_stage`.
 */
function fulfillmentStatusFor(status: PartnerStatus): string | null {
  if (status === 'processing') return null;
  if (status === 'in_transit' || status === 'out_for_delivery') return 'shipped';
  return status;
}

/** Trạng thái vận đơn nội bộ của website tương ứng. */
function shipmentStatusFor(status: PartnerStatus): string | null {
  switch (status) {
    case 'shipped':
    case 'in_transit':
    case 'out_for_delivery':
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

  // 1b) 22/10/2026 — hành động người bán: hủy đơn / giao thiếu (không phải mốc giao hàng).
  if (SELLER_ACTIONS.includes(input.status)) {
    const applied = input.status === 'canceled_by_seller'
      ? await applySellerCancel(cols, order, input)
      : await applyShortShipped(cols, order, input);
    return { order_id: input.publicOrderId, status: input.status, updated_at: new Date().toISOString(), applied };
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
  const fulfillment = fulfillmentStatusFor(input.status);
  const set: Doc = {
    ...(fulfillment ? { fulfillment_status: fulfillment } : {}),
    // 23/10/2026 — chặng mới nhất cho thanh tiến trình (storefront-order-progress.ts).
    tracking_stage: input.status,
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
  // 3c) 22/10/2026 — kiện hoàn về tới kho → cộng lại tồn website phần đã trừ (đúng 1 lần).
  if (cols.stock && input.status === 'returned') {
    await restockReturnedOrder(cols.stock, order._id);
  }

  // 4) Mã vận đơn / chuyến cho khách xem (vận đơn nội bộ của website).
  if (input.trackingCode || input.shipperName || ON_THE_WAY.includes(input.status) || input.status === 'delivered') {
    const shipSet: Doc = { updated_at: new Date() };
    if (input.trackingCode) shipSet.tracking_number = input.trackingCode;
    if (input.shipperName) shipSet.shipper_name = input.shipperName;
    if (input.shipperPhone) shipSet.shipper_phone = input.shipperPhone;
    if (input.tripCode) shipSet.trip_code = input.tripCode;
    if (input.carrier) shipSet.carrier = input.carrier;
    const shipStatus = shipmentStatusFor(input.status);
    if (shipStatus) shipSet.status = shipStatus;
    if (input.status === 'delivered') shipSet.delivered_at = input.eventTime;
    // Lúc hàng bắt đầu đi = mốc "đang đi" ĐẦU TIÊN nhận được (không dùng $min: shipped_at null
    // sẵn có trong document nhỏ hơn mọi ngày theo thứ tự BSON nên $min sẽ không ghi).
    if (ON_THE_WAY.includes(input.status)) {
      const existing = await cols.shipments.findOne({ order_id: order._id });
      if (!(existing?.shipped_at instanceof Date)) shipSet.shipped_at = input.eventTime;
    }
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

/** Trạng thái giao hàng còn hủy được (hàng chưa rời kho). */
const CANCELLABLE_FULFILLMENT = ['awaiting_packaging', 'packed', null, undefined];

/**
 * 22/10/2026 — Người bán (kho OptiPack) hủy đơn: hết hàng, sai địa chỉ… Chỉ khi hàng chưa
 * rời kho. Nhả giữ chỗ tồn, ghi nguồn + lý do để khách thấy; đã thanh toán thì đánh dấu hoàn tiền.
 */
async function applySellerCancel(cols: StatusUpdateCollections, order: Doc, input: StatusUpdateInput): Promise<boolean> {
  if (order.status === 'cancelled' || !CANCELLABLE_FULFILLMENT.includes(order.fulfillment_status as string)) return false;
  const set: Doc = {
    status: 'cancelled',
    cancel_source: 'seller',
    cancel_reason: input.reason ?? 'Người bán không thể giao đơn này',
    updated_at: new Date(),
  };
  if (order.payment_status === 'paid') set.payment_status = 'refunded';
  await cols.orders.updateOne({ _id: order._id }, { $set: set });
  if (cols.stock) await releaseOrderStock(cols.stock, order._id);
  return true;
}

interface OrderLine {
  _id: unknown;
  variant_id: unknown;
  sku_snapshot: string;
  quantity: number;
  line_total: number;
  short_quantity?: number | null;
}

/**
 * 22/10/2026 — Kho giao thiếu: `items[]` = số giao được theo SKU. Ghi `short_quantity` từng dòng
 * (đặt tuyệt đối → gửi lại không cộng dồn), nhả giữ chỗ phần thiếu, tính tiền giảm trừ
 * (đơn giá thực của dòng × số thiếu). Thiếu toàn bộ → coi như người bán hủy đơn.
 */
async function applyShortShipped(cols: StatusUpdateCollections, order: Doc, input: StatusUpdateInput): Promise<boolean> {
  if (!cols.orderItems || !input.items?.length || order.status === 'cancelled') return false;
  if (!CANCELLABLE_FULFILLMENT.includes(order.fulfillment_status as string)) return false;
  const lines = (await cols.orderItems.find({ order_id: order._id }).toArray()) as OrderLine[];
  const shippedBySku = new Map(input.items.map((i) => [i.sku.trim().toUpperCase(), Math.max(0, Math.floor(i.shipped_quantity))]));
  const releases: { variant_id: unknown; units: number }[] = [];
  let shortAmount = 0;
  let allShort = true;
  for (const [sku, shippedTotal] of shippedBySku) {
    const skuLines = lines.filter((l) => l.sku_snapshot.trim().toUpperCase() === sku);
    let remainingShipped = shippedTotal;
    for (const line of skuLines) {
      const shipped = Math.min(line.quantity, remainingShipped);
      remainingShipped -= shipped;
      const short = line.quantity - shipped;
      const delta = short - (line.short_quantity ?? 0);
      if (delta !== 0) {
        await cols.orderItems.updateOne({ _id: line._id }, { $set: { short_quantity: short } });
        if (delta > 0) releases.push({ variant_id: line.variant_id, units: delta });
      }
      line.short_quantity = short;
    }
  }
  for (const line of lines) {
    const short = line.short_quantity ?? 0;
    shortAmount += Math.round((line.line_total / line.quantity) * short);
    if (short < line.quantity) allShort = false;
  }
  if (cols.stock && order.stock_state !== 'released' && releases.length > 0) {
    await releaseShortStock(cols.stock, releases);
  }
  await cols.orders.updateOne(
    { _id: order._id },
    { $set: { short_refund_amount: shortAmount, updated_at: new Date() } },
  );
  if (allShort) {
    await applySellerCancel(cols, { ...order, stock_state: 'released' }, { ...input, reason: input.reason ?? 'Kho không còn hàng cho đơn này' });
  }
  return true;
}
