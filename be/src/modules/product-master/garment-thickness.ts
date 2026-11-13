import { ProductCategory } from '../../common/enums/product-category.enum';
import { formatCm } from '../../common/utils/measure-format.util';

/**
 * ===================================================================
 * Độ dày gói quần áo tính từ GSM (13/11/2026, user chốt) — hàm thuần
 * ===================================================================
 * docs/PACKAGING_STANDARD.md §5.2:
 *   dày (cm) = max(0,3 ; làm tròn lên 0,1 cm của số lớp × GSM ÷ mật độ ÷ 10 000)
 * GSM ÷ mật độ vải (g/cm³) ÷ 10 000 = độ dày 1 lớp (cm). Không xét size.
 * Mật độ và số lớp là GIẢ ĐỊNH — kho hiệu chỉnh sau khi đo thực tế.
 * ===================================================================
 */

export interface GarmentFabric {
  /** GSM mặc định khi SKU bỏ trống `fabric_gsm`. */
  defaultGsm: number;
  /** Mật độ vải (g/cm³). */
  densityGPerCm3: number;
  /** Số lớp vải chồng lên nhau sau khi gấp chuẩn. */
  layers: number;
}

export const GARMENT_FABRIC: Readonly<Partial<Record<ProductCategory, GarmentFabric>>> = {
  [ProductCategory.T_SHIRT]: { defaultGsm: 180, densityGPerCm3: 0.3, layers: 8 },
  [ProductCategory.SHIRT]: { defaultGsm: 120, densityGPerCm3: 0.5, layers: 8 },
  [ProductCategory.SHORTS]: { defaultGsm: 200, densityGPerCm3: 0.4, layers: 8 },
  [ProductCategory.TROUSERS]: { defaultGsm: 350, densityGPerCm3: 0.55, layers: 12 },
  [ProductCategory.DRESS]: { defaultGsm: 150, densityGPerCm3: 0.4, layers: 8 },
  [ProductCategory.JACKET]: { defaultGsm: 300, densityGPerCm3: 0.25, layers: 8 },
};

/** Sàn độ dày: chừa cổ áo, cúc và vỏ túi zip. */
export const MIN_GARMENT_THICKNESS_CM = 0.3;

/** Độ dày gói (cm) theo GSM; null = loại không phải quần áo (không tính được). */
export function garmentThicknessCm(category: ProductCategory, gsm: number | null): number | null {
  const fabric = GARMENT_FABRIC[category];
  if (!fabric) return null;
  const raw = (fabric.layers * (gsm ?? fabric.defaultGsm)) / fabric.densityGPerCm3 / 10000;
  // Trừ 1e-9 để nhiễu dấu phẩy động (0.30000000004) không đẩy lên bậc 0,1 kế tiếp.
  return Math.max(MIN_GARMENT_THICKNESS_CM, Math.ceil(raw * 10 - 1e-9) / 10);
}

/** Ngưỡng lệch (cả dày hơn lẫn mỏng hơn) giữa số đo tay và số tính từ GSM. */
export const THICKNESS_WARNING_RATIO = 0.5;

/** Câu cảnh báo khi độ dày đo tay lệch quá ngưỡng; null = hợp lý hoặc không phải quần áo. */
export function thicknessWarning(category: ProductCategory, gsm: number | null, measuredCm: number): string | null {
  const expected = garmentThicknessCm(category, gsm);
  if (expected === null) return null;
  // +1e-9: 0,45 − 0,3 = 0,15000000000000002 vẫn là lệch đúng 50% (không "quá").
  if (Math.abs(measuredCm - expected) <= expected * THICKNESS_WARNING_RATIO + 1e-9) return null;
  const usedGsm = gsm ?? GARMENT_FABRIC[category]?.defaultGsm ?? 0;
  return (
    `Độ dày đo ${formatCm(measuredCm)} lệch quá ${String(THICKNESS_WARNING_RATIO * 100)}% so với ${formatCm(expected)} tính từ GSM ${String(usedGsm)}` +
    ' — kiểm tra lại số đo hoặc GSM của vải.'
  );
}
