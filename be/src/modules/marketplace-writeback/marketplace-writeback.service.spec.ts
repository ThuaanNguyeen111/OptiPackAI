import { Types } from 'mongoose';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  MAX_WRITEBACK_ATTEMPTS,
  MarketplaceWritebackService,
  backoffMs,
} from './marketplace-writeback.service';

interface QueryChain<T> {
  select: jest.Mock<QueryChain<T>>;
  sort: jest.Mock<QueryChain<T>>;
  lean: jest.Mock<Promise<T>>;
  limit: jest.Mock<Promise<T>>;
}

function chain<T>(value: T): QueryChain<T> {
  const self: QueryChain<T> = {
    select: jest.fn(() => self),
    sort: jest.fn(() => self),
    lean: jest.fn(() => Promise.resolve(value)),
    limit: jest.fn(() => Promise.resolve(value)),
  };
  return self;
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    order_group_id: new Types.ObjectId(),
    shipment_id: null,
    status: 'packed',
    reason: null,
    event_time: new Date('2026-10-20T03:00:00Z'),
    idempotency_key: 'grp:g1:packed:3',
    attempts: 0,
    ...overrides,
  };
}

function build(options: {
  rows: Record<string, unknown>[];
  orders?: { platform_order_id: string; shop_id: string }[];
  shipment?: { tracking_code: string | null; trip_code: string | null } | null;
  updateOrderStatus?: jest.Mock<Promise<void>, [string, Record<string, unknown>]>;
  rma?: Record<string, unknown> | null;
  updateReturnStatus?: jest.Mock<Promise<void>, [string, Record<string, unknown>]>;
}) {
  const outboxUpdate = jest.fn<Promise<object>, [Record<string, unknown>, { $set: Record<string, unknown> }]>().mockResolvedValue({});
  const outboxModel = {
    find: jest.fn(() => chain(options.rows)),
    updateOne: outboxUpdate,
  };
  const orderModel = { find: jest.fn(() => chain(options.orders ?? [])) };
  const shipmentModel = { findById: jest.fn(() => chain(options.shipment ?? null)) };
  const updateOrderStatus: jest.Mock<Promise<void>, [string, Record<string, unknown>]> =
    options.updateOrderStatus ?? jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockResolvedValue(undefined);
  const integration = { getValidAccessToken: jest.fn().mockResolvedValue('tok') };
  const updateReturnStatus: jest.Mock<Promise<void>, [string, Record<string, unknown>]> =
    options.updateReturnStatus ?? jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockResolvedValue(undefined);
  const returnModel = { findById: jest.fn(() => chain(options.rma ?? null)) };
  const service = new MarketplaceWritebackService(
    outboxModel as never,
    orderModel as never,
    shipmentModel as never,
    integration as never,
    { [MarketplacePlatform.AURELLE]: { updateOrderStatus, updateReturnStatus } } as never,
    returnModel as never,
  );
  return { service, outboxUpdate, updateOrderStatus, updateReturnStatus, integration, orderModel };
}

