import { GroupFulfillmentStatus } from './group-fulfillment-status.enum';
import {
  getAllowedNextStatuses,
  isValidStatusTransition,
} from './allowed-status-transitions';

//!=============================================
// VIẾT LẠI (20/09/2026, theo yêu cầu Thuận) — đảo luồng: Lấy hàng làm
// TRƯỚC, Đóng gói (tính gợi ý + duyệt) làm SAU. Test cũ theo đúng thứ
// tự CŨ (đóng gói trước, lấy hàng sau) — không còn đúng, viết lại
// hoàn toàn theo happy path MỚI.
//!=============================================
describe('allowed-status-transitions', () => {
  describe('luồng chính MỚI (happy path) — Lấy hàng TRƯỚC, Đóng gói SAU', () => {
    const happyPath: GroupFulfillmentStatus[] = [
      GroupFulfillmentStatus.AWAITING_PACKAGING,
      GroupFulfillmentStatus.PICKING,
      GroupFulfillmentStatus.PICKED,
      GroupFulfillmentStatus.PENDING_APPROVAL,
      GroupFulfillmentStatus.APPROVED_FOR_PACKING,
      GroupFulfillmentStatus.PACKED,
      GroupFulfillmentStatus.SHIPPED,
      GroupFulfillmentStatus.DELIVERED,
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i];
      const to = happyPath[i + 1];
      if (from === undefined || to === undefined) {
        throw new Error('Test setup lỗi — happyPath thiếu phần tử.');
      }
      it(`${from} -> ${to} hợp lệ`, () => {
        expect(isValidStatusTransition(from, to)).toBe(true);
      });
    }
  });

  it('Reject gợi ý đóng gói: PENDING_APPROVAL -> PICKED hợp lệ (hàng ĐÃ lấy xong, chỉ tính lại gợi ý, KHÔNG lấy lại)', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.PENDING_APPROVAL,
        GroupFulfillmentStatus.PICKED,
      ),
    ).toBe(true);
  });

  it('Thiếu hàng lúc lấy, duyệt tiếp partial: PARTIAL_NEEDS_REVIEW -> PICKED hợp lệ', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
        GroupFulfillmentStatus.PICKED,
      ),
    ).toBe(true);
  });

  it('Thiếu hàng lúc lấy, từ chối luôn: PARTIAL_NEEDS_REVIEW -> AWAITING_PACKAGING hợp lệ (lấy lại từ đầu khi có đủ hàng)', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
        GroupFulfillmentStatus.AWAITING_PACKAGING,
      ),
    ).toBe(true);
  });

  it('SHIPPED -> RETURNED hợp lệ (khách trả hàng trước khi ghi nhận delivered)', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.SHIPPED,
        GroupFulfillmentStatus.RETURNED,
      ),
    ).toBe(true);
  });

  it('DELIVERED -> RETURNED hợp lệ (khách trả hàng sau khi đã giao)', () => {
    expect(
      isValidStatusTransition(
        GroupFulfillmentStatus.DELIVERED,
        GroupFulfillmentStatus.RETURNED,
      ),
    ).toBe(true);
  });

  it('RETURNED là trạng thái cuối — không có đường đi tiếp nào', () => {
    expect(getAllowedNextStatuses(GroupFulfillmentStatus.RETURNED)).toEqual([]);
  });

  describe('chặn nhảy trạng thái tùy tiện (invalid transitions) — đặc biệt chặn ĐI THEO ĐÚNG THỨ TỰ CŨ đã bỏ', () => {
    const invalidCases: [GroupFulfillmentStatus, GroupFulfillmentStatus][] = [
      // Nhảy cóc bỏ qua nhiều bước
      [
        GroupFulfillmentStatus.AWAITING_PACKAGING,
        GroupFulfillmentStatus.PACKED,
      ],
      [
        GroupFulfillmentStatus.AWAITING_PACKAGING,
        GroupFulfillmentStatus.SHIPPED,
      ],
      [
        GroupFulfillmentStatus.AWAITING_PACKAGING,
        GroupFulfillmentStatus.DELIVERED,
      ],
      // ĐÚNG THỨ TỰ CŨ (đã bỏ) — không được phép đi tiếp sang duyệt
      // đóng gói khi CHƯA lấy hàng.
      [
        GroupFulfillmentStatus.AWAITING_PACKAGING,
        GroupFulfillmentStatus.PENDING_APPROVAL,
      ],
      [GroupFulfillmentStatus.PICKED, GroupFulfillmentStatus.PACKED],
      [
        GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        GroupFulfillmentStatus.PICKING,
      ],
      // Đi lùi sai chỗ (không phải đường Reject/Return hợp lệ)
      [GroupFulfillmentStatus.PACKED, GroupFulfillmentStatus.PICKED],
      [GroupFulfillmentStatus.SHIPPED, GroupFulfillmentStatus.PACKED],
      [
        GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        GroupFulfillmentStatus.AWAITING_PACKAGING,
      ],
      // Từ trạng thái cuối
      [GroupFulfillmentStatus.RETURNED, GroupFulfillmentStatus.DELIVERED],
      [
        GroupFulfillmentStatus.RETURNED,
        GroupFulfillmentStatus.AWAITING_PACKAGING,
      ],
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
      expect.arrayContaining([
        GroupFulfillmentStatus.DELIVERED,
        GroupFulfillmentStatus.RETURNED,
      ]),
    );
    expect(getAllowedNextStatuses(GroupFulfillmentStatus.SHIPPED)).toHaveLength(
      2,
    );
  });
});
