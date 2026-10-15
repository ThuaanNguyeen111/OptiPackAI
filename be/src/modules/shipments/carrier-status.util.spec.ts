import { ShipmentStatus } from './enums/shipment-status.enum';
import { DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import {
  SIMULATABLE_GHN_STATUSES,
  aggregateCarrierStatus,
  canCarrierMove,
  mapGhnFailureReason,
  mapGhnStatus,
} from './carrier-status.util';

//!=============================================
// C5 (14/10/2026) — trạng thái GHN → vận đơn OptiPack. Webhook thật, nút mô phỏng và
// đồng bộ đều dùng các hàm này nên phải ra cùng một kết quả.
//!=============================================
describe('carrier-status.util', () => {
  it('map đủ vòng đời GHN: chờ lấy → trung chuyển → đang giao → giao xong / thất bại / hoàn / huỷ', () => {
    expect(mapGhnStatus('ready_to_pick')).toBe(ShipmentStatus.AWAITING_PICKUP);
    expect(mapGhnStatus('picked')).toBe(ShipmentStatus.IN_TRANSIT);
    expect(mapGhnStatus('transporting')).toBe(ShipmentStatus.IN_TRANSIT);
    expect(mapGhnStatus('delivering')).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(mapGhnStatus('delivered')).toBe(ShipmentStatus.DELIVERED);
    expect(mapGhnStatus('delivery_fail')).toBe(ShipmentStatus.DELIVERY_FAILED);
    expect(mapGhnStatus('cancel')).toBe(ShipmentStatus.CANCELLED);
  });

  it('`returned` của GHN chỉ đưa vận đơn tới "đang hoàn về kho" — kho phải quét nhận mới tạo phiếu hoàn', () => {
    expect(mapGhnStatus('returned')).toBe(ShipmentStatus.RETURNING_TO_WAREHOUSE);
  });

  it('sự cố (lost/damage/exception/scrap) và trạng thái lạ → null (không đổi trạng thái)', () => {
    for (const s of ['lost', 'damage', 'exception', 'scrap', 'abc']) expect(mapGhnStatus(s)).toBeNull();
  });

  describe('aggregateCarrierStatus — nhiều kiện (1 kiện = 1 đơn GHN)', () => {
    it('mọi kiện giao xong → delivered; còn 1 kiện chưa giao → lấy kiện chậm nhất', () => {
      expect(aggregateCarrierStatus(['delivered', 'delivered'])).toBe(ShipmentStatus.DELIVERED);
      expect(aggregateCarrierStatus(['delivered', 'picked'])).toBe(ShipmentStatus.IN_TRANSIT);
      expect(aggregateCarrierStatus(['delivering', 'ready_to_pick'])).toBe(ShipmentStatus.AWAITING_PICKUP);
    });

    it('có kiện hoàn → returning; có kiện thất bại → delivery_failed', () => {
      expect(aggregateCarrierStatus(['delivered', 'returning'])).toBe(ShipmentStatus.RETURNING_TO_WAREHOUSE);
      expect(aggregateCarrierStatus(['delivering', 'delivery_fail'])).toBe(ShipmentStatus.DELIVERY_FAILED);
    });

    it('mọi kiện huỷ → cancelled; kiện chưa có trạng thái coi như chờ lấy', () => {
      expect(aggregateCarrierStatus(['cancel', 'cancel'])).toBe(ShipmentStatus.CANCELLED);
      expect(aggregateCarrierStatus([null, 'picked'])).toBe(ShipmentStatus.AWAITING_PICKUP);
      expect(aggregateCarrierStatus([])).toBeNull();
    });
  });

  describe('canCarrierMove — webhook được nhảy bước nhưng không đi lùi / không rời trạng thái kết thúc', () => {
    it('chờ lấy → giao thành công (mất các sự kiện giữa) hợp lệ', () => {
      expect(canCarrierMove(ShipmentStatus.AWAITING_PICKUP, ShipmentStatus.DELIVERED)).toBe(true);
    });
    it('thất bại → giao lại (delivering) hợp lệ', () => {
      expect(canCarrierMove(ShipmentStatus.DELIVERY_FAILED, ShipmentStatus.OUT_FOR_DELIVERY)).toBe(true);
    });
    it('không quay về chờ lấy, không rời delivered/cancelled, đang hoàn chỉ kho nhận mới đi tiếp', () => {
      expect(canCarrierMove(ShipmentStatus.IN_TRANSIT, ShipmentStatus.AWAITING_PICKUP)).toBe(false);
      expect(canCarrierMove(ShipmentStatus.DELIVERED, ShipmentStatus.RETURNING_TO_WAREHOUSE)).toBe(false);
      expect(canCarrierMove(ShipmentStatus.CANCELLED, ShipmentStatus.IN_TRANSIT)).toBe(false);
      expect(canCarrierMove(ShipmentStatus.RETURNING_TO_WAREHOUSE, ShipmentStatus.OUT_FOR_DELIVERY)).toBe(false);
      expect(canCarrierMove(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.RETURNED_TO_WAREHOUSE)).toBe(false);
    });
    it('chỉ huỷ được khi còn chờ lấy hàng', () => {
      expect(canCarrierMove(ShipmentStatus.AWAITING_PICKUP, ShipmentStatus.CANCELLED)).toBe(true);
      expect(canCarrierMove(ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED)).toBe(false);
    });
  });

  it('mã lý do GHN → lý do cố định của OptiPack (thống kê)', () => {
    expect(mapGhnFailureReason('GHN-DFC1A4')).toBe(DeliveryFailureReason.CUSTOMER_UNREACHABLE);
    expect(mapGhnFailureReason('GHN-DFC1A0')).toBe(DeliveryFailureReason.CUSTOMER_RESCHEDULED);
    expect(mapGhnFailureReason('GHN-DCD0A8')).toBe(DeliveryFailureReason.CUSTOMER_REFUSED);
    expect(mapGhnFailureReason(undefined)).toBe(DeliveryFailureReason.OTHER);
  });

  it('nút mô phỏng không gửi được cancel / ready_to_pick', () => {
    expect(SIMULATABLE_GHN_STATUSES).not.toContain('cancel');
    expect(SIMULATABLE_GHN_STATUSES).not.toContain('ready_to_pick');
    expect(SIMULATABLE_GHN_STATUSES).toContain('delivered');
  });
});
