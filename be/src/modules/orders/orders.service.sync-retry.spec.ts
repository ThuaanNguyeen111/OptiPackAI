import { Types } from 'mongoose';
import { OrdersService, SYNC_FAILURE_ALERT_AFTER } from './orders.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { UserRole } from '../../common/enums/user-role.enum';

jest.mock('./mappers/lazada-order.mapper', () => ({
  ...jest.requireActual<object>('./mappers/lazada-order.mapper'),
  mapLazadaOrder: (raw: { order_id: number }) => ({ platform_order_id: String(raw.order_id) }),
}));

//!=============================================
// AOFP-320 — đơn lỗi tạm thời (GetOrderItems / map) không được bị bỏ sót: mốc last_polled_at
// chỉ tiến tới ngay trước đơn lỗi để lượt sau kéo lại; lỗi liên tục đủ lượt thì báo ADMIN.
//!=============================================
describe('OrdersService.syncShopOrders — thử lại đơn lỗi', () => {
  const lastPolled = new Date('2026-11-19T00:00:00Z');
  const raws = [
    { order_id: 1, updated_at: '2026-11-19T01:00:00Z' },
    { order_id: 2, updated_at: '2026-11-19T02:00:00Z' },
    { order_id: 3, updated_at: '2026-11-19T03:00:00Z' },
  ];
  let shop: { _id: Types.ObjectId; last_polled_at: Date | null; sync_failures?: { order_id: string; count: number; last_error: string }[] };
  let failB: boolean;
  let integration: Record<'getConnectedShop' | 'getValidAccessToken' | 'markShopPolled', jest.Mock>;
  let notify: jest.Mock;
  let service: OrdersService;
  let ingested: string[];

  beforeEach(() => {
    shop = { _id: new Types.ObjectId(), last_polled_at: lastPolled };
    failB = true;
    ingested = [];
    integration = {
      getConnectedShop: jest.fn(() => Promise.resolve(shop)),
      getValidAccessToken: jest.fn().mockResolvedValue('tok'),
      // lưu lại như DB thật để lượt sau đọc mốc + bộ đếm lỗi mới
      markShopPolled: jest.fn((_id: Types.ObjectId, at: Date, failures?: { order_id: string; count: number; last_error: string }[]) => {
        shop = { ...shop, last_polled_at: at, ...(failures ? { sync_failures: failures } : {}) };
        return Promise.resolve();
      }),
    };
    const getOrders = jest.fn((_t: string, f: { updatedAfter: Date }) =>
      Promise.resolve(raws.filter((r) => new Date(r.updated_at) > f.updatedAfter)),
    );
    const getOrderItems = jest.fn((_t: string, id: number) =>
      id === 2 && failB ? Promise.reject(new Error('timeout GetOrderItems')) : Promise.resolve([]),
    );
    notify = jest.fn().mockResolvedValue({});
    service = new OrdersService({} as never, integration as never, { lazada: { getOrders, getOrderItems } } as never, { notify } as never, {} as never);
    jest.spyOn(service, 'ingestMappedOrder').mockImplementation((_p, _s, _m, mapped) => {
      ingested.push(mapped.platform_order_id);
      return Promise.resolve({ order: {} as never, consolidated: false });
    });
    jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
  });

  const sync = (): Promise<unknown> => service.syncShopOrders(MarketplacePlatform.LAZADA, 'shop-1');

  it('AC1 — B lỗi lượt 1 → mốc dừng ngay trước B; lượt 2 B được kéo lại và vào hệ thống', async () => {
    await sync();
    expect(ingested).toEqual(['1', '3']);
    expect(shop.last_polled_at).toEqual(new Date('2026-11-19T01:59:59Z'));
    expect(shop.sync_failures).toEqual([{ order_id: '2', count: 1, last_error: expect.stringContaining('timeout') as string }]);

    failB = false;
    ingested = [];
    await sync();
    expect(ingested).toEqual(['2', '3']);
    expect(shop.sync_failures).toEqual([]);
    expect((shop.last_polled_at?.getTime() ?? 0)).toBeGreaterThan(Date.now() - 60_000);
  });

  it(`AC2 — B lỗi liên tục ${String(SYNC_FAILURE_ALERT_AFTER)} lượt → báo ADMIN đúng 1 lần, rồi thôi giữ mốc`, async () => {
    for (let i = 0; i < SYNC_FAILURE_ALERT_AFTER; i += 1) await sync();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientRole: UserRole.ADMIN,
      message: expect.stringMatching(/^Đơn 2 không đồng bộ được: .*timeout GetOrderItems/) as string,
    }));
    // lượt thứ 5 không giữ mốc nữa (tránh kéo lại mãi một đơn hỏng)
    expect((shop.last_polled_at?.getTime() ?? 0)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('AC3 — không đơn lỗi → mốc tiến tới lúc bắt đầu lượt như cũ', async () => {
    failB = false;
    const before = Date.now();
    await sync();
    expect(ingested).toEqual(['1', '2', '3']);
    expect((shop.last_polled_at?.getTime() ?? 0)).toBeGreaterThanOrEqual(before - 5);
    expect(shop.sync_failures).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });
});
