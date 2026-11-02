import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { OrderStatus, UNFULFILLED_ORDER_STATUSES } from './enums/order-status.enum';
import { DEFAULT_ORDER_SYNC_POLICY, OrderSyncPolicy, setOrderSyncPolicy } from './order-sync-policy';
import type { ConsolidationRule } from './order-sync-policy';
import { OrderSyncSettingsService } from './order-sync-settings.service';
import { computeRuleKeys } from './utils/consolidation-rule.util';

//!=============================================
// 31/10/2026 — tryConsolidate + tính lại khoá khi có QUY TẮC GỘP BỔ SUNG.
//!=============================================

const PHONE_WARD: ConsolidationRule = {
  id: '6720aaaaaaaaaaaaaaaaaaaa',
  name: 'Cùng SĐT + phường',
  sourceText: null,
  fields: [
    { field: 'phone', match: 'normalized' },
    { field: 'ward_name', match: 'normalized' },
  ],
  platforms: [],
  maxWindowHours: 6,
  enabled: true,
};
const DISABLED: ConsolidationRule = { ...PHONE_WARD, id: '6720eeeeeeeeeeeeeeeeeeee', name: 'Đã tắt', enabled: false };

function policyWith(rules: ConsolidationRule[], windowHours: number | null = null): OrderSyncPolicy {
  const p = JSON.parse(JSON.stringify(DEFAULT_ORDER_SYNC_POLICY)) as OrderSyncPolicy;
  p.consolidation.rules = rules;
  p.consolidation.timeWindowHours = windowHours;
  return p;
}

afterEach(() => { setOrderSyncPolicy(DEFAULT_ORDER_SYNC_POLICY); });

describe('tryConsolidate — gộp theo khoá cơ bản HOẶC khoá quy tắc', () => {
  let orderModel: { find: jest.Mock; updateOne: jest.Mock };
  let service: OrdersService;
  const created = new Date('2026-10-31T12:00:00Z');
  const ruleKey = `${PHONE_WARD.id}:abc`;
  const order = {
    _id: new Types.ObjectId(),
    platform: 'aurelle',
    shop_id: 'shop-1',
    platform_order_id: 'AU-2',
    status: OrderStatus.PENDING,
    consolidation_key: 'base-2',
    consolidation_keys: [ruleKey, `${DISABLED.id}:zzz`, '6720ffffffffffffffffffff:gone'],
    consolidated_group_id: null,
    created_at: created,
  };
  const run = (): Promise<boolean> =>
    (service as unknown as { tryConsolidate(o: unknown): Promise<boolean> }).tryConsolidate(order);

  function mockCandidates(candidates: unknown[]): void {
    orderModel.find.mockReturnValue({ sort: () => ({ limit: jest.fn().mockResolvedValue(candidates) }) });
  }

  beforeEach(() => {
    orderModel = { find: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) };
    service = new OrdersService(orderModel as never, {} as never, {}, {} as never, { isGroupOpenForNewOrders: jest.fn().mockResolvedValue(true) } as never);
    mockCandidates([]);
  });

  it('$or có nhánh khoá cơ bản (giới hạn chung) + nhánh quy tắc đang bật (giới hạn riêng)', async () => {
    setOrderSyncPolicy(policyWith([PHONE_WARD, DISABLED], 48));
    await run();
    const [filter] = orderModel.find.mock.calls[0] as [{ status: unknown; platform: string; shop_id: string; $or: Record<string, unknown>[] }];
    expect(filter).toMatchObject({ platform: 'aurelle', shop_id: 'shop-1' });
    expect(filter.status).toEqual({ $in: UNFULFILLED_ORDER_STATUSES });
    expect(filter.$or).toEqual([
      { consolidation_key: 'base-2', created_at: { $gte: new Date(created.getTime() - 48 * 3_600_000) } },
      { consolidation_keys: ruleKey, created_at: { $gte: new Date(created.getTime() - 6 * 3_600_000) } },
    ]);
  });

  it('quy tắc không có giới hạn riêng → dùng giới hạn chung; không giới hạn chung → không lọc thời gian', async () => {
    setOrderSyncPolicy(policyWith([{ ...PHONE_WARD, maxWindowHours: null }], null));
    await run();
    const [filter] = orderModel.find.mock.calls[0] as [{ $or: Record<string, unknown>[] }];
    expect(filter.$or).toEqual([{ consolidation_key: 'base-2' }, { consolidation_keys: ruleKey }]);
  });

  it('chưa có quy tắc → chỉ nhánh khoá cơ bản (hành vi cũ)', async () => {
    setOrderSyncPolicy(policyWith([]));
    await run();
    const [filter] = orderModel.find.mock.calls[0] as [{ $or: Record<string, unknown>[] }];
    expect(filter.$or).toEqual([{ consolidation_key: 'base-2' }]);
  });

  it('khớp qua quy tắc (khác khoá cơ bản, ví dụ khác tên) → gộp vào nhóm của đơn đó', async () => {
    setOrderSyncPolicy(policyWith([PHONE_WARD]));
    const groupId = new Types.ObjectId();
    mockCandidates([{ _id: new Types.ObjectId(), platform_order_id: 'AU-1', consolidation_key: 'base-1', consolidation_keys: [ruleKey], consolidated_group_id: groupId }]);
    expect(await run()).toBe(true);
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: order._id },
      { $set: { is_consolidated: true, consolidated_group_id: groupId } },
    );
  });
});

describe('recomputeConsolidationKeys — tính lại cả khoá quy tắc', () => {
  it('đơn chưa xong được ghi consolidation_keys mới; đơn hỏa tốc nhận []', async () => {
    const recipient = { full_name: 'An', phone: '0901234567', address_line1: '12 Lê Lợi', city: 'HCM', ward_name: 'Phường Bến Nghé' };
    const normal = { _id: new Types.ObjectId(), platform: 'aurelle', shop_id: 's', platform_order_id: 'AU-1', recipient, consolidation_key: 'x', consolidation_keys: [] };
    const express = { ...normal, _id: new Types.ObjectId(), platform_order_id: 'AU-2', delivery_option: 'express', consolidation_keys: ['old:1'] };
    const batches = [[normal, express], []];
    const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: () => Promise.resolve(batches.shift() ?? []) };
    const orderModel = { find: jest.fn(() => chain), bulkWrite: jest.fn().mockResolvedValue({}) };
    const service = new OrderSyncSettingsService({} as never, orderModel as never, {} as never);

    const n = await service.recomputeConsolidationKeys(['phone', 'address_line1', 'city'], [PHONE_WARD]);

    expect(n).toBe(2);
    const [ops] = orderModel.bulkWrite.mock.calls[0] as [{ updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { consolidation_keys: string[] } } } }[]];
    const byId = new Map(ops.map((o) => [o.updateOne.filter._id.toString(), o.updateOne.update.$set.consolidation_keys]));
    expect(byId.get(normal._id.toString())).toEqual(computeRuleKeys(normal, [PHONE_WARD]));
    expect(byId.get(normal._id.toString())).toHaveLength(1);
    expect(byId.get(express._id.toString())).toEqual([]);
  });
});
