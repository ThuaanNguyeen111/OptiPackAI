import { billableWeightG, estimateFeeVnd } from '../solver/objective';
import type { FeeEstimate } from '../solver/types';

/**
 * Độ chính xác của engine so với thực tế (22/11/2026): cân thật lúc niêm phong
 * so với cân ước tính, bậc cước dự đoán so với bậc theo cân thật, cước GHN so
 * với cước ước tính, và đề xuất sửa cân SKU từ các kiện chỉ có 1 SKU.
 * Chỉ tính, không ghi gì — Admin xem rồi tự sửa hồ sơ SKU.
 */
export interface AccuracyParcel {
  group: string;
  parcel_no: number;
  box_code: string;
  /** SKU của từng món (mỗi món 1 phần tử). */
  skus: string[];
  items_weight_g: number;
  estimated_weight_g: number;
  volumetric_weight_g: number;
  actual_weight_g: number;
  /** Phí dịch vụ GHN (đã bỏ COD, bảo hiểm, vùng xa); null = chưa có vận đơn. */
  carrier_service_fee_vnd: number | null;
}

export interface AccuracyReport {
  parcels: number;
  weight: { mean_abs_error_g: number; mean_error_pct: number; mean_abs_error_pct: number; within_10pct: number };
  /** Kiện mà cân ước tính cho cùng bậc cước với cân thật. */
  same_bracket: number;
  by_box: { box_code: string; parcels: number; mean_error_pct: number }[];
  sku_suggestions: { sku: string; parcels: number; profile_g: number; measured_g: number; diff_pct: number }[];
  fee: { parcels: number; mean_diff_vnd: number; rows: { group: string; parcel_no: number; carrier_vnd: number; estimated_vnd: number }[] };
}

/** Một lần cân lệch có thể do cân sai; cần ≥ 2 kiện và lệch ≥ 15% mới đề xuất sửa. */
export const SKU_SUGGEST_MIN_PARCELS = 2;
export const SKU_SUGGEST_MIN_DIFF_PCT = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const hi = s[Math.floor(s.length / 2)] ?? 0;
  const lo = s[Math.ceil(s.length / 2) - 1] ?? hi;
  return (lo + hi) / 2;
};

export function packingAccuracy(parcels: AccuracyParcel[], stepG: number, fee: FeeEstimate): AccuracyReport {
  const rows = parcels.filter((p) => p.actual_weight_g > 0 && p.estimated_weight_g > 0);
  // % lệch = (thật − ước tính) / ước tính; dương = engine đoán nhẹ hơn thực tế.
  const errPct = (p: AccuracyParcel): number => ((p.actual_weight_g - p.estimated_weight_g) / p.estimated_weight_g) * 100;

  const boxes = new Map<string, number[]>();
  for (const p of rows) boxes.set(p.box_code, [...(boxes.get(p.box_code) ?? []), errPct(p)]);

  const skuMeasures = new Map<string, { profile: number; measured: number[] }>();
  for (const p of rows) {
    const sku = p.skus[0];
    if (!sku || p.skus.some((s) => s !== sku)) continue;
    const packagingG = p.estimated_weight_g - p.items_weight_g; // bì thùng + vật tư
    const entry = skuMeasures.get(sku) ?? { profile: p.items_weight_g / p.skus.length, measured: [] };
    entry.measured.push((p.actual_weight_g - packagingG) / p.skus.length);
    skuMeasures.set(sku, entry);
  }

  const feeRows = rows.flatMap((p) =>
    p.carrier_service_fee_vnd && p.carrier_service_fee_vnd > 0
      ? [{
          group: p.group,
          parcel_no: p.parcel_no,
          carrier_vnd: p.carrier_service_fee_vnd,
          estimated_vnd: estimateFeeVnd(billableWeightG(p.actual_weight_g, p.volumetric_weight_g, stepG), stepG, fee),
        }]
      : [],
  );

  return {
    parcels: rows.length,
    weight: {
      mean_abs_error_g: Math.round(mean(rows.map((p) => Math.abs(p.actual_weight_g - p.estimated_weight_g)))),
      mean_error_pct: round1(mean(rows.map(errPct))),
      mean_abs_error_pct: round1(mean(rows.map((p) => Math.abs(errPct(p))))),
      within_10pct: rows.filter((p) => Math.abs(errPct(p)) <= 10).length,
    },
    same_bracket: rows.filter(
      (p) =>
        billableWeightG(p.estimated_weight_g, p.volumetric_weight_g, stepG) ===
        billableWeightG(p.actual_weight_g, p.volumetric_weight_g, stepG),
    ).length,
    by_box: [...boxes]
      .map(([box_code, errs]) => ({ box_code, parcels: errs.length, mean_error_pct: round1(mean(errs)) }))
      .sort((a, b) => Math.abs(b.mean_error_pct) - Math.abs(a.mean_error_pct)),
    sku_suggestions: [...skuMeasures]
      .map(([sku, e]) => {
        const measured = Math.round(median(e.measured));
        return { sku, parcels: e.measured.length, profile_g: Math.round(e.profile), measured_g: measured, diff_pct: round1(((measured - e.profile) / e.profile) * 100) };
      })
      .filter((s) => s.parcels >= SKU_SUGGEST_MIN_PARCELS && Math.abs(s.diff_pct) >= SKU_SUGGEST_MIN_DIFF_PCT)
      .sort((a, b) => Math.abs(b.diff_pct) - Math.abs(a.diff_pct)),
    fee: { parcels: feeRows.length, mean_diff_vnd: Math.round(mean(feeRows.map((r) => r.carrier_vnd - r.estimated_vnd))), rows: feeRows },
  };
}
