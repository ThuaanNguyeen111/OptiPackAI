import type { PrimitiveShape } from './schemas/product-model.schema';

/** AOFP-352 — thông số của hình cơ bản (spec §5.3). FE `buildPrimitive` dùng cùng khoảng và cùng mặc định. */
export const PRIMITIVE_PARAM_KEYS = [
  'corner_radius_pct',
  'cap_height_pct',
  'shoulder_pct',
  'neck_height_pct',
  'neck_diameter_pct',
  'crimp_pct',
] as const;
export type PrimitiveParamKey = (typeof PRIMITIVE_PARAM_KEYS)[number];
export type PrimitiveParams = Partial<Record<PrimitiveParamKey, number>>;

interface Range { min: number; max: number; default: number }

export const PRIMITIVE_PARAM_RANGES: Record<PrimitiveShape, Partial<Record<PrimitiveParamKey, Range>>> = {
  box: { corner_radius_pct: { min: 0, max: 20, default: 0 } },
  cylinder: { cap_height_pct: { min: 0, max: 30, default: 0 } },
  bottle: {
    shoulder_pct: { min: 5, max: 30, default: 15 },
    neck_height_pct: { min: 5, max: 40, default: 20 },
    neck_diameter_pct: { min: 15, max: 80, default: 40 },
    cap_height_pct: { min: 0, max: 20, default: 8 },
  },
  tube: {
    cap_height_pct: { min: 5, max: 25, default: 12 },
    crimp_pct: { min: 5, max: 15, default: 8 },
  },
};

/** Đủ thông số của dáng: thiếu thì lấy mặc định, thông số của dáng khác thì bỏ. Trả lỗi đầu tiên nếu ngoài khoảng. */
export function normalizePrimitiveParams(
  shape: PrimitiveShape,
  input: PrimitiveParams,
): { params: Record<PrimitiveParamKey, number | null>; error: string | null } {
  const ranges = PRIMITIVE_PARAM_RANGES[shape];
  const params = Object.fromEntries(PRIMITIVE_PARAM_KEYS.map((k) => [k, null])) as Record<PrimitiveParamKey, number | null>;
  for (const key of PRIMITIVE_PARAM_KEYS) {
    const range = ranges[key];
    if (!range) continue;
    const value = input[key] ?? range.default;
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      return { params, error: `${key} phải trong khoảng ${String(range.min)}–${String(range.max)}` };
    }
    params[key] = value;
  }
  return { params, error: null };
}

/** Hộp không bo góc = "Hình đại diện — dựng từ kích thước" (spec §3.2). */
export function isPlaceholderBox(primitive: { shape: string; corner_radius_pct?: number | null } | null | undefined): boolean {
  return primitive?.shape === 'box' && !primitive.corner_radius_pct;
}