describe('MarketplaceWritebackService.processPending', () => {
  it('gửi từng đơn AURELLE của nhóm với khóa idempotency riêng và đánh dấu sent', async () => {
    const { service, updateOrderStatus, outboxUpdate } = build({
      rows: [makeRow({ status: 'shipped', shipment_id: new Types.ObjectId() })],
      orders: [
        { platform_order_id: '720000001', shop_id: 'S1' },
        { platform_order_id: '720000002', shop_id: 'S1' },
      ],
      shipment: { tracking_code: 'SHP-1', trip_code: 'TRIP-1' },
    });

    const result = await service.processPending();

    expect(result).toMatchObject({ processed: 1, sent: 1, retrying: 0 });
    expect(updateOrderStatus).toHaveBeenCalledTimes(2);
    expect(updateOrderStatus.mock.calls[0]?.[1]).toMatchObject({
      orderId: '720000001',
      status: 'shipped',
      trackingCode: 'SHP-1',
      tripCode: 'TRIP-1',
      idempotencyKey: 'grp:g1:packed:3:720000001',
    });
    expect(outboxUpdate.mock.calls.at(-1)?.[1]).toMatchObject({ $set: { state: 'sent' } });
  });

  it('nhóm không còn đơn AURELLE hiệu lực thì bỏ qua, không gọi sàn', async () => {
    const { service, updateOrderStatus, outboxUpdate } = build({ rows: [makeRow()], orders: [] });
    const result = await service.processPending();
    expect(result.skipped).toBe(1);
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(outboxUpdate.mock.calls[0]?.[1]).toMatchObject({ $set: { state: 'skipped' } });
  });

  it('giao thất bại kèm lý do; trạng thái khác không gửi lý do', async () => {
    const { service, updateOrderStatus } = build({
      rows: [makeRow({ status: 'failed_delivery', reason: 'customer_not_home' })],
      orders: [{ platform_order_id: '720000001', shop_id: 'S1' }],
    });
    await service.processPending();
    expect(updateOrderStatus.mock.calls[0]?.[1]).toMatchObject({ reason: 'customer_not_home' });
  });

  it('lỗi từ sàn: tăng attempts, hẹn thử lại, KHÔNG ném lỗi', async () => {
    const { service, outboxUpdate } = build({
      rows: [makeRow({ attempts: 1 })],
      orders: [{ platform_order_id: '720000001', shop_id: 'S1' }],
      updateOrderStatus: jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockRejectedValue(new Error('502')),
    });
    const now = new Date('2026-10-20T03:00:00Z');
    const result = await service.processPending(now);
    expect(result).toMatchObject({ retrying: 1, failed: 0 });
    const set = outboxUpdate.mock.calls[0]?.[1].$set ?? {};
    expect(set).toMatchObject({ attempts: 2, state: 'pending', last_error: '502' });
    expect((set.next_attempt_at as Date).getTime()).toBe(now.getTime() + backoffMs(2));
  });

  it('quá số lần thử thì đánh dấu failed', async () => {
    const { service, outboxUpdate } = build({
      rows: [makeRow({ attempts: MAX_WRITEBACK_ATTEMPTS - 1 })],
      orders: [{ platform_order_id: '720000001', shop_id: 'S1' }],
      updateOrderStatus: jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockRejectedValue(new Error('down')),
    });
    const result = await service.processPending();
    expect(result.failed).toBe(1);
    expect(outboxUpdate.mock.calls[0]?.[1]).toMatchObject({ $set: { state: 'failed' } });
  });

  it('lấy token 1 lần cho nhiều dòng cùng shop trong 1 lượt', async () => {
    const { service, integration } = build({
      rows: [makeRow(), makeRow({ idempotency_key: 'grp:g2:packed:1' })],
      orders: [{ platform_order_id: '720000001', shop_id: 'S1' }],
    });
    await service.processPending();
    expect(integration.getValidAccessToken).toHaveBeenCalledTimes(1);
  });
});

describe('MarketplaceWritebackService — kết quả phiếu trả hàng của khách', () => {
  const returnRow = (overrides: Record<string, unknown> = {}) =>
    makeRow({ kind: 'return_status', return_request_id: new Types.ObjectId(), status: 'approved', note: null, idempotency_key: 'ret:r1:approved:1', ...overrides });
  const marketplaceRma = { source: 'marketplace', external_ref: 'sf-return-1', shop_id: 'S1', rma_code: 'RMA-261020-AAA111' };

  it('báo duyệt/từ chối ngược cho sàn với id yêu cầu của sàn, mã RMA và ghi chú', async () => {
    const { service, updateReturnStatus, updateOrderStatus, outboxUpdate } = build({
      rows: [returnRow({ status: 'rejected', note: 'Quá hạn' })],
      rma: marketplaceRma,
    });
    const result = await service.processPending();
    expect(result.sent).toBe(1);
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(updateReturnStatus.mock.calls[0]?.[1]).toMatchObject({
      returnId: 'sf-return-1',
      status: 'rejected',
      rmaCode: 'RMA-261020-AAA111',
      decisionNote: 'Quá hạn',
      idempotencyKey: 'ret:r1:approved:1',
    });
    expect(outboxUpdate.mock.calls.at(-1)?.[1]).toMatchObject({ $set: { state: 'sent' } });
  });

  it('phiếu không phải do khách gửi trên sàn (Admin tạo / giao thất bại) thì bỏ qua, không gọi sàn', async () => {
    const { service, updateReturnStatus } = build({ rows: [returnRow()], rma: { ...marketplaceRma, source: 'simulated' } });
    const result = await service.processPending();
    expect(result.skipped).toBe(1);
    expect(updateReturnStatus).not.toHaveBeenCalled();
  });

  it('sàn từ chối cập nhật: hẹn thử lại, không mất dòng', async () => {
    const { service, outboxUpdate } = build({
      rows: [returnRow()],
      rma: marketplaceRma,
      updateReturnStatus: jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockRejectedValue(new Error('502')),
    });
    const result = await service.processPending();
    expect(result.retrying).toBe(1);
    expect(outboxUpdate.mock.calls[0]?.[1]).toMatchObject({ $set: { state: 'pending', attempts: 1 } });
  });
});

describe('backoffMs', () => {
  it('tăng gấp đôi và chặn ở 30 phút', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(30 * 60 * 1000);
  });
});
