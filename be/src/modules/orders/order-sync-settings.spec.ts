import { Types } from 'mongoose';
import { OrderSyncSettingsService } from './order-sync-settings.service';
import {
  DEFAULT_ORDER_SYNC_POLICY,
  OrderSyncPolicy,
  notPackableStatuses,
  orderSyncPolicy,
  setOrderSyncPolicy,
} from './order-sync-policy';
import { NOT_PACKABLE_ORDER_STATUSES, OrderStatus, UNFULFILLED_ORDER_STATUSES } from './enums/order-status.enum';
import { ORD_ERROR_CODES } from './orders.errors';
import { computeConsolidationKey, computeConsolidationKeyFor } from './utils/consolidation-key.util';
import { OrdersService } from './orders.service';
import { LazadaOrderSyncScheduler } from './lazada-order-sync.scheduler';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

//!=============================================
// 15/10/2026 — tiêu chí đồng bộ & gom đơn do Admin cấu hình.
//!=============================================

function policyWith(patch: (p: OrderSyncPolicy) => void): OrderSyncPolicy {
  const p: OrderSyncPolicy = JSON.parse(JSON.stringify(DEFAULT_ORDER_SYNC_POLICY)) as OrderSyncPolicy;
  patch(p);
  return p;
}

afterEach(() => { setOrderSyncPolicy(DEFAULT_ORDER_SYNC_POLICY); });

describe('Mặc định = đúng giá trị cũ trong code (chưa ai lưu thì hành vi không đổi)', () => {
  it('trạng thái gom / không đóng gói trùng hằng số cũ', () => {
    expect(orderSyncPolicy().statuses.consolidatable).toEqual(UNFULFILLED_ORDER_STATUSES);
    expect(notPackableStatuses()).toEqual(NOT_PACKABLE_ORDER_STATUSES);
    expect(orderSyncPolicy().sync).toMatchObject({ intervalMinutes: 5, firstSyncLookbackDays: 30, syncFailedCooldownMinutes: 20 });
  });

  it('khoá gom với bộ trường mặc định ra ĐÚNG khoá cũ (dữ liệu đã lưu vẫn khớp)', () => {
    const r = { full_name: 'Nguyễn Văn A', phone: '0901234567', address_line1: '12 Lê Lợi', city: 'Phường Bến Thành' };
    expect(computeConsolidationKeyFor('lazada', r, ['phone', 'address_line1', 'city'])).toBe(
      computeConsolidationKey('lazada', r.phone, r.address_line1, r.city),
    );
  });

  it('thêm tên người nhận vào trường gom → 2 người khác tên cùng địa chỉ không còn cùng khoá', () => {
    const a = { full_name: 'An', phone: '0901', address_line1: '12 Lê Lợi', city: 'HCM' };
    const b = { ...a, full_name: 'Bình' };
    expect(computeConsolidationKeyFor('lazada', a, ['phone', 'address_line1', 'city'])).toBe(
      computeConsolidationKeyFor('lazada', b, ['phone', 'address_line1', 'city']),
    );
    expect(computeConsolidationKeyFor('lazada', a, ['phone', 'address_line1', 'full_name'])).not.toBe(
      computeConsolidationKeyFor('lazada', b, ['phone', 'address_line1', 'full_name']),
    );
  });
});

describe('OrderSyncSettingsService.update — ràng buộc nghiệp vụ', () => {
  let settingsModel: { findOne: jest.Mock; create: jest.Mock; updateMany: jest.Mock; find: jest.Mock };
  let service: OrderSyncSettingsService;

  beforeEach(() => {
    const lean = jest.fn().mockResolvedValue(null);
    settingsModel = {
      findOne: jest.fn().mockReturnValue({ sort: () => ({ lean, select: () => ({ lean }) }) }),
      create: jest.fn().mockResolvedValue([{}]),
      updateMany: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()), endSession: jest.fn() };
    service = new OrderSyncSettingsService(settingsModel as never, {} as never, { startSession: jest.fn().mockResolvedValue(session) } as never);
  });

  const cases: [string, Record<string, unknown>][] = [
    ['gom chỉ theo tên + thành phố', { consolidation_key_fields: ['full_name', 'city'] }],
    ['gom cả đơn đã giao', { consolidatable_statuses: [OrderStatus.PENDING, OrderStatus.DELIVERED] }],
    ['bỏ "canceled" khỏi danh sách không đóng gói', { not_packable_statuses: [OrderStatus.LOST] }],
    ['coi "pending" là không đóng gói được', { not_packable_statuses: [OrderStatus.CANCELED, OrderStatus.PENDING] }],
  ];
  it.each(cases)('%s → ORD_SYNC_SETTINGS_INVALID, không lưu', async (_name, dto) => {
    await expect(service.update(dto, new Types.ObjectId().toString())).rejects.toMatchObject({
      errorCode: ORD_ERROR_CODES.SYNC_SETTINGS_INVALID,
    });
    expect(settingsModel.create).not.toHaveBeenCalled();
  });

  it('expected_version lệch → ORD_SYNC_SETTINGS_CONFLICT', async () => {
    await expect(service.update({ expected_version: 3 }, 'u')).rejects.toMatchObject({
      errorCode: ORD_ERROR_CODES.SYNC_SETTINGS_CONFLICT,
    });
  });

  it('hợp lệ → tạo phiên bản 1, trường không gửi giữ giá trị mặc định', async () => {
    await service.update({ interval_minutes: 15, platforms: [{ platform: 'aurelle', auto_sync_enabled: false }] }, new Types.ObjectId().toString());
    const [docs] = settingsModel.create.mock.calls[0] as [Record<string, unknown>[]];
    expect(docs[0]).toMatchObject({
      version: 1,
      interval_minutes: 15,
      first_sync_lookback_days: 30,
      consolidation_key_fields: ['phone', 'address_line1', 'city'],
      platforms: [
        { platform: 'lazada', auto_sync_enabled: true },
        { platform: 'aurelle', auto_sync_enabled: false },
      ],
    });
  });
});

