/**
 * Tham số vận hành giao hàng — đọc từ biến môi trường, có giá trị mặc định.
 * Khi demo có thể đặt nhỏ lại (VD SHIPMENT_MIN_RETRY_GAP_MINUTES=1) để không phải chờ.
 */
function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Khoảng cách tối thiểu giữa 2 lần giao (phút). Mặc định 120. */
export function minRetryGapMinutes(): number {
  return numberFromEnv('SHIPMENT_MIN_RETRY_GAP_MINUTES', 120);
}

/** Hạn giao tính bằng GIỜ LÀM VIỆC kể từ lúc bắt đầu giao. Mặc định 40 (~5 ngày làm việc). */
export function deliveryDueBusinessHours(): number {
  return numberFromEnv('SHIPMENT_DUE_BUSINESS_HOURS', 40);
}
