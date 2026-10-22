import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { PackingJobService, skusFromProfileFailure } from '../packing/packing-job.service';
import { ProductMasterService } from '../product-master/product-master.service';
import { ProductCategory } from '../../common/enums/product-category.enum';

/**
 * 22/10/2026 — nhóm kẹt đóng gói vì SKU chưa đo, tên người đóng, tự tính lại thiếu hàng,
 * tìm nhóm theo đuôi mã / mã đơn sàn.
 */
interface Chain {
  select: jest.Mock<Chain>;
  sort: jest.Mock<Chain>;
  limit: jest.Mock<Chain>;
  lean: jest.Mock<Promise<unknown>>;
}

function chain(value: unknown): Chain {
  const self: Chain = {
    select: jest.fn(() => self),
    sort: jest.fn(() => self),
    limit: jest.fn(() => self),
    lean: jest.fn(() => Promise.resolve(value)),
  };
  return self;
}

function makeService(models: {
  groupModel?: Record<string, unknown>;
  orderModel?: Record<string, unknown>;
  productMasterModel?: Record<string, unknown>;
  userModel?: Record<string, unknown>;
  planModel?: Record<string, unknown>;
}): OrderGroupsService {
  return new OrderGroupsService(
    (models.groupModel ?? {}) as never,
    (models.orderModel ?? {}) as never,
    (models.productMasterModel ?? {}) as never,
    {} as never,
    {} as never,
    (models.userModel ?? {}) as never,
    (models.planModel ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

const ready = {
  seller_sku: 'A',
  packaging_profile_status: 'ready',
  is_fragile: false,
  dimension: { package_length_cm: 30, package_width_cm: 20, package_height_cm: 5, package_weight_kg: 0.4 },
};

describe('Nhóm kẹt đóng gói vì SKU chưa đo', () => {
  it('markPackingBlocked: true khi vừa chuyển sang kẹt (để báo 1 lần), false khi đã kẹt từ trước', async () => {
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce(chain({ packing_blocked_reason: null }))
      .mockReturnValueOnce(chain({ packing_blocked_reason: 'needs_measurement' }));
    const service = makeService({ groupModel: { findOneAndUpdate } });
    const id = new Types.ObjectId().toString();
    expect(await service.markPackingBlocked(id, 'needs_measurement', ['SLL-BRN-37'])).toBe(true);
    expect(await service.markPackingBlocked(id, 'needs_measurement', ['SLL-BRN-37'])).toBe(false);
    const update = (findOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }])[1];
    expect(update.$set).toMatchObject({ packing_blocked_reason: 'needs_measurement', packing_blocked_skus: ['SLL-BRN-37'] });
  });

  it('unreadyPackagingSkus: trả SKU chưa đo hoặc chưa có hồ sơ', async () => {
    const find = jest.fn(() => ({ lean: () => Promise.resolve([ready, { seller_sku: 'B', packaging_profile_status: 'needs_measurement' }]) }));
    const service = makeService({ productMasterModel: { find } });
    expect(await service.unreadyPackagingSkus(MarketplacePlatform.AURELLE, 'S1', ['A', 'B', 'C'])).toEqual(['B', 'C']);
  });

  it('skusFromProfileFailure: đọc danh sách SKU từ lý do kế hoạch hỏng cũ', () => {
    expect(skusFromProfileFailure('SKU SLL-BRN-37, X-1 chưa có hồ sơ đóng gói được kho xác nhận (đủ số đo và độ nhạy).')).toEqual(['SLL-BRN-37', 'X-1']);
    expect(skusFromProfileFailure('Lỗi khác')).toEqual([]);
    expect(skusFromProfileFailure(null)).toEqual([]);
  });

  it('PackingJobService.recheckBlocked: SKU đã đo → gỡ kế hoạch failed + xoá cờ; còn chưa đo mà nhóm cũ chưa có cờ → ghi cờ', async () => {
    const g1 = new Types.ObjectId();
    const g2 = new Types.ObjectId();
    const plans = [
      { _id: new Types.ObjectId(), order_group_id: g1, failure_reason: 'SKU A chưa có hồ sơ đóng gói được kho xác nhận.' },
      { _id: new Types.ObjectId(), order_group_id: g2, failure_reason: 'SKU B chưa có hồ sơ đóng gói được kho xác nhận.' },
    ];
    const planUpdate = jest.fn().mockResolvedValue({});
    const planModel = { find: jest.fn(() => chain(plans)), updateOne: planUpdate };
    const groups: Record<string, Record<string, unknown>> = {
      [g1.toString()]: { _id: g1, platform: 'aurelle', shop_id: 'S1', fulfillment_status: GroupFulfillmentStatus.PICKED, packing_blocked_reason: 'needs_measurement', packing_blocked_skus: ['A'] },
      [g2.toString()]: { _id: g2, platform: 'aurelle', shop_id: 'S1', fulfillment_status: GroupFulfillmentStatus.PICKED, packing_blocked_reason: null, packing_blocked_skus: [] },
    };
    const groupModel = { findById: jest.fn((id: Types.ObjectId) => chain(groups[id.toString()])) };
    const orderGroups = {
      unreadyPackagingSkus: jest.fn((_p: string, _s: string, skus: string[]) => Promise.resolve(skus.includes('B') ? ['B'] : [])),
      clearPackingBlocked: jest.fn().mockResolvedValue(undefined),
      markPackingBlocked: jest.fn().mockResolvedValue(true),
    };
    const job = new PackingJobService(groupModel as never, planModel as never, {} as never, {} as never, orderGroups as never);
    expect(await job.recheckBlocked()).toBe(1);
    expect(planUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: plans[0]?._id, status: 'failed' }),
      { $set: { is_active: false, status: 'superseded' } },
    );
    expect(orderGroups.clearPackingBlocked).toHaveBeenCalledWith(g1.toString());
    expect(orderGroups.markPackingBlocked).toHaveBeenCalledWith(g2.toString(), 'needs_measurement', ['B']);
  });

  it('ProductMasterService: xác nhận số đo → gỡ kế hoạch failed và cờ kẹt của nhóm đang chờ đúng SKU đó', async () => {
    const product = { _id: new Types.ObjectId(), platform: 'aurelle', shop_id: 'S1', seller_sku: 'SLL-BRN-37' };
    const groupId = new Types.ObjectId();
    const groupFind = jest.fn(() => chain([{ _id: groupId }]));
    const groupUpdateMany = jest.fn().mockResolvedValue({});
    const planUpdateMany = jest.fn().mockResolvedValue({});
    const service = new ProductMasterService(
      { findByIdAndUpdate: jest.fn().mockResolvedValue(product) } as never,
      {} as never,
      {} as never,
      {} as never,
      {},
      { find: groupFind, updateMany: groupUpdateMany } as never,
      { updateMany: planUpdateMany } as never,
    );
    await service.confirmPackagingProfile(product._id.toString(), new Types.ObjectId().toString(), {
      length_cm: 30, width_cm: 20, height_cm: 5, weight_kg: 0.4, is_fragile: false, orientation_rule: 'any', product_category: ProductCategory.T_SHIRT,
    });
    expect(groupFind).toHaveBeenCalledWith(expect.objectContaining({ packing_blocked_skus: 'SLL-BRN-37', fulfillment_status: GroupFulfillmentStatus.PICKED }));
    expect(planUpdateMany).toHaveBeenCalledWith(
      { order_group_id: { $in: [groupId] }, is_active: true, status: 'failed' },
      { $set: { is_active: false, status: 'superseded' } },
    );
    const [groupFilter, groupUpdate] = groupUpdateMany.mock.calls[0] as [Record<string, unknown>, { $set: Record<string, unknown> }];
    expect(groupFilter).toEqual({ _id: { $in: [groupId] } });
    expect(groupUpdate.$set).toEqual({ packing_blocked_reason: null, packing_blocked_skus: [], packing_blocked_at: null });
  });
});

