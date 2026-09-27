/** G3 (27/09/2026) — trả hàng / hoàn hàng (bản gọn, bấm nút, giả lập). */
export enum ReturnType {
  FAILED_DELIVERY = 'failed_delivery', // hệ thống tự tạo khi kho nhận lại kiện giao thất bại
  RETURN_REFUND = 'return_refund', // khách trả hàng + hoàn tiền (có hàng về kho)
  REFUND_ONLY = 'refund_only', // hoàn tiền không cần trả hàng (không có hàng về)
}

export enum ReturnStatus {
  REQUESTED = 'requested', // chờ Store Owner duyệt
  REJECTED = 'rejected', // KẾT THÚC
  AWAITING_RECEIPT = 'awaiting_receipt', // đã duyệt, chờ hàng về kho
  RECEIVED = 'received', // kho đã nhận, chờ kiểm hàng
  CLOSED = 'closed', // KẾT THÚC — đã kiểm hàng (hoặc hoàn tiền không cần trả hàng)
}

export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = [ReturnStatus.REQUESTED, ReturnStatus.AWAITING_RECEIPT, ReturnStatus.RECEIVED];

export enum ReturnReason {
  DEFECTIVE = 'defective',
  WRONG_ITEM = 'wrong_item',
  NOT_AS_DESCRIBED = 'not_as_described',
  SIZE_NOT_FIT = 'size_not_fit',
  CHANGED_MIND = 'changed_mind',
  FAILED_DELIVERY = 'failed_delivery',
  OTHER = 'other',
}

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  [ReturnReason.DEFECTIVE]: 'Hàng lỗi / hư hỏng',
  [ReturnReason.WRONG_ITEM]: 'Giao sai sản phẩm',
  [ReturnReason.NOT_AS_DESCRIBED]: 'Không đúng mô tả',
  [ReturnReason.SIZE_NOT_FIT]: 'Không vừa size',
  [ReturnReason.CHANGED_MIND]: 'Đổi ý, không muốn mua nữa',
  [ReturnReason.FAILED_DELIVERY]: 'Giao hàng thất bại, hoàn về kho',
  [ReturnReason.OTHER]: 'Lý do khác',
};

/** Kết quả kiểm từng dòng hàng khi về kho. */
export enum InspectionResult {
  RESTOCK = 'restock', // đạt -> nhập lại ô bán (ghi sổ cái return_restock)
  QUARANTINE = 'quarantine', // nghi lỗi -> KHÔNG cộng tồn bán, ghi nhận chờ xử lý
  DISCARD = 'discard', // hỏng hẳn -> loại bỏ, không cộng tồn
}

export const RETURN_WINDOW_DAYS = 15; // tham chiếu Shopee VN: 15 ngày kể từ khi nhận hàng
