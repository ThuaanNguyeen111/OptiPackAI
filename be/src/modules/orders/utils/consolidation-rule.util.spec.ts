import type { ConsolidationRule } from '../order-sync-policy';
import {
  computeRuleKey,
  computeRuleKeys,
  ruleIdOfKey,
  ruleKeySignature,
  validateConsolidationRule,
  validateConsolidationRules,
} from './consolidation-rule.util';
import type { RuleKeyOrderInput } from './consolidation-rule.util';

//!=============================================
// 31/10/2026 — quy tắc gộp bổ sung: bảng tình huống (GUIDE_DOC/CONSOLIDATION_RULES_DESIGN.md)
//!=============================================

function rule(overrides: Partial<ConsolidationRule> = {}): ConsolidationRule {
  return {
    id: '6720aaaaaaaaaaaaaaaaaaaa',
    name: 'Cùng SĐT + phường',
    sourceText: 'Gộp đơn cùng SĐT và cùng phường, khác tên vẫn gộp',
    fields: [
      { field: 'phone', match: 'normalized' },
      { field: 'ward_name', match: 'normalized' },
    ],
    platforms: [],
    maxWindowHours: null,
    enabled: true,
    ...overrides,
  };
}

function order(overrides: Partial<RuleKeyOrderInput> = {}, recipient: RuleKeyOrderInput['recipient'] = {}): RuleKeyOrderInput {
  return {
    platform: 'aurelle',
    platform_order_id: 'AU-' + Math.random().toString(36).slice(2, 8),
    delivery_option: 'standard',
    ...overrides,
    recipient: {
      full_name: 'Nguyễn Văn An',
      phone: '0901234567',
      address_line1: '12 Lê Lợi, Phường Bến Nghé',
      city: 'Hồ Chí Minh',
      province_name: 'Hồ Chí Minh',
      district_name: 'Quận 1',
      ward_name: 'Phường Bến Nghé',
      ...recipient,
    },
  };
}

describe('computeRuleKey — bảng tình huống', () => {
  const r = rule();

  it.each<[string, RuleKeyOrderInput, RuleKeyOrderInput, boolean]>([
    ['khác tên, cùng SĐT + phường → cùng khoá', order(), order({}, { full_name: 'Trần Thị Bình' }), true],
    ['SĐT khác định dạng (+84 / khoảng trắng) → cùng khoá', order(), order({}, { phone: '+84 901 234 567' }), true],
    ['phường gõ không dấu, hoa thường khác → cùng khoá', order(), order({}, { ward_name: 'phuong BEN nghe' }), true],
    ['khác phường → khác khoá', order(), order({}, { ward_name: 'Phường Đa Kao' }), false],
    ['khác SĐT → khác khoá', order(), order({}, { phone: '0907654321' }), false],
    ['khác sàn → khác khoá', order(), order({ platform: 'lazada' }), false],
  ])('%s', (_label, a, b, same) => {
    const ka = computeRuleKey(a, r);
    const kb = computeRuleKey(b, r);
    expect(ka).not.toBeNull();
    expect(kb).not.toBeNull();
    expect(ka === kb).toBe(same);
  });

  it.each<[string, RuleKeyOrderInput, ConsolidationRule]>([
    ['SĐT bị che (Lazada "8**5")', order({ platform: 'lazada' }, { phone: '8**5' }), r],
    ['SĐT quá ngắn', order({}, { phone: '12345' }), r],
    ['phường bị che', order({}, { ward_name: 'P***g B**n N**' }), r],
    ['phường trống', order({}, { ward_name: '   ' }), r],
    ['phường null (đơn cũ trước 08/10)', order({}, { ward_name: null }), r],
    ['đơn hỏa tốc', order({ delivery_option: 'express' }), r],
    ['đơn đổi hàng EXC-', order({ platform_order_id: 'EXC-RMA0001' }), r],
    ['quy tắc đang tắt', order(), rule({ enabled: false })],
    ['quy tắc chỉ áp cho Lazada, đơn AURELLE', order(), rule({ platforms: ['lazada'] })],
  ])('không sinh khoá: %s', (_label, o, ru) => {
    expect(computeRuleKey(o, ru)).toBeNull();
  });

  it('exact phân biệt dấu, normalized thì không', () => {
    const byName = (match: 'exact' | 'normalized'): ConsolidationRule =>
      rule({ fields: [{ field: 'phone', match: 'normalized' }, { field: 'full_name', match }] });
    const a = order({}, { full_name: 'Nguyễn Văn An' });
    const b = order({}, { full_name: 'nguyen van an' });
    expect(computeRuleKey(a, byName('normalized'))).toBe(computeRuleKey(b, byName('normalized')));
    expect(computeRuleKey(a, byName('exact'))).not.toBe(computeRuleKey(b, byName('exact')));
  });

  it('thứ tự Admin chọn trường không đổi khoá', () => {
    const reversed = rule({ fields: [...r.fields].reverse() });
    expect(computeRuleKey(order(), reversed)).toBe(computeRuleKey(order(), r));
  });

  it('2 quy tắc cùng trường nhưng khác id → khác khoá (không gộp chéo quy tắc)', () => {
    const other = rule({ id: '6720bbbbbbbbbbbbbbbbbbbb' });
    expect(computeRuleKey(order(), other)).not.toBe(computeRuleKey(order(), r));
  });

  it('khoá mang tiền tố rule id', () => {
    const key = computeRuleKey(order(), r);
    expect(key).not.toBeNull();
    expect(ruleIdOfKey(key ?? '')).toBe(r.id);
  });
});

