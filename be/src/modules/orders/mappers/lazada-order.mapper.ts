import { Logger } from '@nestjs/common';
import { LazadaOrderRaw, LazadaOrderItemRaw } from '../../marketplace-integration/adapters/lazada.adapter';
import { OrderStatus } from '../enums/order-status.enum';
import { computeConsolidationKey } from '../utils/consolidation-key.util';

/**
 * ===================================================================
 * "PHIÊN DỊCH" ĐƠN LAZADA → HÌNH DẠNG NỘI BỘ — CÔ LẬP CHỖ CHƯA CHẮC CHẮN
 * ===================================================================
 * File này TÁCH RIÊNG khỏi orders.service.ts CÓ CHỦ ĐÍCH: đây là NƠI
 * DUY NHẤT trong module orders/ phụ thuộc vào hình dạng response thật
 * của Lazada (LazadaOrderRaw/LazadaOrderItemRaw — xem cảnh báo độ tin
 * cậy ở đầu lazada.adapter.ts). Khi test bằng access_token thật mà phát
 * hiện sai tên field, CHỈ cần sửa 2 file (interface Raw trong adapter +
 * hàm map trong file này) — service/schema/controller không đổi gì.
 * ===================================================================
 */

const logger = new Logger('LazadaOrderMapper');

/**
 * Map 1 trạng thái RAW của Lazada → OrderStatus nội bộ. KHÔNG throw khi
 * gặp giá trị lạ — 1 status Lazada thêm mới không báo trước không được
 * phép làm ĐỔ cả job polling đang xử lý hàng chục đơn khác; thay vào đó
 * log cảnh báo + rơi về PENDING (trạng thái AN TOÀN NHẤT: buộc nhân
 * viên phải xem lại tay, không tự động coi là đã xử lý xong).
 */
function mapLazadaStatus(rawStatus: string): OrderStatus {
  switch (rawStatus) {
    case 'unpaid':
      return OrderStatus.UNPAID;
    case 'pending':
      return OrderStatus.PENDING;
    case 'packed':
      return OrderStatus.PACKED;
    case 'ready_to_ship':
      return OrderStatus.READY_TO_SHIP;
    case 'shipped':
      return OrderStatus.SHIPPED;
    case 'delivered':
      return OrderStatus.DELIVERED;
    case 'canceled':
    case 'cancelled':
      return OrderStatus.CANCELED;
    case 'returned':
      return OrderStatus.RETURNED;
    case 'failed':
      return OrderStatus.FAILED;
    default:
      logger.warn(
        `Gặp raw status Lazada chưa từng biết: "${rawStatus}" — tạm map về PENDING, cần bổ sung case này vào mapLazadaStatus() sau khi xác nhận ý nghĩa thật.`,
      );
      return OrderStatus.PENDING;
  }
}

/**
 * Lazada trả price/item_price dạng STRING (vd "150000.00") — parseFloat
 * trực tiếp, KHÔNG dùng Number() (Number('') = 0 gây lỗi âm thầm, còn
 * parseFloat('') = NaN dễ phát hiện hơn qua Number.isNaN() bên dưới).
 */
function parseMoneyString(value: string, fieldName: string): number {
  const parsed = parseFloat(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Không parse được giá trị tiền tệ "${fieldName}": "${value}" không phải số hợp lệ.`);
  }

  return parsed;
}

// Hình dạng trung gian — CHƯA gắn platform/shop_id/marketplace_shop
// (3 field đó service tự gắn, vì mapper không nên biết Mongo ObjectId
// của shop nào đang gọi nó — giữ hàm map THUẦN, dễ unit test độc lập).
export interface MappedOrderFields {
  platform_order_id: string;
  platform_order_number?: string;
  status: OrderStatus;
  raw_statuses: string[];
  recipient: {
    full_name: string;
    phone: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    postal_code?: string;
    country: string;
  };
  consolidation_key: string;
  items: {
    platform_order_item_id: string;
    sku: string;
    name: string;
    variation?: string;
    quantity: number;
    unit_price: number;
    status: OrderStatus;
  }[];
  total_amount: number;
  currency: string;
  synced_at: Date;
}

export function mapLazadaOrder(raw: LazadaOrderRaw, rawItems: LazadaOrderItemRaw[]): MappedOrderFields {
  // Lazada address_shipping không có field "country" dạng tên đầy đủ ở
  // mọi trường hợp quan sát được (thường là mã 2 ký tự "VN") — fallback
  // 'VN' nếu rỗng, vì scope hiện tại 100% seller Việt Nam.
  const country = raw.address_shipping.country || 'VN';

  return {
    platform_order_id: String(raw.order_id),
    platform_order_number: raw.order_number,
    status: mapLazadaStatus(raw.statuses[0] ?? 'pending'),
    raw_statuses: raw.statuses,
    recipient: {
      full_name: `${raw.address_shipping.first_name} ${raw.address_shipping.last_name}`.trim(),
      phone: raw.address_shipping.phone,
      address_line1: raw.address_shipping.address1,
      address_line2: raw.address_shipping.address2,
      city: raw.address_shipping.city,
      postal_code: raw.address_shipping.post_code,
      country,
    },
    consolidation_key: computeConsolidationKey(
      raw.address_shipping.phone,
      raw.address_shipping.address1,
      raw.address_shipping.city,
    ),
    items: rawItems.map((item) => ({
      platform_order_item_id: String(item.order_item_id),
      sku: item.sku,
      name: item.name,
      variation: item.variation,
      // ĐÃ XÁC NHẬN qua field reference đầy đủ của Lazada GetOrderItems
      // (đối chiếu open.lazada.com + tổng hợp cộng đồng, danh sách field
      // KHÔNG hề có "quantity"/"qty" ở bất kỳ đâu): mỗi order_item_id trả
      // về từ GetOrderItems ĐÃ LÀ ĐÚNG 1 ĐƠN VỊ sản phẩm — nếu khách đặt
      // 3 cái cùng SKU, Lazada trả về 3 phần tử RIÊNG BIỆT trong mảng data
      // (3 order_item_id khác nhau, có thể có status/tracking khác nhau
      // từng cái — vd 1 cái bị seller hủy riêng, 2 cái còn lại vẫn giao).
      // → quantity=1 KHÔNG phải giá trị tạm/đoán, mà là ĐÚNG BẢN CHẤT dữ
      // liệu Lazada trả — KHÔNG được "sửa" thành gộp số lượng ở tầng này.
      // Muốn hiển thị "SKU X × 2" cho FE, dùng aggregateOrderItems() ở
      // orders/utils/aggregate-order-items.util.ts (gộp ở tầng RESPONSE,
      // không gộp ở tầng LƯU TRỮ — giữ nguyên khả năng theo dõi trạng thái
      // TỪNG ĐƠN VỊ riêng lẻ, vì Package 4 (fulfillment) sẽ cần thao tác
      // theo đúng order_item_id gốc của Lazada, không phải theo dòng đã gộp).
      quantity: 1,
      unit_price: parseMoneyString(item.item_price, `items[${item.sku}].item_price`),
      status: mapLazadaStatus(item.status),
    })),
    total_amount: parseMoneyString(raw.price, 'price'),
    currency: 'VND',
    synced_at: new Date(),
  };
}
