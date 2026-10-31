import type { ConsolidationRule } from '../order-sync-policy';
import { simulateConsolidation } from './consolidation-preview.util';
import type { PreviewOrderInput } from './consolidation-preview.util';

//!=============================================
// 31/10/2026 — xem trước quy tắc gộp: mô phỏng trong bộ nhớ.
//!=============================================

const PHONE_ONLY: ConsolidationRule = {
  id: 'r1',
  name: 'Chỉ cùng SĐT',
  sourceText: null,
  fields: [{ field: 'phone', match: 'normalized' }],
  platforms: [],
  maxWindowHours: null,
  enabled: true,
};

let seq = 0;
function o(overrides: Partial<PreviewOrderInput> & { phone?: string; hour?: number } = {}): PreviewOrderInput {
  seq += 1;
  const { phone, hour, ...rest } = overrides;
  return {
    platform: 'aurelle',
    shop_id: 'shop-1',
    platform_order_id: `AU-${String(seq)}`,
    delivery_option: 'standard',
    consolidation_key: `base-${String(seq)}`, // mặc định: mỗi đơn khác khoá cơ bản
    created_at: new Date(Date.UTC(2026, 9, 31, hour ?? seq)),
    recipient: { phone: phone ?? '0901234567', full_name: 'An', address_line1: `${String(seq)} Lê Lợi` },
    ...rest,
  };
}

const opts = { enabled: true, timeWindowHours: null };

describe('simulateConsolidation', () => {
  beforeEach(() => { seq = 0; });

  it('không quy tắc: chỉ gộp theo khoá cơ bản', () => {
    const orders = [o({ consolidation_key: 'k' }), o({ consolidation_key: 'k' }), o()];
    const r = simulateConsolidation(orders, { ...opts, rules: [] });
    expect(r.groups).toBe(2);
    expect(r.groupsMergedByRules).toBe(0);
    expect(r.examples).toEqual([]);
  });

  it('quy tắc "chỉ cùng SĐT" gộp đơn khác địa chỉ; ví dụ chỉ hiện mã đơn + 3 số cuối', () => {
    const orders = [o(), o(), o({ phone: '0907777888' })];
    const r = simulateConsolidation(orders, { ...opts, rules: [PHONE_ONLY] });
    expect(r.groups).toBe(2);
    expect(r.groupsMergedByRules).toBe(1);
    expect(r.examples).toEqual([{ ruleNames: ['Chỉ cùng SĐT'], platformOrderIds: ['AU-1', 'AU-2'], phoneLast3: ['567'] }]);
  });

  it('SĐT bị che → quy tắc bỏ qua, đếm vào skippedMissingData', () => {
    const orders = [o({ platform: 'lazada', phone: '8**5' }), o({ platform: 'lazada', phone: '8**5' })];
    const r = simulateConsolidation(orders, { ...opts, rules: [PHONE_ONLY] });
    expect(r.groups).toBe(2);
    expect(r.skippedMissingData).toEqual({ r1: 2 });
  });

  it('khác shop / khác sàn không gộp dù trùng SĐT', () => {
    const orders = [o(), o({ shop_id: 'shop-2' }), o({ platform: 'lazada' })];
    expect(simulateConsolidation(orders, { ...opts, rules: [PHONE_ONLY] }).groups).toBe(3);
  });

  it('đơn hỏa tốc và đơn đổi hàng không gộp qua quy tắc, không bị tính là thiếu dữ liệu', () => {
    const orders = [o(), o({ delivery_option: 'express' }), o({ platform_order_id: 'EXC-RMA1' })];
    const r = simulateConsolidation(orders, { ...opts, rules: [PHONE_ONLY] });
    expect(r.groups).toBe(3);
    expect(r.skippedMissingData).toEqual({ r1: 0 });
  });

  it('giới hạn thời gian riêng của quy tắc: đơn cách 7 giờ không gộp với giới hạn 6 giờ', () => {
    const orders = [o({ hour: 0 }), o({ hour: 7 }), o({ hour: 9 })];
    const r = simulateConsolidation(orders, { ...opts, rules: [{ ...PHONE_ONLY, maxWindowHours: 6 }] });
    // 0h đứng riêng; 7h và 9h (cách 2 giờ) gộp với nhau.
    expect(r.groups).toBe(2);
  });

  it('khớp nhiều nhóm → vào nhóm của đơn CŨ NHẤT (giống tryConsolidate)', () => {
    const byAddress: ConsolidationRule = { ...PHONE_ONLY, id: 'r2', name: 'Cùng địa chỉ', fields: [{ field: 'address_line1', match: 'normalized' }] };
    const a = o({ hour: 1, phone: '0901111111', recipient: { phone: '0901111111', address_line1: 'X' } });
    const b = o({ hour: 2, phone: '0902222222', recipient: { phone: '0902222222', address_line1: 'Y' } });
    // c trùng SĐT với b và trùng địa chỉ với a → vào nhóm a (cũ hơn).
    const c = o({ hour: 3, recipient: { phone: '0902222222', address_line1: 'X' } });
    const r = simulateConsolidation([c, b, a], { ...opts, rules: [PHONE_ONLY, byAddress] });
    expect(r.groups).toBe(2);
    expect(r.examples).toEqual([{ ruleNames: ['Cùng địa chỉ'], platformOrderIds: [a.platform_order_id, c.platform_order_id], phoneLast3: ['111', '222'] }]);
  });

  it('tắt gom → mỗi đơn 1 nhóm', () => {
    const orders = [o({ consolidation_key: 'k' }), o({ consolidation_key: 'k' })];
    expect(simulateConsolidation(orders, { enabled: false, timeWindowHours: null, rules: [PHONE_ONLY] }).groups).toBe(2);
  });

  it('tối đa 10 ví dụ', () => {
    const orders = Array.from({ length: 30 }, (_, i) => o({ phone: `09000000${String(Math.floor(i / 2)).padStart(2, '0')}` }));
    const r = simulateConsolidation(orders, { ...opts, rules: [PHONE_ONLY] });
    expect(r.groupsMergedByRules).toBe(15);
    expect(r.examples).toHaveLength(10);
  });
});
