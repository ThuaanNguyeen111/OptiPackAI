import { Types } from 'mongoose';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { MarketplaceWritebackService } from './marketplace-writeback.service';

/** 22/10/2026 — đơn thay thế (EXC-…) báo mốc giao HÀNG ĐỔI về yêu cầu đổi hàng trên AURELLE. */
interface Chain {
  select: jest.Mock<Chain>;
  sort: jest.Mock<Chain>;
  lean: jest.Mock<Promise<unknown>>;
  limit: jest.Mock<Promise<unknown>>;
}

function chain(value: unknown): Chain {
  const self: Chain = {
    select: jest.fn(() => self),
    sort: jest.fn(() => self),
    lean: jest.fn(() => Promise.resolve(value)),
    limit: jest.fn(() => Promise.resolve(value)),
  };
  return self;
}

type OutboxUpdate = jest.Mock<Promise<object>, [unknown, { $set: Record<string, unknown> }]>;

function lastState(outboxUpdate: OutboxUpdate): unknown {
  return outboxUpdate.mock.calls.at(-1)?.[1].$set.state;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- bộ dựng test, kiểu suy ra đủ rõ
function build(opts: { status: string; rma: Record<string, unknown> | null; withAdapter?: boolean }) {
  const returnId = new Types.ObjectId();
  const replacement = { _id: new Types.ObjectId(), shop_id: 'S1', source_return_id: returnId };
  const row = {
    _id: new Types.ObjectId(),
    order_group_id: new Types.ObjectId(),
    shipment_id: new Types.ObjectId(),
    status: opts.status,
    reason: null,
    event_time: new Date('2026-10-22T03:00:00Z'),
    idempotency_key: `ship:x:${opts.status}:1`,
    attempts: 0,
  };
  const outboxUpdate: OutboxUpdate = jest.fn<Promise<object>, [unknown, { $set: Record<string, unknown> }]>().mockResolvedValue({});
  const orderModel = {
    find: jest.fn((filter: { origin?: unknown }) => chain(filter.origin === 'replacement' ? [replacement] : [])),
  };
  const shipment = { tracking_code: 'SHP-1', trip_code: null, carrier_name: 'GHN', carrier_kind: 'mock', carrier_parcels: [] };
  const updateExchangeShipment = jest.fn().mockResolvedValue(undefined);
  const updateOrderStatus = jest.fn().mockResolvedValue(undefined);
  const adapter = opts.withAdapter === false ? { updateOrderStatus } : { updateOrderStatus, updateExchangeShipment };
  const service = new MarketplaceWritebackService(
    { find: jest.fn(() => chain([row])), updateOne: outboxUpdate } as never,
    orderModel as never,
    { findById: jest.fn(() => chain(shipment)) } as never,
    { getValidAccessToken: jest.fn().mockResolvedValue('tok') } as never,
    { [MarketplacePlatform.AURELLE]: adapter } as never,
    { findById: jest.fn(() => chain(opts.rma)) } as never,
  );
  return { service, updateExchangeShipment, updateOrderStatus, outboxUpdate, orderModel };
}

describe('MarketplaceWritebackService — hành trình hàng đổi (22/10/2026)', () => {
  const exchangeRma = { source: 'marketplace', external_ref: 'ret-aurelle-1', type: 'exchange', shop_id: 'S1' };

  it('đơn thay thế đang giao → báo về đúng yêu cầu đổi hàng kèm hãng + mã vận đơn, không gọi updateOrderStatus', async () => {
    const { service, updateExchangeShipment, updateOrderStatus, outboxUpdate } = build({ status: 'shipped', rma: exchangeRma });
    const result = await service.processPending(new Date('2026-10-22T04:00:00Z'));
    expect(result.sent).toBe(1);
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(updateExchangeShipment).toHaveBeenCalledWith('tok', expect.objectContaining({
      returnId: 'ret-aurelle-1',
      status: 'shipped',
      carrier: 'GHN',
      trackingCode: 'SHP-1',
      idempotencyKey: 'ship:x:shipped:1:exchange:ret-aurelle-1',
    }));
    expect(lastState(outboxUpdate)).toBe('sent');
  });

  it('phiếu đổi do Admin tạo (không phải khách trên sàn) → bỏ qua, đánh dấu skipped', async () => {
    const { service, updateExchangeShipment, outboxUpdate } = build({
      status: 'delivered',
      rma: { ...exchangeRma, source: 'simulated' },
    });
    const result = await service.processPending();
    expect(result.skipped).toBe(1);
    expect(updateExchangeShipment).not.toHaveBeenCalled();
    expect(lastState(outboxUpdate)).toBe('skipped');
  });

  it('trạng thái không thuộc hành trình hàng đổi (returned) → không tìm đơn thay thế', async () => {
    const { service, updateExchangeShipment, orderModel } = build({ status: 'returned', rma: exchangeRma });
    await service.processPending();
    expect(updateExchangeShipment).not.toHaveBeenCalled();
    expect(orderModel.find).toHaveBeenCalledTimes(1);
  });

  it('adapter chưa hỗ trợ updateExchangeShipment → skipped, không lỗi', async () => {
    const { service, outboxUpdate } = build({ status: 'packed', rma: exchangeRma, withAdapter: false });
    const result = await service.processPending();
    expect(result.skipped).toBe(1);
    expect(lastState(outboxUpdate)).toBe('skipped');
  });
});

describe('MarketplaceWritebackService — sự kiện riêng 1 đơn (22/10/2026)', () => {
  it('short_shipped: gửi đúng đơn kèm items, kể cả đơn không lọc theo nhóm', async () => {
    const orderId = new Types.ObjectId();
    const row = {
      _id: new Types.ObjectId(),
      order_group_id: new Types.ObjectId(),
      order_id: orderId,
      shipment_id: null,
      status: 'short_shipped',
      reason: 'Kho không đủ hàng',
      shipped_items: [{ sku: 'ATHUN-005-DEN-M', shipped_quantity: 1 }],
      event_time: new Date('2026-10-22T03:00:00Z'),
      idempotency_key: `ord:${orderId.toHexString()}:short_shipped:round1`,
      attempts: 0,
    };
    const outboxUpdate: OutboxUpdate = jest.fn<Promise<object>, [unknown, { $set: Record<string, unknown> }]>().mockResolvedValue({});
    const updateOrderStatus = jest.fn().mockResolvedValue(undefined);
    const orderModel = {
      find: jest.fn(),
      findOne: jest.fn(() => chain({ _id: orderId, platform_order_id: '720000009', shop_id: 'S1' })),
    };
    const service = new MarketplaceWritebackService(
      { find: jest.fn(() => chain([row])), updateOne: outboxUpdate } as never,
      orderModel as never,
      { findById: jest.fn() } as never,
      { getValidAccessToken: jest.fn().mockResolvedValue('tok') } as never,
      { [MarketplacePlatform.AURELLE]: { updateOrderStatus } } as never,
      { findById: jest.fn() } as never,
    );
    const result = await service.processPending();
    expect(result.sent).toBe(1);
    expect(orderModel.find).not.toHaveBeenCalled();
    expect(updateOrderStatus).toHaveBeenCalledWith('tok', expect.objectContaining({
      orderId: '720000009',
      status: 'short_shipped',
      reason: 'Kho không đủ hàng',
      items: [{ sku: 'ATHUN-005-DEN-M', shipped_quantity: 1 }],
    }));
    expect(lastState(outboxUpdate)).toBe('sent');
  });
});
