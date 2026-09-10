import { GroupFulfillmentStatus } from './group-fulfillment-status.enum';
import { getAllowedNextStatuses, isValidStatusTransition } from './allowed-status-transitions';

describe('allowed-status-transitions', () => {
  describe('luồng chính (happy path) — mỗi bước đi tiếp hợp lệ', () => {
    const happyPath: GroupFulfillmentStatus[] = [
      GroupFulfillmentStatus.AWAITING_PACKAGING,
      GroupFulfillmentStatus.PENDING_APPROVAL,
      GroupFulfillmentStatus.APPROVED_FOR_PACKING,
      GroupFulfillmentStatus.PICKED,
      GroupFulfillmentStatus.PACKED,
      GroupFulfillmentStatus.SHIPPED,
      GroupFulfillmentStatus.DELIVERED,
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i];
      const to = happyPath[i + 1];
      if (from === undefined || to === undefined) {
        throw new Error('Test setup lỗi — happyPath thiếu phần tử.'); // không thể xảy ra thực tế, chỉ để thỏa strict null check thay vì dùng non-null assertion
      }
      it(`${from} -> ${to} hợp lệ`, () => {
        expect(isValidStatusTransition(from, to)).toBe(true);
      });
    }
  });

  it('UC-04 Reject: PENDING_APPROVAL -> AWAITING_PACKAGING hợp lệ (đường lùi, bug đã vá 2026-09-09)', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.PENDING_APPROVAL,
        GroupFulfillmentStatus.AWAITING_PACKAGING,
      ),
    ).toBe(true);
  });

  it('APPROVED_FOR_PACKING -> PICKING vẫn hợp lệ (giữ nguyên cho tương lai quét QR từng SKU)', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        GroupFulfillmentStatus.PICKING,
      ),
    ).toBe(true);
  });

  it('SHIPPED -> RETURNED hợp lệ (khách trả hàng trước khi ghi nhận delivered)', () => {
    expect(
      isValidStatusTransition(GroupFulfillmentStatus.SHIPPED, GroupFulfillmentStatus.RETURNED),
    ).toBe(true);
  });

  it('DELIVERED -> RETURNED hợp lệ (khách trả hàng sau khi đã giao)', () => {
    expect(
      isValidStatusTransition(GroupFulfillmentStatus.DELIVERED, GroupFulfillmentStatus.RETURNED),
    ).toBe(true);
  });

  it('RETURNED là trạng thái cuối — không có đường đi tiếp nào', () => {
    expect(getAllowedNextStatuses(GroupFulfillmentStatus.RETURNED)).toEqual([]);
  });

  describe('chặn nhảy trạng thái tùy tiện (invalid transitions)', () => {
    const invalidCases: [GroupFulfillmentStatus, GroupFulfillmentStatus][] = [
      // Nhảy cóc bỏ qua nhiều bước
      [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.PACKED],
      [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.SHIPPED],
      [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.DELIVERED],
      // Đi lùi sai chỗ (không phải đường Reject/Return hợp lệ)
      [GroupFulfillmentStatus.PACKED, GroupFulfillmentStatus.PICKED],
      [GroupFulfillmentStatus.SHIPPED, GroupFulfillmentStatus.PACKED],
      [GroupFulfillmentStatus.APPROVED_FOR_PACKING, GroupFulfillmentStatus.AWAITING_PACKAGING],
      // Từ trạng thái cuối
      [GroupFulfillmentStatus.RETURNED, GroupFulfillmentStatus.DELIVERED],
      [GroupFulfillmentStatus.RETURNED, GroupFulfillmentStatus.AWAITING_PACKAGING],
      // Đứng yên (không tự chuyển sang chính nó)
      [GroupFulfillmentStatus.PACKED, GroupFulfillmentStatus.PACKED],
    ];

    for (const [from, to] of invalidCases) {
      it(`${from} -> ${to} PHẢI bị chặn (invalid)`, () => {
        expect(isValidStatusTransition(from, to)).toBe(false);
      });
    }
  });

  it('getAllowedNextStatuses trả đúng mảng cho từng trạng thái — không rỗng ngoài dự kiến', () => {
    expect(getAllowedNextStatuses(GroupFulfillmentStatus.SHIPPED)).toEqual(
      expect.arrayContaining([GroupFulfillmentStatus.DELIVERED, GroupFulfillmentStatus.RETURNED]),
    );
    expect(getAllowedNextStatuses(GroupFulfillmentStatus.SHIPPED)).toHaveLength(2);
  });
});
