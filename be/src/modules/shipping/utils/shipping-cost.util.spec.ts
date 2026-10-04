import {
  chargeableWeightG,
  pickRecommended,
  priceForWeight,
  quoteService,
  volumetricWeightG,
  type RateService,
} from './shipping-cost.util';

const economy: RateService = {
  code: 'ECO',
  name: 'Tiết kiệm',
  eta_min_days: 3,
  eta_max_days: 5,
  bands: [
    { up_to_g: 500, price_vnd: 20000 },
    { up_to_g: 1000, price_vnd: 25000 },
    { up_to_g: 2000, price_vnd: 32000 },
  ],
  extra_price_vnd_per_500g: 5000,
};
const express: RateService = {
  code: 'EXP',
  name: 'Nhanh',
  eta_min_days: 1,
  eta_max_days: 2,
  bands: [
    { up_to_g: 500, price_vnd: 35000 },
    { up_to_g: 2000, price_vnd: 50000 },
  ],
  extra_price_vnd_per_500g: 9000,
};
const carrier = {
  code: 'C1',
  name: 'Hãng mẫu',
  volumetric_divisor: 5000,
  is_sample: true,
};
// Kiện 40x30x20 cm → 24.000 cm³ → 4,8 kg quy đổi (divisor 5000) = 4800 g.
const bigOuter = { length_mm: 400, width_mm: 300, height_mm: 200 };
const smallOuter = { length_mm: 200, width_mm: 150, height_mm: 100 }; // 3000 cm³ → 600 g

describe('shipping-cost.util', () => {
  it('cân quy đổi thể tích = thể tích ngoài (cm³) / hệ số, làm tròn lên g', () => {
    expect(volumetricWeightG(bigOuter, 5000)).toBe(4800);
    expect(volumetricWeightG(smallOuter, 6000)).toBe(500);
    expect(
      volumetricWeightG(
        { length_mm: 101, width_mm: 101, height_mm: 101 },
        5000,
      ),
    ).toBe(207);
  });

  it('khối lượng tính cước = max(cân thực, cân quy đổi)', () => {
    expect(chargeableWeightG(1000, bigOuter, 5000)).toBe(4800); // kiện cồng kềnh nhẹ → tính theo thể tích
    expect(chargeableWeightG(9000, bigOuter, 5000)).toBe(9000); // kiện nặng → tính theo cân thực
  });

  it('giá theo bậc: đúng biên (≤ up_to_g) và bậc kế tiếp', () => {
    expect(priceForWeight(economy, 1)).toBe(20000);
    expect(priceForWeight(economy, 500)).toBe(20000);
    expect(priceForWeight(economy, 501)).toBe(25000);
    expect(priceForWeight(economy, 2000)).toBe(32000);
  });

  it('vượt bậc cuối: cộng mỗi 500 g làm tròn lên', () => {
    expect(priceForWeight(economy, 2001)).toBe(37000);
    expect(priceForWeight(economy, 2500)).toBe(37000);
    expect(priceForWeight(economy, 2501)).toBe(42000);
  });

  it('bậc không theo thứ tự vẫn ra đúng (tự sắp), bảng rỗng = 0', () => {
    const shuffled: RateService = {
      ...economy,
      bands: [...economy.bands].reverse(),
    };
    expect(priceForWeight(shuffled, 700)).toBe(25000);
    expect(priceForWeight({ ...economy, bands: [] }, 700)).toBe(0);
  });

  it('cước đơn = tổng cước TỪNG kiện; kiện cồng kềnh tính theo thể tích', () => {
    const quote = quoteService(carrier, economy, [
      { orderId: 'o1', cartonIndex: 0, actualG: 300, outer: smallOuter }, // quy đổi 600 → chargeable 600 → 25.000
      { orderId: 'o1', cartonIndex: 1, actualG: 900, outer: bigOuter }, // quy đổi 4800 → 32.000 + ceil(2800/500)*5000
    ]);
    expect(quote.parcels.map((p) => p.chargeableG)).toEqual([600, 4800]);
    expect(quote.parcels.map((p) => p.costVnd)).toEqual([
      25000,
      32000 + 6 * 5000,
    ]);
    expect(quote.totalCostVnd).toBe(25000 + 62000);
    expect(quote.totalChargeableG).toBe(5400);
    expect(quote.isSample).toBe(true);
  });

  const quotes = [
    quoteService(carrier, economy, [
      { orderId: 'o', cartonIndex: 0, actualG: 300, outer: smallOuter },
    ]),
    quoteService(carrier, express, [
      { orderId: 'o', cartonIndex: 0, actualG: 300, outer: smallOuter },
    ]),
  ];

  it('chiến lược cheapest/fastest chọn đúng; fixed dùng dịch vụ đã cấu hình, không còn thì rơi về rẻ nhất', () => {
    expect(
      pickRecommended(quotes, 'cheapest', {
        carrierCode: null,
        serviceCode: null,
      })?.serviceCode,
    ).toBe('ECO');
    expect(
      pickRecommended(quotes, 'fastest', {
        carrierCode: null,
        serviceCode: null,
      })?.serviceCode,
    ).toBe('EXP');
    expect(
      pickRecommended(quotes, 'fixed', {
        carrierCode: 'C1',
        serviceCode: 'EXP',
      })?.serviceCode,
    ).toBe('EXP');
    expect(
      pickRecommended(quotes, 'fixed', {
        carrierCode: 'C1',
        serviceCode: 'GONE',
      })?.serviceCode,
    ).toBe('ECO');
    expect(
      pickRecommended([], 'cheapest', { carrierCode: null, serviceCode: null }),
    ).toBeNull();
  });
});
