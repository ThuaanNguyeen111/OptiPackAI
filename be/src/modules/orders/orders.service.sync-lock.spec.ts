import { OrdersService, type SyncResult } from './orders.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

//!=============================================
// AOFP-330 AC4 (19/11/2026) — webhook + cron cùng đồng bộ 1 shop: chỉ 1 lượt chạy một lúc;
// lượt đến sau được xếp chạy lại ngay sau lượt đang chạy (không mất đơn), Redis lỗi thì chạy không khoá.
//!=============================================
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    acquireLock: jest.fn((key: string) => {
      if (store.has(key)) return Promise.resolve(null);
      store.set(key, 'tok');
      return Promise.resolve('tok');
    }),
    releaseLock: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    setFlag: jest.fn((key: string) => {
      store.set(key, '1');
      return Promise.resolve();
    }),
    takeFlag: jest.fn((key: string) => Promise.resolve(store.delete(key))),
  };
}

describe('OrdersService.syncShopOrders — khoá theo shop (AOFP-330)', () => {
  const one: SyncResult = { fetched: 1, upserted: 1, newlyConsolidated: 0 };

  function build(redis: unknown) {
    const service = new OrdersService({} as never, {} as never, {}, {} as never, {} as never, redis as never);
    const run = jest.spyOn(service as unknown as { runShopSync: () => Promise<SyncResult> }, 'runShopSync');
    return { service, run };
  }

  it('lượt thứ 2 đến khi lượt 1 đang chạy → trả queued, lượt 1 chạy thêm đúng 1 lần', async () => {
    const redis = fakeRedis();
    const { service, run } = build(redis);
    let second: Promise<SyncResult> | undefined;
    run.mockImplementationOnce(async () => {
      second = service.syncShopOrders(MarketplacePlatform.AURELLE, 'S1');
      await second;
      return one;
    }).mockResolvedValueOnce(one);

    const first = await service.syncShopOrders(MarketplacePlatform.AURELLE, 'S1');

    expect(await second).toMatchObject({ queued: true, fetched: 0 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(first.fetched).toBe(2);
    expect(redis.store.size).toBe(0); // khoá đã nhả, cờ đã lấy
  });

  it('Redis lỗi → vẫn đồng bộ (không khoá)', async () => {
    const redis = fakeRedis();
    redis.acquireLock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { service, run } = build(redis);
    run.mockResolvedValueOnce(one);
    await expect(service.syncShopOrders(MarketplacePlatform.AURELLE, 'S1')).resolves.toEqual(one);
  });

  it('lượt đồng bộ lỗi → vẫn nhả khoá', async () => {
    const redis = fakeRedis();
    const { service, run } = build(redis);
    run.mockRejectedValueOnce(new Error('sàn 500'));
    await expect(service.syncShopOrders(MarketplacePlatform.AURELLE, 'S1')).rejects.toThrow('sàn 500');
    expect(redis.store.size).toBe(0);
  });
});