describe('OrdersService.tryConsolidate theo tiêu chí', () => {
  let orderModel: { find: jest.Mock; updateOne: jest.Mock };
  let service: OrdersService;
  const order = {
    _id: new Types.ObjectId(),
    platform: 'lazada',
    shop_id: 'shop-1',
    status: OrderStatus.PENDING,
    consolidation_key: 'k',
    consolidated_group_id: null,
    created_at: new Date('2026-10-15T10:00:00Z'),
  };
  const run = (): Promise<boolean> =>
    (service as unknown as { tryConsolidate(o: unknown): Promise<boolean> }).tryConsolidate(order);

  beforeEach(() => {
    orderModel = {
      find: jest.fn().mockReturnValue({ sort: () => ({ limit: jest.fn().mockResolvedValue([]) }) }),
      updateOne: jest.fn(),
    };
    service = new OrdersService(orderModel as never, {} as never, {}, {} as never, { isGroupOpenForNewOrders: jest.fn() } as never);
  });

  it('tắt gom → không truy vấn, không gom', async () => {
    setOrderSyncPolicy(policyWith((p) => (p.consolidation.enabled = false)));
    expect(await run()).toBe(false);
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('trạng thái không nằm trong danh sách được gom → không gom', async () => {
    setOrderSyncPolicy(policyWith((p) => (p.statuses.consolidatable = [OrderStatus.UNPAID])));
    expect(await run()).toBe(false);
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('giới hạn 24 giờ → chỉ tìm đơn vào hệ thống từ 24 giờ trước; vẫn giữ điều kiện của partial index', async () => {
    setOrderSyncPolicy(policyWith((p) => (p.consolidation.timeWindowHours = 24)));
    await run();
    const [filter] = orderModel.find.mock.calls[0] as [{ status: unknown; $or: Record<string, unknown>[] }];
    expect(filter.status).toEqual({ $in: UNFULFILLED_ORDER_STATUSES });
    // 31/10/2026 — giới hạn thời gian chung nằm trong nhánh $or của khoá cơ bản.
    expect(filter.$or[0]).toMatchObject({ created_at: { $gte: new Date('2026-10-14T10:00:00Z') } });
  });
});

describe('Đồng bộ: phân trang + lookback lần đầu theo cấu hình', () => {
  it('shop có 250 đơn thay đổi → gọi GetOrders 3 trang (100/100/50), lần đầu lùi đúng số ngày cấu hình', async () => {
    setOrderSyncPolicy(policyWith((p) => (p.sync.firstSyncLookbackDays = 7)));
    const pages = [100, 100, 50];
    const getOrders = jest.fn((_t: string, f: { offset: number }) =>
      Promise.resolve(Array.from({ length: pages[f.offset / 100] ?? 0 }, () => ({ order_id: 1 }))),
    );
    const getOrderItems = jest.fn().mockRejectedValue(new Error('bỏ qua xử lý từng đơn trong test'));
    const integration = {
      getConnectedShop: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), last_polled_at: null }),
      getValidAccessToken: jest.fn().mockResolvedValue('tok'),
      markShopPolled: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrdersService({} as never, integration as never, { lazada: { getOrders, getOrderItems } } as never, {} as never, {} as never);
    jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    const before = Date.now();

    const result = await service.syncShopOrders(MarketplacePlatform.LAZADA, 'shop-1');

    expect(getOrders).toHaveBeenCalledTimes(3);
    expect(result.fetched).toBe(250);
    const firstFilter = getOrders.mock.calls[0]?.[1] as unknown as { updatedAfter: Date };
    const days = (before - firstFilter.updatedAfter.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
  });
});

describe('LazadaOrderSyncScheduler theo cấu hình', () => {
  it('chỉ đồng bộ shop đã đến hạn chu kỳ và sàn đang bật', async () => {
    setOrderSyncPolicy(
      policyWith((p) => {
        p.sync.intervalMinutes = 30;
        p.sync.autoSyncEnabled.aurelle = false;
      }),
    );
    const now = Date.now();
    const shops = {
      lazada: [
        { _id: new Types.ObjectId(), shop_id: 'due', last_polled_at: new Date(now - 31 * 60_000) },
        { _id: new Types.ObjectId(), shop_id: 'not-due', last_polled_at: new Date(now - 10 * 60_000) },
        { _id: new Types.ObjectId(), shop_id: 'never', last_polled_at: null },
      ],
      aurelle: [{ _id: new Types.ObjectId(), shop_id: 'aurelle-off', last_polled_at: null }],
    };
    const ordersService = { syncShopOrders: jest.fn().mockResolvedValue({ fetched: 0, upserted: 0, newlyConsolidated: 0 }) };
    const listConnectedShops = jest.fn((p: 'lazada' | 'aurelle') => Promise.resolve(shops[p]));
    const scheduler = new LazadaOrderSyncScheduler(ordersService as never, { listConnectedShops } as never, { notify: jest.fn() } as never);

    await scheduler.autoSyncAllConnectedShops();

    expect(ordersService.syncShopOrders.mock.calls.map((c: unknown[]) => c[1])).toEqual(['due', 'never']);
    expect(listConnectedShops).toHaveBeenCalledTimes(1); // AURELLE đang tắt → không quét
  });
});
