import {
  mapLazadaStatus,
  pickRepresentativeStatus,
} from './lazada-order.mapper';
import { OrderStatus } from '../enums/order-status.enum';

//!=============================================
// FIX (AOFP-XX, 2026-09-15):
// 1. mapLazadaStatus() thiếu 10/19 case thật (O4) — trước đây rơi
//    default -> PENDING, che giấu sự cố logistics thật.
// 2. Status đại diện cho Order lấy mù statuses[0] (O5) — giờ ưu tiên
//    trạng thái "xấu nhất" khi đơn có nhiều giá trị khác nhau.
//!=============================================
describe('lazada-order.mapper — mapLazadaStatus (đủ 19 giá trị)', () => {
  it.each([
    ['unpaid', OrderStatus.UNPAID],
    ['pending', OrderStatus.PENDING],
    ['packed', OrderStatus.PACKED],
    ['ready_to_ship', OrderStatus.READY_TO_SHIP],
    ['shipped', OrderStatus.SHIPPED],
    ['delivered', OrderStatus.DELIVERED],
    ['canceled', OrderStatus.CANCELED],
    ['cancelled', OrderStatus.CANCELED],
    ['returned', OrderStatus.RETURNED],
    ['failed', OrderStatus.FAILED],
    // 10 giá trị mới — trước fix này đều rơi vào default -> PENDING.
    ['topack', OrderStatus.TO_PACK],
    ['toship', OrderStatus.TO_SHIP],
    ['lost', OrderStatus.LOST],
    ['lost_by_3pl', OrderStatus.LOST_BY_3PL],
    ['damaged_by_3pl', OrderStatus.DAMAGED_BY_3PL],
    ['failed_delivery', OrderStatus.FAILED_DELIVERY],
    ['shipped_back', OrderStatus.SHIPPED_BACK],
    ['shipped_back_success', OrderStatus.SHIPPED_BACK_SUCCESS],
    ['shipped_back_failed', OrderStatus.SHIPPED_BACK_FAILED],
    ['package_scrapped', OrderStatus.PACKAGE_SCRAPPED],
  ])('map đúng "%s" -> %s', (raw, expected) => {
    expect(mapLazadaStatus(raw)).toBe(expected);
  });

  it('giá trị lạ chưa từng biết -> fallback PENDING (không throw, không làm đổ job sync)', () => {
    expect(mapLazadaStatus('mot-trang-thai-chua-tung-thay')).toBe(
      OrderStatus.PENDING,
    );
  });
});

describe('lazada-order.mapper — pickRepresentativeStatus (ưu tiên trạng thái xấu nhất)', () => {
  it('mảng rỗng -> PENDING (an toàn, giống fallback mapLazadaStatus)', () => {
    expect(pickRepresentativeStatus([])).toBe(OrderStatus.PENDING);
  });

  it('chỉ 1 giá trị -> trả đúng giá trị đó', () => {
    expect(pickRepresentativeStatus(['delivered'])).toBe(OrderStatus.DELIVERED);
  });

  it('đúng ví dụ đã nêu trong audit: ["delivered", "shipped_back"] -> PHẢI ra shipped_back, KHÔNG phải statuses[0]="delivered"', () => {
    expect(pickRepresentativeStatus(['delivered', 'shipped_back'])).toBe(
      OrderStatus.SHIPPED_BACK,
    );
  });

  it('có sự cố "lost" lẫn trong nhiều trạng thái bình thường khác -> ưu tiên lost lên trên hết', () => {
    expect(
      pickRepresentativeStatus(['shipped', 'delivered', 'lost', 'pending']),
    ).toBe(OrderStatus.LOST);
  });

  it('toàn bộ đều là trạng thái "tốt" (không có sự cố) -> lấy trạng thái tiến xa nhất trong luồng xử lý', () => {
    expect(pickRepresentativeStatus(['pending', 'packed', 'shipped'])).toBe(
      OrderStatus.SHIPPED,
    );
  });
});