describe('Tên người đóng gói của nhóm', () => {
  it('lấy tên lưu sẵn trên kế hoạch; kế hoạch cũ chưa có tên thì tra users', async () => {
    const g1 = new Types.ObjectId();
    const g2 = new Types.ObjectId();
    const p1 = new Types.ObjectId();
    const p2 = new Types.ObjectId();
    const planModel = {
      find: jest.fn(() => chain([
        { order_group_id: g1, assigned_packer_id: p1, assigned_packer_name: 'An' },
        { order_group_id: g2, assigned_packer_id: p2, assigned_packer_name: null },
      ])),
    };
    const userFind = jest.fn(() => chain([{ _id: p2, name: 'Bình' }]));
    const service = makeService({ planModel, userModel: { find: userFind } });
    const map = await service.getPackersForGroups([g1, g2]);
    expect(map.get(g1.toString())).toEqual({ id: p1.toString(), name: 'An' });
    expect(map.get(g2.toString())).toEqual({ id: p2.toString(), name: 'Bình' });
    expect(userFind).toHaveBeenCalledWith({ _id: { $in: [p2] } });
  });
});

describe('Tìm nhóm theo ?q=', () => {
  it('đuôi mã nhóm (hex) + mã đơn sàn khớp chính xác → $or; không khớp gì → [] mà không truy vấn nhóm', async () => {
    const groupId = new Types.ObjectId();
    const groupFind = jest.fn(() => chain([]));
    const distinct = jest.fn().mockResolvedValueOnce([groupId]).mockResolvedValueOnce([]);
    const service = makeService({ groupModel: { find: groupFind }, orderModel: { distinct } });

    await service.listOrderGroups({ q: '5beca05d93' });
    const query = (groupFind.mock.calls[0] as unknown as [{ $or: Record<string, unknown>[] }])[0];
    expect(query.$or).toEqual([
      { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: '5beca05d93$' } } },
      { _id: { $in: [groupId] } },
    ]);
    expect(distinct).toHaveBeenCalledWith('consolidated_group_id', expect.objectContaining({
      $or: [{ platform_order_id: { $in: ['5beca05d93', '5BECA05D93'] } }, { platform_order_number: { $in: ['5beca05d93', '5BECA05D93'] } }],
    }));

    expect(await service.listOrderGroups({ q: 'KHONG-CO' })).toEqual([]);
    expect(groupFind).toHaveBeenCalledTimes(1);
  });

  it('packingBlocked=true lọc nhóm có lý do kẹt', async () => {
    const groupFind = jest.fn(() => chain([]));
    const service = makeService({ groupModel: { find: groupFind } });
    await service.listOrderGroups({ packingBlocked: true });
    expect(groupFind).toHaveBeenCalledWith({ packing_blocked_reason: { $type: 'string' } });
  });
});

