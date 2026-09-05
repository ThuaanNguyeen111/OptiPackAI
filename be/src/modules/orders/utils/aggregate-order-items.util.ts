import { OrderStatus } from '../enums/order-status.enum';

/**
 * ===================================================================
 * GỘP items[] (LƯU DẠNG UNIT-LEVEL) → DÒNG HIỂN THỊ CHO FE
 * ===================================================================
 * BỐI CẢNH: `Order.items[]` trong Mongo lưu ĐÚNG như Lazada trả — MỖI
 * PHẦN TỬ LÀ 1 ĐƠN VỊ SẢN PHẨM (xem giải thích đầy đủ tại comment
 * `quantity: 1` trong lazada-order.mapper.ts). Nếu khách đặt 2 cái
 * cùng SKU, mảng lưu 2 phần tử riêng — ĐÚNG CHỦ Ý, để giữ khả năng
 * theo dõi trạng thái từng đơn vị (1 cái có thể bị seller hủy riêng
 * trong khi cái còn lại vẫn giao — Package 4/fulfillment cần thao tác
 * đúng theo `platform_order_item_id` gốc, không phải theo dòng đã gộp).
 *
 * QUYẾT ĐỊNH GỘP Ở TẦNG RESPONSE (hàm này), KHÔNG GỘP Ở TẦNG LƯU TRỮ:
 * đây là "tối ưu tốc độ truy xuất" ĐÚNG NGHĨA — không phải đơn giản hóa.
 * Chi phí gộp là O(n) trên mảng items của ĐÚNG 1 đơn (thực tế vài đến
 * vài chục phần tử) khi FE mở chi tiết 1 đơn cụ thể — rẻ hơn NHIỀU so
 * với việc mất khả năng truy vấn/thao tác theo từng đơn vị mãi mãi vì
 * đã gộp ngay lúc lưu.
 *
 * QUY TẮC GỘP: nhóm theo cặp (sku, variation) — nhưng CHỈ gộp các đơn vị
 * CÙNG status. Khác status thì tách dòng riêng (VD 2 cái "pending" + 1
 * cái "canceled" của cùng SKU → hiển thị 2 dòng riêng biệt, KHÔNG được
 * gộp chung 1 dòng rồi mất thông tin 1 cái đã bị hủy).
 * ===================================================================
 */

// Hình dạng RAW đọc từ OrderDocument.items[] (subset field cần cho việc gộp
// — cố ý không import trực tiếp OrderItem schema class ở đây để hàm này
// KHÔNG phụ thuộc Mongoose, giữ thuần TypeScript object, dễ unit test
// không cần bootstrap Mongoose/kết nối DB).
export interface RawOrderItemForAggregation {
  platform_order_item_id: string;
  sku: string;
  name: string;
  variation?: string;
  quantity: number;
  unit_price: number;
  status: OrderStatus;
}

// Hình dạng SAU KHI GỘP — trả cho FE qua GET /orders/:id.
export interface AggregatedOrderItemView {
  sku: string;
  name: string;
  variation: string | null;
  status: OrderStatus;
  quantity: number;
  unitPrice: number;
  lineTotal: number; // = quantity * unitPrice — tiện cho FE, KHÔNG lưu Mongo (tính lại mỗi lần đọc, tránh lệch dữ liệu nếu unit_price đổi)
  // Giữ NGUYÊN danh sách order_item_id gốc của Lazada trong dòng đã gộp —
  // Package 4 (fulfillment) cần giá trị này để gọi các API thao tác theo
  // từng đơn vị (VD confirm-available, get shipping label ở mục "Order API"
  // của Lazada) — KHÔNG được bỏ dữ liệu này dù đã gộp hiển thị.
  platformOrderItemIds: string[];
}

/**
 * Gộp mảng items RAW (unit-level) thành các dòng hiển thị.
 * Hàm THUẦN (pure function) — không side-effect, không gọi DB/API.
 */
export function aggregateOrderItems(
  items: RawOrderItemForAggregation[],
): AggregatedOrderItemView[] {
  // Map thay vì object thường — key có thể chứa ký tự lạ từ variation
  // (VD dấu `::` do người bán tự đặt tên biến thể), Map không có rủi ro
  // đụng property name kiểu "__proto__" như object literal.
  const groups = new Map<string, AggregatedOrderItemView>();

  for (const item of items) {
    const groupKey = `${item.sku}::${item.variation ?? ''}::${item.status}`;
    const existing = groups.get(groupKey);

    if (existing) {
      existing.quantity += item.quantity;
      existing.lineTotal += item.quantity * item.unit_price;
      existing.platformOrderItemIds.push(item.platform_order_item_id);
      continue;
    }

    groups.set(groupKey, {
      sku: item.sku,
      name: item.name,
      variation: item.variation ?? null,
      status: item.status,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.quantity * item.unit_price,
      platformOrderItemIds: [item.platform_order_item_id],
    });
  }

  return Array.from(groups.values());
}
