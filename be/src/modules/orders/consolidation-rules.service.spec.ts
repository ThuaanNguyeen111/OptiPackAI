import { ConsolidationRulesService } from './consolidation-rules.service';
import { OrderSyncSettingsService } from './order-sync-settings.service';
import { DEFAULT_ORDER_SYNC_POLICY, MAX_CONSOLIDATION_RULES, OrderSyncPolicy } from './order-sync-policy';
import type { ConsolidationRule } from './order-sync-policy';
import { ORD_ERROR_CODES } from './orders.errors';
import { AppException } from '../../common/exceptions/app-exception';
import type { SaveConsolidationRuleDto } from './dto/consolidation-rule.dto';

//!=============================================
// 31/10/2026 — API quy tắc gộp: thêm / sửa / xoá + xung đột phiên bản.
//!=============================================

const RULE: ConsolidationRule = {
  id: '6720aaaaaaaaaaaaaaaaaaaa',
  name: 'Cùng SĐT + phường',
  sourceText: null,
  fields: [{ field: 'phone', match: 'normalized' }, { field: 'ward_name', match: 'normalized' }],
  platforms: [],
  maxWindowHours: null,
  enabled: true,
};

function body(overrides: Partial<SaveConsolidationRuleDto> = {}): SaveConsolidationRuleDto {
  return {
    expected_version: 3,
    name: 'Chỉ cùng SĐT',
    source_text: '  Gộp đơn cùng SĐT  ',
    fields: [{ field: 'phone', match: 'normalized' }],
    ...overrides,
  };
}

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return (e.getResponse() as { error_code?: string }).error_code ?? JSON.stringify(e.getResponse());
    throw e;
  }
  throw new Error('không ném lỗi');
}

describe('ConsolidationRulesService', () => {
  let policy: OrderSyncPolicy;
  let saveVersion: jest.Mock;
  let service: ConsolidationRulesService;

  beforeEach(() => {
    policy = JSON.parse(JSON.stringify(DEFAULT_ORDER_SYNC_POLICY)) as OrderSyncPolicy;
    policy.version = 3;
    policy.consolidation.rules = [{ ...RULE }];
    // Dùng clonePolicy / conflict thật để test đúng hành vi.
    const real = new OrderSyncSettingsService({} as never, {} as never, {} as never);
    saveVersion = jest.fn((_cur: OrderSyncPolicy, next: OrderSyncPolicy) =>
      Promise.resolve({ settings: { ...next, version: 4 }, recomputingKeys: true }),
    );
    const settings = {
      get: jest.fn(() => Promise.resolve(policy)),
      clonePolicy: (p: OrderSyncPolicy) => real.clonePolicy(p),
      conflict: (v: number | null) => real.conflict(v),
      saveVersion,
    };
    service = new ConsolidationRulesService(settings as never);
  });

  it('thêm quy tắc → id mới, câu gốc được trim, mặc định bật + mọi sàn, lưu phiên bản mới', async () => {
    const res = await service.create(body(), 'u1');
    expect(res.version).toBe(4);
    expect(res.recomputingKeys).toBe(true);
    expect(res.rules).toHaveLength(2);
    const added = res.rules[1];
    expect(added).toMatchObject({ name: 'Chỉ cùng SĐT', sourceText: 'Gộp đơn cùng SĐT', platforms: [], maxWindowHours: null, enabled: true });
    expect(added?.id).toMatch(/^[0-9a-f]{24}$/);
    const [, , note] = saveVersion.mock.calls[0] as [unknown, unknown, string];
    expect(note).toContain('Thêm quy tắc gộp');
  });

  it('expected_version lệch → 409 ORD_SYNC_SETTINGS_CONFLICT, không lưu', async () => {
    expect(await errorCode(service.create(body({ expected_version: 2 }), 'u1'))).toBe(ORD_ERROR_CODES.SYNC_SETTINGS_CONFLICT);
    expect(saveVersion).not.toHaveBeenCalled();
  });

  it('quy tắc quá rộng (chỉ cùng tỉnh) → 400 ORD_CONSOLIDATION_RULE_INVALID', async () => {
    const code = await errorCode(service.create(body({ fields: [{ field: 'province_name', match: 'normalized' }] }), 'u1'));
    expect(code).toBe(ORD_ERROR_CODES.CONSOLIDATION_RULE_INVALID);
  });

  it(`đã đủ ${String(MAX_CONSOLIDATION_RULES)} quy tắc → ORD_CONSOLIDATION_RULE_LIMIT`, async () => {
    policy.consolidation.rules = Array.from({ length: MAX_CONSOLIDATION_RULES }, (_, i) => ({ ...RULE, id: `6720${String(i).padStart(20, '0')}` }));
    expect(await errorCode(service.create(body(), 'u1'))).toBe(ORD_ERROR_CODES.CONSOLIDATION_RULE_LIMIT);
  });

  it('sửa quy tắc → giữ nguyên id, thay toàn bộ nội dung', async () => {
    const res = await service.update(RULE.id, body({ name: 'Đổi tên', enabled: false }), 'u1');
    expect(res.rules).toEqual([expect.objectContaining({ id: RULE.id, name: 'Đổi tên', enabled: false, fields: [{ field: 'phone', match: 'normalized' }] })]);
    // Bản đang hiệu lực không bị sửa tại chỗ (clone trước khi đổi).
    expect(policy.consolidation.rules[0]?.name).toBe(RULE.name);
  });

  it('sửa / xoá id không tồn tại → 404 ORD_CONSOLIDATION_RULE_NOT_FOUND', async () => {
    expect(await errorCode(service.update('6720ffffffffffffffffffff', body(), 'u1'))).toBe(ORD_ERROR_CODES.CONSOLIDATION_RULE_NOT_FOUND);
    expect(await errorCode(service.remove('6720ffffffffffffffffffff', 3, 'u1'))).toBe(ORD_ERROR_CODES.CONSOLIDATION_RULE_NOT_FOUND);
  });

  it('xoá quy tắc → danh sách rỗng, ghi chú có tên quy tắc', async () => {
    const res = await service.remove(RULE.id, 3, 'u1');
    expect(res.rules).toEqual([]);
    const [, , note] = saveVersion.mock.calls[0] as [unknown, unknown, string];
    expect(note).toContain(RULE.name);
  });
});
