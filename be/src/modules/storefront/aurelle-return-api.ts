import type { MinimalCollection } from './aurelle-status-update';

/**
 * 20/10/2026 — Trả hàng do KHÁCH khởi tạo trên website AURELLE và đối tác (OptiPack)
 * xử lý qua Open API (AURELLE_MARKETPLACE_DESIGN.md mục 13 #4):
 *   GET  /rest/reverse/orders/get     — OptiPack kéo các yêu cầu trả hàng
 *   POST /rest/reverse/order/update   — OptiPack báo kết quả (duyệt/từ chối/nhận hàng/xong/hủy)
 * Hàm thuần theo giao diện collection tối thiểu (mock Open API dùng collection thô,
 * test dùng đối tượng giả). KHÔNG phát webhook ngược về OptiPack (tránh vòng lặp).
 */

export type StorefrontReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'closed' | 'canceled';

/** Trạng thái đối tác được phép báo (khách tự hủy khi còn `requested` đi đường riêng). */
export type PartnerReturnStatus = Exclude<StorefrontReturnStatus, 'requested'>;

export const PARTNER_RETURN_STATUSES: readonly PartnerReturnStatus[] = ['approved', 'rejected', 'received', 'closed', 'canceled'];

export const OPEN_STOREFRONT_RETURN_STATUSES: readonly StorefrontReturnStatus[] = ['requested', 'approved', 'received'];

/** Nhãn hiện cho khách. */
export const STOREFRONT_RETURN_LABELS: Record<StorefrontReturnStatus, string> = {
  requested: 'Đã gửi yêu cầu trả hàng',
  approved: 'Yêu cầu trả hàng đã được duyệt — vui lòng gửi hàng về',
  rejected: 'Yêu cầu trả hàng bị từ chối',
  received: 'Người bán đã nhận hàng trả, đang kiểm tra',
  closed: 'Hoàn tất xử lý trả hàng',
  canceled: 'Yêu cầu trả hàng đã được hủy',
};

export function isPartnerReturnStatus(value: unknown): value is PartnerReturnStatus {
  return typeof value === 'string' && (PARTNER_RETURN_STATUSES as readonly string[]).includes(value);
}

export const STOREFRONT_RETURN_REASONS = [
  'defective',
  'wrong_item',
  'not_as_described',
  'size_not_fit',
  'changed_mind',
  'other',
] as const;
export type StorefrontReturnReason = (typeof STOREFRONT_RETURN_REASONS)[number];

export const STOREFRONT_RETURN_REASON_LABELS: Record<StorefrontReturnReason, string> = {
  defective: 'Hàng lỗi / hư hỏng',
  wrong_item: 'Giao sai sản phẩm',
  not_as_described: 'Không đúng mô tả',
  size_not_fit: 'Không vừa size',
  changed_mind: 'Đổi ý, không muốn mua nữa',
  other: 'Lý do khác',
};

export interface StorefrontReturnLike {
  _id: { toString(): string };
  public_order_id: number | null;
  type: 'return_refund' | 'refund_only' | 'exchange';
  status: StorefrontReturnStatus;
  customer_note?: string | null;
  exchange_items?: { sku: string; quantity: number }[];
  rma_code?: string | null;
  decision_note?: string | null;
  items: { sku: string; quantity: number; reason_code: string }[];
  created_at?: Date;
  updated_at?: Date;
}

export interface OpenApiReturn {
  return_id: string;
  order_id: number;
  type: string;
  status: StorefrontReturnStatus;
  customer_note: string;
  rma_code: string | null;
  items: { seller_sku: string; quantity: number; reason_code: string }[];
  /** 21/10/2026 — chỉ có khi `type = exchange`. */
  exchange_items?: { seller_sku: string; quantity: number }[];
  created_at: string;
  updated_at: string;
}

