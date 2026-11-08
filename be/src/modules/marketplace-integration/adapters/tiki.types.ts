/**
 * ===================================================================
 * Hình dạng response THẬT của Tiki Open API (đọc doc open.tiki.vn + gọi thử 31/10/2026 trên shop
 * OptiPackAI Test Shop, seller 365980). Chỉ khai các field OptiPack dùng — Tiki trả thêm field khác.
 * Riêng cho Tiki (KHÔNG ép vào kiểu LazadaXxxRaw — Anti-Corruption Layer: mapper riêng
 * `orders/mappers/tiki-order.mapper.ts` đổi sang MappedOrderFields chung).
 * ===================================================================
 */

/** POST /sc/oauth2/token (client_credentials). Gọi thử: expires_in = 1295999 (15 ngày), scope "", không refresh_token. */
export interface TikiTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

/** GET /integration/v2/sellers/me */
export interface TikiSellerRaw {
  id: number;
  name: string;
  active: number;
  operation_models?: string[];
  registration_status?: string;
}

export interface TikiAddressPart {
  name: string;
  code?: string;
}

/** GET /integration/v2/seller-inventories?tiki_warehouse_codes= */
export interface TikiSellerInventoriesRaw {
  seller_inventories: { id: number; name: string; status: number; type: string }[];
  mappings: { tiki_warehouse_code: string; seller_inventory_ids: number[] }[];
}

export interface TikiOrderItemRaw {
  id: number;
  product: {
    id?: number;
    sku: string;
    name: string;
    seller_product_code?: string | null;
    inventory_type?: string | null;
    thumbnail?: string | null;
  };
  invoice: {
    price: number;
    quantity: number;
    row_total?: number;
  };
  confirmation?: {
    status?: string | null;
    available_confirm_sla?: string | null;
    pickup_confirm_sla?: string | null;
    confirmed_at?: string | null;
  } | null;
}

/** Order v2 (GET /integration/v2/orders, /orders/{code}). Timestamp dạng `yyyy-MM-dd HH:mm:ss` giờ VN. */
export interface TikiOrderRaw {
  code: string;
  fulfillment_type: string;
  status: string;
  is_rma?: boolean;
  created_at: string;
  updated_at?: string;
  invoice?: {
    grand_total?: number;
    subtotal?: number;
    collectible_amount?: number;
    items_quantity?: number;
  } | null;
  tiki_warehouse?: { id?: number; code?: string | null; name?: string | null } | null;
  items: TikiOrderItemRaw[];
  shipping?: {
    address?: {
      full_name?: string | null;
      street?: string | null;
      ward?: string | null;
      district?: string | null;
      region?: string | null;
      country?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  cancel_info?: { reason?: string | null } | null;
}

export interface TikiPaging {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
}

export interface TikiOrderListRaw {
  data: TikiOrderRaw[];
  paging: TikiPaging;
}

/** Event queue (v1). Sự kiện đơn: payload `{ order_code, status }`. */
export interface TikiEventRaw {
  id: string;
  sid?: string;
  created_at: number;
  type: string;
  version?: string;
  payload: { order_code?: string; status?: string } & Record<string, unknown>;
}

export interface TikiPullResult {
  events: TikiEventRaw[] | null;
  ack_id: string | null;
}

export interface TikiQueueRaw {
  code: string;
  name: string;
  status?: string;
}

export interface TikiSubscriptionRaw {
  code: string;
  event_type: string;
  active: boolean;
}

/** GET /integration/v2/orders/{code}/dropship/labels?format=html */
export interface TikiDropshipLabelsRaw {
  shipping_label_url?: string | null;
  shipping_stamp_url?: string | null;
}

/** Sự kiện đơn OptiPack đăng ký (doc "Event type" — order v1, chạy được với order v2). */
export const TIKI_ORDER_EVENT_TYPES = ['ORDER_CREATED_SUCCESSFULLY', 'ORDER_STATUS_UPDATED'] as const;

/**
 * Trạng thái đơn Tiki CHƯA được Tiki nhận (doc "Get list orders": loại trừ để danh sách nhanh hơn,
 * đơn chưa tới tay nhà bán). OptiPack không nhận đơn mới ở các trạng thái này.
 */
export const TIKI_NOT_ACCEPTED_STATUSES = ['processing', 'waiting_payment', 'paid', 'payment_review'] as const;

/** `yyyy-MM-dd HH:mm:ss` giờ VN → Date. Sai định dạng → null. */
export function parseTikiTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [, day = '', hm = '', sec = '00'] = m;
  const d = new Date(`${day}T${hm}:${sec}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → `yyyy-MM-dd HH:mm:ss` giờ VN (tham số lọc của Tiki). */
export function formatTikiTime(at: Date): string {
  const vn = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(vn.getUTCFullYear())}-${p(vn.getUTCMonth() + 1)}-${p(vn.getUTCDate())} ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}:${p(vn.getUTCSeconds())}`;
}
