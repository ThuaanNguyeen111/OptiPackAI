import { Logger } from '@nestjs/common';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';
import { parseTikiTime, type TikiOrderItemRaw, type TikiOrderRaw } from '../../marketplace-integration/adapters/tiki.types';
import { OrderStatus } from '../enums/order-status.enum';
import { computeConsolidationKey } from '../utils/consolidation-key.util';
import type { MappedOrderFields } from './lazada-order.mapper';

/**
 * ===================================================================
 * "PHIÊN DỊCH" ĐƠN TIKI → HÌNH DẠNG NỘI BỘ (31/10/2026)
 * ===================================================================
 * Tiki KHÔNG tương thích vỏ Lazada nên có mapper riêng (Anti-Corruption Layer), cùng đích
 * `MappedOrderFields`. Khác Lazada: mỗi dòng có SỐ LƯỢNG thật (`invoice.quantity`).
 * - Chỉ lấy món nằm ở KHO NHÀ BÁN (`inventory_type = backorder`): món `instock` do kho Tiki
 *   tự đóng gói/giao, OptiPack không đụng. Không còn món nào → `null` (caller bỏ qua đơn).
 * - SKU = mã nhà bán (`seller_product_code`, chính là SKU OptiPack/Product Master); thiếu thì
 *   dùng SKU Tiki (`product.sku`) để không mất dòng.
 * - Trạng thái: bảng "Order Status" (doc TIKI Theory V2) → OrderStatus nội bộ; giá trị lạ → PENDING.
 * ===================================================================
 */
const logger = new Logger('TikiOrderMapper');

/** Chuỗi rỗng / toàn khoảng trắng coi như không có. */
function text(value: string | null | undefined): string | null {
  const t = value?.trim() ?? '';
  return t.length > 0 ? t : null;
}

export function mapTikiStatus(raw: string): OrderStatus {
  switch (raw) {
    case 'queueing':
    case 'holded':
      return OrderStatus.PENDING;
    case 'processing':
    case 'waiting_payment':
    case 'payment_review':
    case 'paid':
      return OrderStatus.UNPAID;
    case 'picking':
    case 'packaging':
    case 'finished_packing':
    case 'ready_to_ship':
      return OrderStatus.READY_TO_SHIP;
    case 'handover_to_partner':
    case 'shipping':
      return OrderStatus.SHIPPED;
    case 'successful_delivery':
    case 'delivered':
    case 'complete':
      return OrderStatus.DELIVERED;
    case 'canceled':
    case 'closed':
      return OrderStatus.CANCELED;
    case 'returned':
      return OrderStatus.RETURNED;
    default:
      logger.warn(`Trạng thái đơn Tiki chưa biết: "${raw}" — tạm coi là PENDING.`);
      return OrderStatus.PENDING;
  }
}

/** Món ở kho nhà bán (OptiPack xử lý). Thiếu `inventory_type` → coi là kho nhà bán (dropship). */
export function isSellerStockItem(item: TikiOrderItemRaw): boolean {
  const type = item.product.inventory_type ?? 'backorder';
  return type === 'backorder' || type === 'preorder';
}

/**
 * Shop đã báo đủ hàng chưa — đọc từ Tiki: còn món `waiting` khi đơn `queueing` → pending;
 * mọi món `seller_canceled` → canceled; món đã `seller_confirmed`/`confirmed`/`ready_to_pick` → confirmed.
 */
export function tikiConfirmationStatus(raw: TikiOrderRaw, items: TikiOrderItemRaw[]): 'pending' | 'confirmed' | 'canceled' | 'not_required' {
  const statuses = items.map((i) => i.confirmation?.status ?? null);
  if (statuses.length === 0) return 'not_required';
  if (raw.status === 'queueing' && statuses.some((s) => s === 'waiting')) return 'pending';
  if (statuses.every((s) => s === 'seller_canceled')) return 'canceled';
  if (statuses.some((s) => s === 'seller_confirmed' || s === 'confirmed' || s === 'ready_to_pick')) return 'confirmed';
  return 'not_required';
}

export function mapTikiOrder(raw: TikiOrderRaw): MappedOrderFields | null {
  const items = raw.items.filter(isSellerStockItem);
  if (items.length === 0) return null;
  const status = mapTikiStatus(raw.status);
  const address = raw.shipping?.address ?? {};
  const fullName = text(address.full_name) ?? 'Khách Tiki';
  const phone = text(address.phone);
  const street = text(address.street);
  const ward = text(address.ward);
  const district = text(address.district);
  const region = text(address.region);
  const city = ward ?? district ?? region;
  const slaTimes = items
    .map((i) => parseTikiTime(i.confirmation?.available_confirm_sla))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const mappedItems = items.map((item) => ({
    platform_order_item_id: String(item.id),
    sku: text(item.product.seller_product_code) ?? item.product.sku,
    name: item.product.name,
    quantity: Math.max(1, Math.floor(item.invoice.quantity)),
    unit_price: Math.max(0, item.invoice.price),
    status: item.confirmation?.status === 'seller_canceled' ? OrderStatus.CANCELED : status,
  }));
  const itemsTotal = mappedItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  return {
    platform_order_id: raw.code,
    platform_order_number: raw.code,
    status,
    raw_statuses: [raw.status],
    need_cancel_confirm: false,
    is_cancel_pending: false,
    cancel_trigger_time: null,
    reverse_order_id: null,
    recipient: {
      full_name: fullName,
      // 3 field bắt buộc trong schema — Tiki thiếu thì ghi "N/A" (không bỏ cả đơn).
      phone: phone ?? 'N/A',
      address_line1: street ?? city ?? 'N/A',
      city: city ?? street ?? 'N/A',
      country: 'VN',
      province_name: region,
      district_name: district,
      ward_name: ward,
    },
    consolidation_key: computeConsolidationKey(MarketplacePlatform.TIKI, phone ?? '', street ?? '', city ?? ''),
    items: mappedItems,
    total_amount: Math.max(0, raw.invoice?.grand_total ?? itemsTotal),
    currency: 'VND',
    synced_at: new Date(),
    delivery_option: 'standard',
    promised_delivery_at: null,
    marketplace_meta: {
      fulfillment_type: text(raw.fulfillment_type),
      warehouse_code: raw.tiki_warehouse?.code ?? null,
      confirmation_status: tikiConfirmationStatus(raw, items),
      confirm_sla_at: slaTimes[0] ?? null,
    },
  };
}