/** Yêu cầu trả hàng của website → định dạng Open API (khuôn Lazada: id số/chuỗi, ngày ISO). */
export function toOpenApiReturn(doc: StorefrontReturnLike): OpenApiReturn {
  const created = doc.created_at ?? new Date(0);
  return {
    return_id: doc._id.toString(),
    order_id: doc.public_order_id ?? 0,
    type: doc.type,
    status: doc.status,
    customer_note: doc.customer_note ?? '',
    rma_code: doc.rma_code ?? null,
    items: doc.items.map((item) => ({
      seller_sku: item.sku,
      quantity: item.quantity,
      reason_code: item.reason_code,
    })),
    ...(doc.type === 'exchange'
      ? { exchange_items: (doc.exchange_items ?? []).map((item) => ({ seller_sku: item.sku, quantity: item.quantity })) }
      : {}),
    created_at: created.toISOString(),
    updated_at: (doc.updated_at ?? created).toISOString(),
  };
}

export interface ReturnUpdateInput {
  returnId: string;
  status: PartnerReturnStatus;
  eventTime: Date;
  rmaCode?: string | null;
  decisionNote?: string | null;
  idempotencyKey: string;
}

export interface ReturnUpdateResult {
  return_id: string;
  status: PartnerReturnStatus;
  updated_at: string;
  applied: boolean;
}

export interface ReturnUpdateCollections {
  returns: MinimalCollection;
  events: MinimalCollection;
  /** Đổi chuỗi id thành khóa của collection (collection thô cần ObjectId). Mặc định giữ nguyên. */
  castId?: (id: string) => unknown;
}

/** Trạng thái hợp lệ kế tiếp — chặn sự kiện sai thứ tự (VD `received` khi đã `closed`). */
const ALLOWED_NEXT: Partial<Record<StorefrontReturnStatus, readonly PartnerReturnStatus[]>> = {
  requested: ['approved', 'rejected', 'canceled', 'closed'], // closed: hoàn tiền không cần trả hàng
  approved: ['received', 'canceled', 'closed'],
  received: ['closed'],
  rejected: [],
  closed: [],
  canceled: [],
};

/**
 * null = không có yêu cầu trả hàng đó. Idempotent theo `idempotency_key`; sự kiện sai thứ tự
 * hoặc cũ hơn trạng thái hiện tại chỉ được ghi lịch sử, không đổi trạng thái (applied=false).
 */
export async function applyPartnerReturnUpdate(
  cols: ReturnUpdateCollections,
  input: ReturnUpdateInput,
): Promise<ReturnUpdateResult | null> {
  const doc = await cols.returns.findOne({ _id: cols.castId ? cols.castId(input.returnId) : input.returnId });
  if (!doc) return null;

  const result = (applied: boolean): ReturnUpdateResult => ({
    return_id: input.returnId,
    status: input.status,
    updated_at: new Date().toISOString(),
    applied,
  });

  const inserted = await cols.events.updateOne(
    { idempotency_key: input.idempotencyKey },
    {
      $setOnInsert: {
        order_id: doc.order_id,
        public_order_id: doc.public_order_id ?? null,
        status: `return_${input.status}`,
        label: STOREFRONT_RETURN_LABELS[input.status],
        tracking_code: null,
        trip_code: null,
        reason: input.decisionNote ?? null,
        occurred_at: input.eventTime,
        source: 'partner',
        idempotency_key: input.idempotencyKey,
        created_at: new Date(),
      },
    },
    { upsert: true },
  );
  if ((inserted.upsertedCount ?? 0) === 0) return result(false);

  const current = doc.status as StorefrontReturnStatus;
  const lastAt = doc.status_updated_at instanceof Date ? doc.status_updated_at : null;
  const outOfOrder = !(ALLOWED_NEXT[current] ?? []).includes(input.status);
  if (outOfOrder || (lastAt && input.eventTime.getTime() < lastAt.getTime())) return result(false);

  const set: Record<string, unknown> = {
    status: input.status,
    status_updated_at: input.eventTime,
    updated_at: new Date(),
  };
  if (input.rmaCode) set.rma_code = input.rmaCode;
  if (input.decisionNote) set.decision_note = input.decisionNote;
  await cols.returns.updateOne({ _id: doc._id }, { $set: set });
  return result(true);
}

// ---------------------------------------------------------------- hàng đổi (22/10/2026)

