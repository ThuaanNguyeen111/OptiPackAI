/**
 * Lý do giao thất bại — DANH SÁCH CỐ ĐỊNH (không cho gõ tự do) để thống kê
 * được tỷ lệ theo từng lý do. Lý do chung chung kiểu "không có nhà" không
 * phân tích được -> tách rõ.
 */
export enum DeliveryFailureReason {
  CUSTOMER_UNREACHABLE = 'customer_unreachable',
  CUSTOMER_RESCHEDULED = 'customer_rescheduled',
  WRONG_ADDRESS = 'wrong_address',
  AREA_INACCESSIBLE = 'area_inaccessible',
  CUSTOMER_REFUSED = 'customer_refused', // -> hoàn về NGAY, không giao lại
  OTHER = 'other', // -> bắt buộc ghi chú
}

export const DELIVERY_FAILURE_REASON_LABELS: Record<DeliveryFailureReason, string> = {
  [DeliveryFailureReason.CUSTOMER_UNREACHABLE]: 'Không liên lạc được khách',
  [DeliveryFailureReason.CUSTOMER_RESCHEDULED]: 'Khách hẹn giao lại',
  [DeliveryFailureReason.WRONG_ADDRESS]: 'Sai / không tìm thấy địa chỉ',
  [DeliveryFailureReason.AREA_INACCESSIBLE]: 'Không vào được khu vực giao',
  [DeliveryFailureReason.CUSTOMER_REFUSED]: 'Khách từ chối nhận hàng',
  [DeliveryFailureReason.OTHER]: 'Lý do khác (ghi rõ trong ghi chú)',
};
