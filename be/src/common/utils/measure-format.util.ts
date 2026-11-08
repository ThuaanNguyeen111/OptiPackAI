/**
 * 08/11/2026 — Quy tắc hiển thị đơn vị đo DÙNG CHUNG cho mọi câu chữ BE sinh ra
 * (lỗi, bảng so sánh thùng, thông báo, lịch sử, PDF). Màn hình FE theo cùng quy tắc
 * (GUIDE_DOC/FE_UPDATE_CHECKLIST.md).
 *
 * - Kích thước: cm, tối đa 1 chữ số lẻ  → "35 × 25 × 12 cm", "0,5 cm".
 * - Khối lượng: kg, tối đa 2 chữ số lẻ  → "0,15 kg", "3,2 kg".
 *   Số > 0 mà làm tròn 2 chữ số ra 0 (VD 3 g) thì giữ 3 chữ số lẻ ("0,003 kg") để không hiện "0 kg".
 * - Định dạng số kiểu Việt Nam: dấu phẩy thập phân, dấu chấm hàng nghìn.
 *
 * DB/API KHÔNG đổi: engine vẫn lưu mm/g, sản phẩm và GHN vẫn cm/kg — chỉ đổi lúc hiển thị.
 */
const number = (value: number, maxFractionDigits: number): string =>
  value.toLocaleString('vi-VN', { maximumFractionDigits: maxFractionDigits });

export function formatCm(cm: number): string {
  return `${number(cm, 1)} cm`;
}

export function formatMmAsCm(mm: number): string {
  return formatCm(mm / 10);
}

/** "35 × 25 × 12 cm" từ 3 cạnh tính bằng mm. */
export function formatDimsMmAsCm(lengthMm: number, widthMm: number, heightMm: number): string {
  return `${number(lengthMm / 10, 1)} × ${number(widthMm / 10, 1)} × ${number(heightMm / 10, 1)} cm`;
}

/** "35 × 45 cm" — khổ túi trải phẳng (rộng × dài) từ mm. */
export function formatFlatMmAsCm(widthMm: number, lengthMm: number): string {
  return `${number(widthMm / 10, 1)} × ${number(lengthMm / 10, 1)} cm`;
}

/** "28 × 20 × 4 cm" từ 3 cạnh tính bằng cm. */
export function formatDimsCm(lengthCm: number, widthCm: number, heightCm: number): string {
  return `${number(lengthCm, 1)} × ${number(widthCm, 1)} × ${number(heightCm, 1)} cm`;
}

export function formatKg(kg: number): string {
  const digits = kg !== 0 && Math.abs(kg) < 0.005 ? 3 : 2;
  return `${number(kg, digits)} kg`;
}

export function formatGAsKg(grams: number): string {
  return formatKg(grams / 1000);
}
