import { Types } from 'mongoose';
import { PackingPlanService } from './packing-plan.service';
import type { PackingPlanDocument } from './schemas/packing-plan.schema';

describe('PackingPlanService.isProfileStale', () => {
  const groupId = new Types.ObjectId();
  const created = new Date('2026-10-23T08:00:00Z');
  let exists: jest.Mock;
  let findOrderGroupById: jest.Mock;
  let service: PackingPlanService;

  const plan = (over: Record<string, unknown> = {}): PackingPlanDocument =>
    ({
      order_group_id: groupId,
      status: 'ready',
      created_at: created,
      item_profiles: [{ sku: 'QUAN-1' }, { sku: 'AO-1' }],
      ...over,
    }) as unknown as PackingPlanDocument;

  beforeEach(() => {
    exists = jest.fn(() => ({ lean: () => Promise.resolve(null) }));
    findOrderGroupById = jest.fn(() => Promise.resolve({ platform: 'lazada', shop_id: 's1' }));
    service = new PackingPlanService(
      {} as never,
      {} as never,
      { findOrderGroupById } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { exists } as never,
    );
  });

  it('có hồ sơ xác nhận SAU lúc tính → true; truy vấn đúng sàn/shop/SKU/mốc thời gian', async () => {
    exists.mockReturnValue({ lean: () => Promise.resolve({ _id: new Types.ObjectId() }) });
    await expect(service.isProfileStale(plan())).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith({
      platform: 'lazada',
      shop_id: 's1',
      seller_sku: { $in: ['QUAN-1', 'AO-1'] },
      profile_confirmed_at: { $gt: created },
    });
  });

  it('không hồ sơ nào mới hơn → false', async () => {
    await expect(service.isProfileStale(plan())).resolves.toBe(false);
  });

  it('kế hoạch approved vẫn xét', async () => {
    exists.mockReturnValue({ lean: () => Promise.resolve({ _id: new Types.ObjectId() }) });
    await expect(service.isProfileStale(plan({ status: 'approved' }))).resolves.toBe(true);
  });

  it.each(['packing', 'packed', 'failed', 'rejected', 'superseded', 'computing'])(
    'kế hoạch %s → false, không truy vấn',
    async (status) => {
      await expect(service.isProfileStale(plan({ status }))).resolves.toBe(false);
      expect(exists).not.toHaveBeenCalled();
    },
  );

  it('không có SKU hoặc thiếu created_at → false, không truy vấn', async () => {
    await expect(service.isProfileStale(plan({ item_profiles: [] }))).resolves.toBe(false);
    await expect(service.isProfileStale(plan({ created_at: undefined }))).resolves.toBe(false);
    expect(exists).not.toHaveBeenCalled();
  });

  it('thiếu model ProductMaster (service dựng không có) → false', async () => {
    const bare = new PackingPlanService(
      {} as never, {} as never, { findOrderGroupById } as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    await expect(bare.isProfileStale(plan())).resolves.toBe(false);
  });
});