describe('Tự tính lại thiếu hàng khi có hàng về', () => {
  it('xoá nhãn cũ của nhóm đã lấy xong, tính lại nhóm còn giữ chỗ (cũ nhất trước), đếm nhóm đã đủ hàng', async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const find = jest.fn(() => chain([{ _id: a }, { _id: b }]));
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    const findById = jest.fn((id: Types.ObjectId) => chain({ stock_shortage: id.equals(b) }));
    const service = makeService({ groupModel: { find, updateMany, findById } });
    const reconcile = jest.spyOn(service, 'reconcileReservation').mockResolvedValue(undefined);

    const stats = await service.recheckShortageGroups('test');
    expect(stats).toEqual({ checked: 2, resolved: 1, cleared: 2 });
    expect(updateMany).toHaveBeenCalledWith(
      { stock_shortage: true, fulfillment_status: { $nin: [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.PICKING, GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW] } },
      { $set: { stock_shortage: false, stock_shortage_items: [] } },
    );
    expect(reconcile.mock.calls.map((c) => c[0])).toEqual([a.toString(), b.toString()]);
    const sorted = find.mock.results[0]?.value as { sort: jest.Mock };
    expect(sorted.sort).toHaveBeenCalledWith({ created_at: 1 });
  });

  it('scheduleShortageRecheck: đang chạy thì xếp đúng 1 lượt nữa, không chạy chồng', async () => {
    const service = makeService({});
    let release: () => void = () => undefined;
    const spy = jest
      .spyOn(service, 'recheckShortageGroups')
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => { resolve({ checked: 0, resolved: 0, cleared: 0 }); }; }))
      .mockResolvedValue({ checked: 0, resolved: 0, cleared: 0 });
    service.scheduleShortageRecheck('nhập 1');
    service.scheduleShortageRecheck('nhập 2');
    service.scheduleShortageRecheck('nhập 3');
    expect(spy).toHaveBeenCalledTimes(1);
    release();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