describe('computeRuleKeys — nhiều quy tắc', () => {
  const byPhone = rule({ id: '6720cccccccccccccccccccc', name: 'Chỉ SĐT', fields: [{ field: 'phone', match: 'normalized' }] });
  const byAddress = rule({ id: '6720dddddddddddddddddddd', name: 'Cùng địa chỉ', fields: [{ field: 'address_line1', match: 'normalized' }] });

  it('mỗi quy tắc áp được → 1 khoá, theo thứ tự quy tắc', () => {
    const keys = computeRuleKeys(order(), [byPhone, byAddress]);
    expect(keys.map(ruleIdOfKey)).toEqual([byPhone.id, byAddress.id]);
  });

  it('SĐT bị che → chỉ còn khoá của quy tắc địa chỉ', () => {
    const keys = computeRuleKeys(order({}, { phone: '09******67' }), [byPhone, byAddress]);
    expect(keys.map(ruleIdOfKey)).toEqual([byAddress.id]);
  });

  it('chưa có quy tắc → rỗng (chạy y như trước)', () => {
    expect(computeRuleKeys(order(), [])).toEqual([]);
  });
});

describe('ruleKeySignature', () => {
  it('đổi tên / câu gốc / giới hạn thời gian không cần tính lại khoá', () => {
    const a = rule();
    const b = rule({ name: 'Tên mới', sourceText: null, maxWindowHours: 6 });
    expect(ruleKeySignature([a])).toBe(ruleKeySignature([b]));
  });

  it('đổi trường hoặc tắt quy tắc → phải tính lại', () => {
    const a = rule();
    expect(ruleKeySignature([a])).not.toBe(ruleKeySignature([rule({ fields: [{ field: 'phone', match: 'normalized' }] })]));
    expect(ruleKeySignature([a])).not.toBe(ruleKeySignature([rule({ enabled: false })]));
  });
});

describe('validateConsolidationRule — giới hạn an toàn', () => {
  it('quy tắc hợp lệ → không lỗi', () => {
    expect(validateConsolidationRule(rule())).toEqual([]);
  });

  it.each<[string, Partial<ConsolidationRule>]>([
    ['chỉ cùng tỉnh', { fields: [{ field: 'province_name', match: 'normalized' }] }],
    ['chỉ tên + phường', { fields: [{ field: 'full_name', match: 'normalized' }, { field: 'ward_name', match: 'normalized' }] }],
    ['không chọn trường', { fields: [] }],
    ['trùng trường', { fields: [{ field: 'phone', match: 'normalized' }, { field: 'phone', match: 'exact' }] }],
    ['tên trống', { name: '  ' }],
    ['sàn không hỗ trợ', { platforms: ['shopee'] }],
    ['giới hạn thời gian 0 giờ', { maxWindowHours: 0 }],
    ['giới hạn thời gian quá 720 giờ', { maxWindowHours: 721 }],
  ])('từ chối: %s', (_label, overrides) => {
    expect(validateConsolidationRule(rule(overrides)).length).toBeGreaterThan(0);
  });

  it('quá 10 quy tắc hoặc trùng id → lỗi', () => {
    const many = Array.from({ length: 11 }, (_, i) => rule({ id: `6720${String(i).padStart(20, '0')}` }));
    expect(validateConsolidationRules(many).some((e) => e.includes('Tối đa'))).toBe(true);
    expect(validateConsolidationRules([rule(), rule()]).some((e) => e.includes('trùng'))).toBe(true);
  });
});
