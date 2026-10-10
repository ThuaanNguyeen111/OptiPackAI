import { CarrierParcel } from '../carrier.types';

/** Giới hạn kiện của GHN (tài liệu Create Order): 50 kg, mỗi cạnh 200 cm. */
export const PARCEL_LIMITS = {
  maxWeightG: 50_000,
  maxSideCm: 200,
} as const;

/**
 * Trọng lượng quy đổi (gram) = D × R × C (cm) / hệ số × 1000.
 * CHỈ dùng cho adapter mock và để sắp xếp sơ bộ phương án đóng gói — phí thật
 * luôn lấy từ API của hãng (hệ số của GHN không công bố trong tài liệu API;
 * GHN trả trọng lượng quy đổi thật qua webhook, field ConvertedWeight).
 */
export function volumetricWeightG(parcel: CarrierParcel, divisor = 5000): number {
  return Math.ceil(
    ((parcel.length_cm * parcel.width_cm * parcel.height_cm) / divisor) * 1000,
  );
}

/** Trọng lượng tính cước = max(trọng lượng thật, trọng lượng quy đổi). */
export function chargeableWeightG(parcel: CarrierParcel, divisor = 5000): number {
  return Math.max(parcel.weight_g, volumetricWeightG(parcel, divisor));
}

/** Trả danh sách vi phạm (rỗng = hợp lệ). Kiểm tra TRƯỚC khi gọi hãng. */
export function validateParcel(parcel: CarrierParcel): string[] {
  const problems: string[] = [];
  const sides: [string, number][] = [
    ['length_cm', parcel.length_cm],
    ['width_cm', parcel.width_cm],
    ['height_cm', parcel.height_cm],
  ];
  if (!Number.isInteger(parcel.weight_g) || parcel.weight_g <= 0) {
    problems.push('weight_g phải là số nguyên dương (gram)');
  } else if (parcel.weight_g > PARCEL_LIMITS.maxWeightG) {
    problems.push(`weight_g vượt ${String(PARCEL_LIMITS.maxWeightG)} g`);
  }
  for (const [name, value] of sides) {
    if (!Number.isInteger(value) || value <= 0) {
      problems.push(`${name} phải là số nguyên dương (cm)`);
    } else if (value > PARCEL_LIMITS.maxSideCm) {
      problems.push(`${name} vượt ${String(PARCEL_LIMITS.maxSideCm)} cm`);
    }
  }
  return problems;
}
