import { changeRate, ratio, resolveRange, shippingCostOf, vnDayKey, vnDaysBetween } from './dashboard-metrics.util';

describe('dashboard-metrics.util (28/10/2026)', () => {
  const now = new Date('2026-10-28T10:00:00.000Z');

  it('resolveRange: mặc định 30 ngày, kỳ trước cùng độ dài nối liền', () => {
    const r = resolveRange(undefined, undefined, now);
    expect(r?.to).toEqual(now);
    expect(r?.from.toISOString()).toBe('2026-09-28T10:00:00.000Z');
    expect(r?.previousTo).toEqual(r?.from);
    expect(r?.previousFrom.toISOString()).toBe('2026-08-29T10:00:00.000Z');
  });

  it('resolveRange: sai định dạng, from >= to, dài quá 366 ngày → null', () => {
    expect(resolveRange('abc', undefined, now)).toBeNull();
    expect(resolveRange('2026-10-28T00:00:00Z', '2026-10-27T00:00:00Z', now)).toBeNull();
    expect(resolveRange('2025-01-01T00:00:00Z', '2026-10-28T00:00:00Z', now)).toBeNull();
  });

  it('ratio / changeRate: mẫu số 0 → null', () => {
    expect(ratio(1, 3)).toBe(0.333);
    expect(ratio(1, 0)).toBeNull();
    expect(changeRate(110, 100)).toBe(0.1);
    expect(changeRate(5, 0)).toBeNull();
  });

  it('ngày theo giờ Việt Nam: 18h UTC ngày 27 = ngày 28 ở VN', () => {
    expect(vnDayKey(new Date('2026-10-27T18:00:00.000Z'))).toBe('2026-10-28');
    expect(vnDaysBetween(new Date('2026-10-25T17:00:00.000Z'), new Date('2026-10-28T17:00:00.000Z'))).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });

  it('shippingCostOf: phí thật từng kiện GHN (bỏ kiện huỷ / chưa có mã); không có → báo giá', () => {
    expect(shippingCostOf({
      estimated_cost_vnd: 50_000,
      carrier_parcels: [
        { carrier_order_code: 'A', carrier_status: 'delivered', fee: { total: 20_900 } },
        { carrier_order_code: 'B', carrier_status: 'cancel', fee: { total: 20_900 } },
        { carrier_order_code: null, carrier_status: null, fee: null },
        { carrier_order_code: 'C', carrier_status: 'transporting', fee: { total: 24_200 } },
      ],
    })).toBe(45_100);
    expect(shippingCostOf({ estimated_cost_vnd: 30_000, carrier_parcels: [] })).toBe(30_000);
    expect(shippingCostOf({ estimated_cost_vnd: null })).toBe(0);
  });
});
