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
const ALLOWED_TRANSITIONS: Record<
  GroupFulfillmentStatus,
  GroupFulfillmentStatus[]
> = {
  [GroupFulfillmentStatus.AWAITING_PACKAGING]: [
    GroupFulfillmentStatus.PICKING,
    GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
    GroupFulfillmentStatus.CANCELED,
  ],
  [GroupFulfillmentStatus.PICKING]: [
    GroupFulfillmentStatus.PICKED,
    GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
    GroupFulfillmentStatus.CANCELED,
  ],
  // ĐẢO LUỒNG (20/09/2026, theo yêu cầu Thuận) — Lấy hàng làm TRƯỚC,
  // Đóng gói (tính gợi ý + duyệt) làm SAU, không phải ngược lại như
  // thiết kế ban đầu. Lý do nghiệp vụ: Packaging Staff cần nhìn hàng
  // THẬT đã lấy về rồi mới quyết định đóng gói thế nào, không quyết
  // định trước khi biết chắc có đủ hàng hay không.
  //
  // PICKED giờ đi tới PENDING_APPROVAL (không phải PACKED như bản cũ)
  // — generateFallbackRecommendation() (packaging.service.ts) giờ CHỈ
  // gọi được khi group đang PICKED (điều kiện tự động thực thi qua
  // đúng bảng này, không cần check riêng trong service).
  [GroupFulfillmentStatus.PICKED]: [
    GroupFulfillmentStatus.PENDING_APPROVAL,
    GroupFulfillmentStatus.CANCELED,
  ],
  // PARTIAL_NEEDS_REVIEW KHÔNG tự động đi tiếp — chỉ 2 đường: duyệt
  // tiếp (đi PICKED, coi như lấy xong phần có sẵn) hoặc từ chối (quay
  // lại AWAITING_PACKAGING, lấy lại từ đầu khi có đủ hàng).
  [GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW]: [
    GroupFulfillmentStatus.PICKED,
    GroupFulfillmentStatus.AWAITING_PACKAGING,
    // BỔ SUNG (30/09/2026) — từ chối partial: mở lượt lấy mới NGAY (không còn
    // dừng ở awaiting_packaging, nơi không có API nào đưa nhóm đi tiếp).
    GroupFulfillmentStatus.PICKING,
    GroupFulfillmentStatus.CANCELED,
  ],
  // Reject giờ quay về PICKED (không phải AWAITING_PACKAGING như bản
  // cũ) — hàng ĐÃ lấy xong rồi, Reject chỉ có nghĩa "gợi ý đóng gói
  // tính sai/không phù hợp", KHÔNG có nghĩa "lấy sai hàng" — không
  // cần lấy lại, chỉ cần tính lại gợi ý (generate lại từ PICKED).
  [GroupFulfillmentStatus.PENDING_APPROVAL]: [
    GroupFulfillmentStatus.APPROVED_FOR_PACKING,
    GroupFulfillmentStatus.PICKED,
    GroupFulfillmentStatus.CANCELED,
  ],
  // Đóng gói vật lý (pack) giờ diễn ra NGAY SAU khi duyệt xong gợi ý —
  // không còn đường vòng qua PICKING/PICKED nữa (2 trạng thái đó đã
  // xảy ra TRƯỚC, ở đầu luồng).
  [GroupFulfillmentStatus.APPROVED_FOR_PACKING]: [
    GroupFulfillmentStatus.PACKED,
    // BỔ SUNG (30/09/2026) — 1 đơn trong nhóm bị hủy sau khi đã duyệt: phương
    // án cũ chứa hàng đơn đã hủy, phải vô hiệu hóa và tính lại từ `picked`.
    GroupFulfillmentStatus.PICKED,
    GroupFulfillmentStatus.CANCELED,
    // BỔ SUNG (05/10/2026) — báo món hỏng/thiếu lúc đóng, chọn "trả về lấy hàng":
    // kế hoạch bị thay, nhóm quay lại lượt lấy hiện tại để lấy món thay.
    GroupFulfillmentStatus.PICKING,
  ],
  // BỔ SUNG (05/10/2026) — mọi đơn bị hủy SAU khi đã đóng (chưa giao): nhóm hủy,
  // các kiện chuyển "phải tháo" và nhân viên tháo kiện trả hàng về kệ.
  // BỔ SUNG (08/10/2026) — hoàn tác niêm phong 1 kiện của nhóm đã `packed` (chưa giao):
  // nhóm quay lại approved_for_packing để đóng lại kiện đó.
  [GroupFulfillmentStatus.PACKED]: [
    GroupFulfillmentStatus.SHIPPED,
    GroupFulfillmentStatus.CANCELED,
    GroupFulfillmentStatus.APPROVED_FOR_PACKING,
  ],
  [GroupFulfillmentStatus.SHIPPED]: [GroupFulfillmentStatus.DELIVERED, GroupFulfillmentStatus.RETURNED],
  [GroupFulfillmentStatus.DELIVERED]: [GroupFulfillmentStatus.RETURNED], // hoàn hàng SAU khi đã giao vẫn hợp lệ (khách trả hàng)
  [GroupFulfillmentStatus.RETURNED]: [], // trạng thái cuối, không đi tiếp đâu nữa
  // BỔ SUNG (29/09/2026, N1) — trạng thái cuối, giống RETURNED. KHÔNG có
  // cạnh đi TỚI CANCELED từ PACKED/SHIPPED/DELIVERED (hàng đã đóng/giao vật
  // lý không tự hủy ngầm — dùng luồng `return` thủ công như hiện có).
  [GroupFulfillmentStatus.CANCELED]: [],
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
