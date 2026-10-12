import type {
  LazadaOrderItemRaw,
  LazadaOrderRaw,
} from '../marketplace-integration/adapters/lazada-protocol.client';

/**
 * ===================================================================
 * Chiếu dữ liệu website AURELLE sang định dạng Open API (kiểu Lazada)
 * ===================================================================
 * Từ 04/10/2026 OptiPack chỉ nhận đơn website qua Open API bằng app key
 * (không còn ghi thẳng vào `orders`). Mock `scripts/aurelle-mock-server.ts`
 * đóng vai backend Open API của AURELLE và dùng các hàm thuần ở đây để
 * đổi bản ghi `storefront_*` sang đúng hình dạng `GetOrders`/
 * `GetOrderItems`/`GetProducts` mà `AurelleAdapter` đọc.
 * ===================================================================
 */

/** Mã số đơn công khai bắt đầu từ đây. Tránh dải 710.xxx.xxx: đơn mẫu cố định cũ
 * của mock (710000017) đã nằm trong `orders` — trùng mã sẽ đè lên đơn đó. */
export const PUBLIC_ORDER_ID_START = 720_000_000;

/**
 * order_item_id = public_order_id × 1000 + số thứ tự đơn vị (1..999).
 * Lazada trả MỖI ĐƠN VỊ là 1 dòng; website lưu 1 dòng có quantity, nên
 * phải nở ra. 710_000_000 × 1000 ≈ 7,1·10¹¹ < 2⁵³ — an toàn kiểu number.
 */
export const ORDER_ITEM_ID_MULTIPLIER = 1000;
export const MAX_UNITS_PER_ORDER = ORDER_ITEM_ID_MULTIPLIER - 1;

/** Shop/seller duy nhất của website trên Open API (khớp mock). */
export const DEFAULT_AURELLE_SELLER_ID = '200000000101';

export interface StorefrontAddressLike {
  recipient_name: string;
  phone: string;
  province: string;
  district?: string;
  ward: string;
  address_line: string;
}

