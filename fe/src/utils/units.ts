/**
 * Đơn vị hiển thị thống nhất toàn hệ thống: kích thước = cm, khối lượng = kg, dấu phẩy thập phân.
 * API vẫn nhận/trả mm và g cho đóng gói; ô nhập đổi lại bằng cmToMm / kgToG (làm tròn số nguyên).
 * Quy tắc làm tròn khớp BE (`be/src/common/utils/measure-format.util.ts`).
 */

const LOCALE = 'vi-VN'

function fmt(value: number, maxDecimals: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDecimals }).format(value)
}

/** 12,5 (không kèm đơn vị). */
export function formatCm(cm: number): string {
  return fmt(cm, 1)
}

export function formatMmAsCm(mm: number): string {
  return formatCm(mm / 10)
}

/** "35 × 25 × 12,5 cm" từ cm. */
export function formatDimsCm(length: number, width: number, height: number): string {
  return `${formatCm(length)} × ${formatCm(width)} × ${formatCm(height)} cm`
}

/** "35 × 25 × 12,5 cm" từ mm. */
export function formatDimsMmAsCm(length: number, width: number, height: number): string {
  return formatDimsCm(length / 10, width / 10, height / 10)
}

/** "35 × 45 cm" từ mm (khổ trải của túi). */
export function formatFlatMmAsCm(width: number, length: number): string {
  return `${formatMmAsCm(width)} × ${formatMmAsCm(length)} cm`
}

/** Số kg, không kèm đơn vị. Tối đa 2 số lẻ; số dương làm tròn ra 0 thì giữ 3 số lẻ. */
export function formatKgNumber(kg: number): string {
  const rounded = Math.round(kg * 100) / 100
  return kg > 0 && rounded === 0 ? fmt(kg, 3) : fmt(rounded, 2)
}

/** "0,15 kg". */
export function formatKg(kg: number): string {
  return `${formatKgNumber(kg)} kg`
}

export function formatGAsKg(g: number): string {
  return formatKg(g / 1000)
}

/** Ô nhập cm → mm (số nguyên) gửi API. */
export function cmToMm(cm: number): number {
  return Math.round(cm * 10)
}

/** Ô nhập kg → g (số nguyên) gửi API. */
export function kgToG(kg: number): number {
  return Math.round(kg * 1000)
}

/** Hiện lại trong ô nhập: mm → "12,5". */
export function mmToCmInput(mm: number): string {
  return String(mm / 10).replace('.', ',')
}

/** Hiện lại trong ô nhập: g → "0,15". */
export function gToKgInput(g: number): string {
  return String(g / 1000).replace('.', ',')
}

/**
 * Đọc ô nhập số thập phân (chấp nhận dấu phẩy). Chuỗi rỗng hoặc không phải số → null.
 */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}
