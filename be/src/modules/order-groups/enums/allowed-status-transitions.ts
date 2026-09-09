import { GroupFulfillmentStatus } from './group-fulfillment-status.enum';

/**
 * ===================================================================
 * Map trạng thái hợp lệ KẾ TIẾP — dùng CHUNG cho cả 5 endpoint
 * pick/pack/ship/deliver/return (sắp code), định nghĩa 1 LẦN DUY NHẤT
 * để tránh mỗi endpoint tự viết if/else riêng rồi lệch nhau.
 * ===================================================================
 * Theo đúng tinh thần BR-11 (UC-07, Report 1): không cho phép nhảy
 * trạng thái tùy tiện — mỗi trạng thái chỉ được đi tới ĐÚNG 1-2 trạng
 * thái kế tiếp hợp lý về nghiệp vụ.
 * ===================================================================
 */
const ALLOWED_TRANSITIONS: Record<GroupFulfillmentStatus, GroupFulfillmentStatus[]> = {
  [GroupFulfillmentStatus.AWAITING_PACKAGING]: [GroupFulfillmentStatus.PENDING_APPROVAL],
  // BUG ĐÃ VÁ (2026-09-09, phát hiện khi rà lại CLAUDE.md): thiếu đường
  // REJECT quay ngược — UC-04 Alt Flow (Report 1) ghi rõ "Packaging
  // Staff rejects entirely (Reject) -> Order Group returns to UC-03
  // for AI to recompute". Bản đầu chỉ cho đi tiếp APPROVED_FOR_PACKING,
  // không có đường lui — Reject sẽ bị chặn sai bởi chính validate này.
  [GroupFulfillmentStatus.PENDING_APPROVAL]: [
    GroupFulfillmentStatus.APPROVED_FOR_PACKING,
    GroupFulfillmentStatus.AWAITING_PACKAGING, // Reject -> AI tính lại
  ],
  [GroupFulfillmentStatus.APPROVED_FOR_PACKING]: [
    GroupFulfillmentStatus.PICKING,
    // BỔ SUNG (2026-09-09, cùng lượt code 5 endpoint fulfillment):
    // cho phép nhảy THẲNG sang PICKED — quyết định thiết kế có chủ
    // đích, không phải nới lỏng tùy tiện. Lý do: endpoint `pick` hiện
    // tại là "1 lần bấm = xác nhận đã lấy xong toàn bộ hàng trong
    // group" (chưa có màn hình quét QR từng SKU riêng lẻ — đó là việc
    // tương lai, xem CLAUDE.md mục "Mobile Application" trong đề bài).
    // PICKING vẫn giữ nguyên trong enum + vẫn là bước hợp lệ (dùng khi
    // sau này tách thành 2 thao tác "bắt đầu lấy" / "lấy xong") — chỉ
    // là hiện tại CHƯA có endpoint nào dừng lại ở đúng trạng thái này.
    GroupFulfillmentStatus.PICKED,
  ],
  [GroupFulfillmentStatus.PICKING]: [GroupFulfillmentStatus.PICKED],
  [GroupFulfillmentStatus.PICKED]: [GroupFulfillmentStatus.PACKED],
  [GroupFulfillmentStatus.PACKED]: [GroupFulfillmentStatus.SHIPPED],
  [GroupFulfillmentStatus.SHIPPED]: [GroupFulfillmentStatus.DELIVERED, GroupFulfillmentStatus.RETURNED],
  [GroupFulfillmentStatus.DELIVERED]: [GroupFulfillmentStatus.RETURNED], // hoàn hàng SAU khi đã giao vẫn hợp lệ (khách trả hàng)
  [GroupFulfillmentStatus.RETURNED]: [], // trạng thái cuối, không đi tiếp đâu nữa
};

export function isValidStatusTransition(
  from: GroupFulfillmentStatus,
  to: GroupFulfillmentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function getAllowedNextStatuses(
  from: GroupFulfillmentStatus,
): GroupFulfillmentStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