export interface StorefrontOrderLike {
  public_order_id: number;
  order_number: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  total_amount: number;
  shipping_address_snapshot: StorefrontAddressLike;
  customer_note?: string;
  placed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface StorefrontOrderItemLike {
  sku_snapshot: string;
  product_name_snapshot: string;
  variant_snapshot: string;
  unit_price: number;
  quantity: number;
  discount_amount: number;
  line_total: number;
}

export interface StorefrontVariantLike {
  _id: { toString(): string };
  product_id: { toString(): string };
  sku: string;
  price: number;
  color: string | null;
  size: string | null;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  is_active: boolean;
}

export interface StorefrontProductLike {
  _id: { toString(): string };
  name: string;
  brand: string;
  status: string;
}

export interface OpenApiProductSku {
  SkuId: string;
  SellerSku: string;
  ShopSku: string;
  Status: 'active' | 'inactive';
  price: string;
  quantity: number;
  sellableQuantity: number;
  package_length?: string;
  package_width?: string;
  package_height?: string;
  package_weight?: string;
  color_family?: string;
  size?: string;
}

export interface OpenApiProduct {
  item_id: string;
  status: 'live' | 'inactive';
  attributes: { name: string; brand: string };
  skus: OpenApiProductSku[];
}

function money(value: number): string {
  return value.toFixed(2);
}

/** Trạng thái website → trạng thái kiểu Lazada (đúng tập `mapLazadaStatus`). */
export function toOpenApiStatus(order: Pick<StorefrontOrderLike, 'status' | 'payment_status' | 'fulfillment_status'>): string {
  if (order.status === 'cancelled' || order.payment_status === 'refunded') return 'canceled';
  if (order.payment_status === 'failed') return 'failed';
  switch (order.fulfillment_status) {
    case 'packed':
      return 'packed';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'returned':
      return 'returned';
    default:
      // COD chưa thu tiền vẫn là đơn hợp lệ cần xử lý → 'pending' như Lazada.
      return 'pending';
  }
}

function iso(date: Date | null | undefined, fallback: Date): string {
  return (date ?? fallback).toISOString();
}

export function toOpenApiOrder(order: StorefrontOrderLike, itemCount: number): LazadaOrderRaw {
  const address = order.shipping_address_snapshot;
  const createdAt = order.placed_at ?? order.created_at ?? new Date(0);
  const status = toOpenApiStatus(order);
  return {
    order_id: order.public_order_id,
    order_number: order.order_number,
    statuses: [status],
    created_at: iso(createdAt, createdAt),
    updated_at: iso(order.updated_at, createdAt),
    price: money(order.total_amount),
    items_count: itemCount,
    payment_method: 'COD',
    remarks: order.customer_note ?? '',
    address_shipping: {
      first_name: address.recipient_name,
      last_name: '',
      phone: address.phone,
      // address1 = số nhà/đường + phường: cùng khách gõ lại vẫn ra cùng chuỗi,
      // dùng làm khóa gộp đơn (consolidation_key) ở OptiPack.
      address1: [address.address_line, address.ward].filter(Boolean).join(', '),
      address3: address.province,
      address4: address.district ?? '',
      address5: address.ward,
      city: address.province,
      country: 'Vietnam',
      post_code: '',
    },
    need_cancel_confirm: 'false',
    is_cancel_pending: 'false',
  };
}

/**
 * Nở dòng hàng có quantity thành từng đơn vị (Lazada: 1 order_item_id = 1
 * đơn vị). Giá mỗi đơn vị = giá dòng chia đều (giảm giá chia đều theo đơn vị).
 */
export function toOpenApiOrderItems(
  order: Pick<StorefrontOrderLike, 'public_order_id' | 'status' | 'payment_status' | 'fulfillment_status'>,
  items: StorefrontOrderItemLike[],
): LazadaOrderItemRaw[] {
  const status = toOpenApiStatus(order);
  const units: LazadaOrderItemRaw[] = [];
  for (const item of items) {
    const paidPerUnit = item.quantity > 0 ? item.line_total / item.quantity : item.unit_price;
    for (let i = 0; i < item.quantity; i += 1) {
      if (units.length >= MAX_UNITS_PER_ORDER) {
        throw new Error(
          `Đơn ${String(order.public_order_id)} vượt ${String(MAX_UNITS_PER_ORDER)} đơn vị — không cấp được order_item_id.`,
        );
      }
      units.push({
        order_item_id: order.public_order_id * ORDER_ITEM_ID_MULTIPLIER + units.length + 1,
        order_id: order.public_order_id,
        sku: item.sku_snapshot,
        name: item.product_name_snapshot,
        variation: item.variant_snapshot,
        item_price: money(item.unit_price),
        paid_price: money(paidPerUnit),
        status,
        shipping_type: 'Seller Own Fleet',
        tracking_code: '',
        package_id: '',
      });
    }
  }
  return units;
}

function cm(value: number | null): string | undefined {
  return value !== null && value > 0 ? String(value) : undefined;
}

/**
 * Sản phẩm + biến thể website → định dạng `GetProducts`. Số đo khai báo
 * (cm/kg) chỉ là `marketplace_dimension` — OptiPack vẫn bắt kho đo lại.
 */
export function toOpenApiProducts(
  products: StorefrontProductLike[],
  variants: StorefrontVariantLike[],
  sellableByVariantId: Map<string, number>,
  onHandByVariantId: Map<string, number>,
): OpenApiProduct[] {
  const byProduct = new Map<string, StorefrontVariantLike[]>();
  for (const variant of variants) {
    const key = variant.product_id.toString();
    const list = byProduct.get(key) ?? [];
    list.push(variant);
    byProduct.set(key, list);
  }
  return products
    .filter((product) => byProduct.has(product._id.toString()))
    .map((product) => ({
      item_id: product._id.toString(),
      status: product.status === 'active' ? 'live' : 'inactive',
      attributes: { name: product.name, brand: product.brand || 'AURELLE' },
      skus: (byProduct.get(product._id.toString()) ?? []).map((variant) => {
        const variantId = variant._id.toString();
        return {
          SkuId: variantId,
          SellerSku: variant.sku,
          ShopSku: `${product._id.toString()}_${variant.sku}`,
          Status: variant.is_active ? 'active' : 'inactive',
          price: money(variant.price),
          quantity: onHandByVariantId.get(variantId) ?? 0,
          sellableQuantity: Math.max(0, sellableByVariantId.get(variantId) ?? 0),
          package_length: cm(variant.length_cm),
          package_width: cm(variant.width_cm),
          package_height: cm(variant.height_cm),
          package_weight: cm(variant.weight_kg),
          color_family: variant.color ?? undefined,
          size: variant.size ?? undefined,
        } satisfies OpenApiProductSku;
      }),
    }));
}
