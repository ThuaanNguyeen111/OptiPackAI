import { DEFAULT_FEE_ESTIMATE } from '../solver/objective';
import { packingAccuracy, type AccuracyParcel } from './packing-accuracy.util';

const parcel = (over: Partial<AccuracyParcel>): AccuracyParcel => ({
  group: 'G1',
  parcel_no: 1,
  box_code: 'BOX-M',
  skus: ['AO', 'AO'],
  items_weight_g: 400, // 200 g/món theo hồ sơ
  estimated_weight_g: 600, // + 200 g bì thùng và vật tư
  volumetric_weight_g: 300,
  actual_weight_g: 600,
  carrier_service_fee_vnd: null,
  ...over,
});

describe('packingAccuracy', () => {
  it('đo lệch cân, bậc cước và theo thùng', () => {
    const r = packingAccuracy(
      [parcel({ actual_weight_g: 660 }), parcel({ parcel_no: 2, box_code: 'BOX-S', actual_weight_g: 540 })],
      500,
      DEFAULT_FEE_ESTIMATE,
    );
    expect(r.parcels).toBe(2);
    expect(r.weight).toEqual({ mean_abs_error_g: 60, mean_error_pct: 0, mean_abs_error_pct: 10, within_10pct: 2 });
    // 600 → 1000 g; 660 → 1000 g; 540 → 1000 g: cùng bậc.
    expect(r.same_bracket).toBe(2);
    expect(r.by_box.map((b) => [b.box_code, b.mean_error_pct])).toEqual([
      ['BOX-M', 10],
      ['BOX-S', -10],
    ]);
  });

  it('chỉ đề xuất sửa cân SKU khi ≥ 2 kiện một SKU cùng lệch ≥ 15%', () => {
    const heavy = { actual_weight_g: 800 }; // 800 − 200 bì = 600 g / 2 món = 300 g, hồ sơ 200 g → +50%
    const r = packingAccuracy(
      [
        parcel(heavy),
        parcel({ ...heavy, parcel_no: 2 }),
        parcel({ ...heavy, parcel_no: 3, skus: ['AO', 'QUAN'] }), // nhiều SKU: không dùng để chia cân
        parcel({ parcel_no: 4, skus: ['QUAN'], items_weight_g: 200, estimated_weight_g: 400, actual_weight_g: 600 }), // 1 kiện: chưa đủ
      ],
      500,
      DEFAULT_FEE_ESTIMATE,
    );
    expect(r.sku_suggestions).toEqual([{ sku: 'AO', parcels: 2, profile_g: 200, measured_g: 300, diff_pct: 50 }]);
    // Kiện 1–3: 600 và 800 g cùng bậc 1000 g; kiện 4: ước tính 400 g → 500 g, thật 600 g → 1000 g.
    expect(r.same_bracket).toBe(3);
  });

  it('so cước hãng với cước ước tính theo cân thật', () => {
    const r = packingAccuracy([parcel({ actual_weight_g: 1200, carrier_service_fee_vnd: 30000 })], 500, DEFAULT_FEE_ESTIMATE);
    // 1200 g → 1500 g = 3 bậc → 22000 + 2 × 2500 = 27000.
    expect(r.fee).toEqual({ parcels: 1, mean_diff_vnd: 3000, rows: [{ group: 'G1', parcel_no: 1, carrier_vnd: 30000, estimated_vnd: 27000 }] });
  });

  it('bỏ kiện chưa cân', () => {
    expect(packingAccuracy([parcel({ actual_weight_g: 0 })], 500, DEFAULT_FEE_ESTIMATE).parcels).toBe(0);
  });
});