/**
 * 22/10/2026 — Hành trình giao HÀNG ĐỔI cho yêu cầu `type = exchange`. Sau khi kiểm
 * hàng khách gửi về, OptiPack tạo đơn thay thế (EXC-…) và giao như đơn thường; mỗi
 * mốc của đơn đó báo về qua `POST /rest/reverse/exchange/shipment/update`.
 */
export type ExchangeShipmentStatus = 'packed' | 'shipped' | 'delivered' | 'failed_delivery';

export const EXCHANGE_SHIPMENT_STATUSES: readonly ExchangeShipmentStatus[] = ['packed', 'shipped', 'delivered', 'failed_delivery'];

export const EXCHANGE_SHIPMENT_LABELS: Record<ExchangeShipmentStatus, string> = {
  packed: 'Hàng đổi đã đóng gói',
  shipped: 'Hàng đổi đang giao',
  delivered: 'Đã giao hàng đổi',
  failed_delivery: 'Giao hàng đổi không thành công',
};

export function isExchangeShipmentStatus(value: unknown): value is ExchangeShipmentStatus {
  return typeof value === 'string' && (EXCHANGE_SHIPMENT_STATUSES as readonly string[]).includes(value);
}

export interface ExchangeShipmentUpdateInput {
  returnId: string;
  status: ExchangeShipmentStatus;
  eventTime: Date;
  carrier?: string | null;
  trackingCode?: string | null;
  reason?: string | null;
  idempotencyKey: string;
}

export interface ExchangeShipmentUpdateResult {
  return_id: string;
  status: ExchangeShipmentStatus;
  updated_at: string;
  applied: boolean;
}

/**
 * null = không có yêu cầu đó; 'not_exchange' = yêu cầu không phải đổi hàng. Idempotent theo
 * `idempotency_key` (ghi 1 dòng lịch sử `return_exchange_<status>` — trang chi tiết yêu cầu tự
 * hiện vì cùng tiền tố `return_`). Trạng thái hiện tại (`exchange_shipment`) chỉ đổi khi sự
 * kiện không cũ hơn mốc đang có và chưa "đã giao" (giao thất bại rồi giao lại vẫn nhận).
 */
export async function applyExchangeShipmentUpdate(
  cols: ReturnUpdateCollections,
  input: ExchangeShipmentUpdateInput,
): Promise<ExchangeShipmentUpdateResult | 'not_exchange' | null> {
  const doc = await cols.returns.findOne({ _id: cols.castId ? cols.castId(input.returnId) : input.returnId });
  if (!doc) return null;
  if (doc.type !== 'exchange') return 'not_exchange';

  const result = (applied: boolean): ExchangeShipmentUpdateResult => ({
    return_id: input.returnId,
    status: input.status,
    updated_at: new Date().toISOString(),
    applied,
  });

  const inserted = await cols.events.updateOne(
    { idempotency_key: input.idempotencyKey },
    {
      $setOnInsert: {
        order_id: doc.order_id,
        public_order_id: doc.public_order_id ?? null,
        status: `return_exchange_${input.status}`,
        label: EXCHANGE_SHIPMENT_LABELS[input.status],
        tracking_code: input.trackingCode ?? null,
        trip_code: null,
        reason: input.reason ?? null,
        occurred_at: input.eventTime,
        source: 'partner',
        idempotency_key: input.idempotencyKey,
        created_at: new Date(),
      },
    },
    { upsert: true },
  );
  if ((inserted.upsertedCount ?? 0) === 0) return result(false);

  const raw: unknown = doc.exchange_shipment;
  const current = typeof raw === 'object' && raw !== null ? (raw as { status?: unknown; updated_at?: unknown }) : null;
  const lastAt = current?.updated_at instanceof Date ? current.updated_at : null;
  if (current?.status === 'delivered' || (lastAt && input.eventTime.getTime() < lastAt.getTime())) return result(false);

  await cols.returns.updateOne(
    { _id: doc._id },
    {
      $set: {
        exchange_shipment: {
          status: input.status,
          carrier: input.carrier ?? null,
          tracking_code: input.trackingCode ?? null,
          updated_at: input.eventTime,
        },
        updated_at: new Date(),
      },
    },
  );
  return result(true);
}
