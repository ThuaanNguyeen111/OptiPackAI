import { NotificationType } from '../enums/notification-type.enum';
import { PUSH_TYPES, shouldPush } from './push-policy';

describe('push-policy — loại thông báo gửi push (bảng Thuận duyệt 10/11/2026)', () => {
  it('19 loại trong bảng + picking_assigned = 20 loại push', () => {
    expect(PUSH_TYPES.size).toBe(20);
  });

  it('việc gấp / có hạn chót → push; tác vụ nền tự xử lý → chỉ trong app', () => {
    expect(shouldPush(NotificationType.PACKING_ASSIGNED, true)).toBe(true);
    expect(shouldPush(NotificationType.PICKING_ASSIGNED, true)).toBe(true);
    expect(shouldPush(NotificationType.DELIVERY_FAILED, false)).toBe(true);
    for (const t of [
      NotificationType.SYNC_FAILED,
      NotificationType.LOW_BOX_STOCK,
      NotificationType.LOW_MATERIAL_STOCK,
      NotificationType.PACKAGING_PLAN_INVALIDATED,
      NotificationType.PACKAGING_REJECTED,
      NotificationType.ABNORMAL_PACKAGE,
      NotificationType.DELIVERY_RETURNING,
      NotificationType.CONSOLIDATION_NAME_MISMATCH,
    ]) {
      expect(shouldPush(t, true)).toBe(false);
    }
  });

  it('nhóm tự huỷ: push cho nhân viên đang làm (đích danh), không push cả role Owner', () => {
    expect(shouldPush(NotificationType.GROUP_AUTO_CANCELED, true)).toBe(true);
    expect(shouldPush(NotificationType.GROUP_AUTO_CANCELED, false)).toBe(false);
  });
});
