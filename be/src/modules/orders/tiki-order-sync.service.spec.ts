import { Types } from 'mongoose';
import { TikiOrderSyncService } from './tiki-order-sync.service';
import { TikiApiError } from '../marketplace-integration/adapters/tiki.adapter';
import type { TikiOrderRaw } from '../marketplace-integration/adapters/tiki.types';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';

//!=============================================
// 31/10/2026 — đồng bộ Tiki: kéo event queue (ack SAU khi xử lý), quét dự phòng, chỉ nhận đơn
// dropship đã được Tiki tiếp nhận, tự xác nhận đủ hàng khi nhóm đơn giữ đủ tồn, thiếu hàng sắp
// hết hạn thì báo Store Owner đúng 1 lần.
//!=============================================
const shopMongoId = new Types.ObjectId();
const groupId = new Types.ObjectId();

function rawOrder(code: string, over: Partial<TikiOrderRaw> = {}): TikiOrderRaw {
  return {
    code,
    fulfillment_type: 'dropship',
    status: 'queueing',
    created_at: '2026-10-31 09:00:00',
    tiki_warehouse: { code: 'sgn' },
    shipping: { address: { full_name: 'A', phone: '0901', street: '1 Lê Lợi', ward: 'Phường Bến Thành', region: 'Hồ Chí Minh' } },
    items: [{ id: 11, product: { sku: 'T1', name: 'Áo', seller_product_code: 'SKU-1', inventory_type: 'backorder' }, invoice: { price: 100, quantity: 1 }, confirmation: { status: 'waiting', available_confirm_sla: '2026-10-31 15:00:00' } }],
    ...over,
  };
}

function build(opts: { pendingOrders?: Record<string, unknown>[]; groupShortage?: boolean; existing?: boolean } = {}) {
  const shop = { _id: shopMongoId, shop_id: '365980', event_queue_code: 'Q1', event_ack_id: 'ACK0', last_polled_at: null as Date | null };
  const tiki = {
    listQueues: jest.fn().mockResolvedValue([]),
    createQueue: jest.fn(),
    listSubscriptions: jest.fn().mockResolvedValue([{ event_type: 'ORDER_CREATED_SUCCESSFULLY', active: true, code: 's1' }]),
    createSubscription: jest.fn().mockResolvedValue({}),
    pullEvents: jest
      .fn()
      .mockResolvedValueOnce({ events: [{ id: 'e1', created_at: 1, type: 'ORDER_CREATED_SUCCESSFULLY', payload: { order_code: 'A1' } }, { id: 'e2', created_at: 2, type: 'ORDER_STATUS_UPDATED', payload: { order_code: 'A1' } }], ack_id: 'ACK1' })
      .mockResolvedValue({ events: [], ack_id: 'ACK1' }),
    ackEvents: jest.fn().mockResolvedValue(undefined),
    listOrders: jest.fn().mockResolvedValue({ data: [{ code: 'B2' }], paging: { total: 1, current_page: 1, last_page: 1, per_page: 50 } }),
    getOrder: jest.fn((_t: string, code: string) => Promise.resolve(code === 'B2' ? rawOrder('B2', { fulfillment_type: 'tiki_delivery' }) : rawOrder(code))),
    getSellerInventories: jest.fn().mockResolvedValue({ seller_inventories: [], mappings: [{ tiki_warehouse_code: 'sgn', seller_inventory_ids: [425011] }] }),
    dropshipConfirmAvailable: jest.fn().mockResolvedValue(undefined),
  };
  const lean = (v: unknown) => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve(v) }) }) }) });
  const orderModel = {
    exists: jest.fn().mockResolvedValue(opts.existing ? { _id: 'x' } : null),
    find: jest.fn((filter: Record<string, unknown>) => ('marketplace_meta.confirmation_status' in filter ? Promise.resolve(opts.pendingOrders ?? []) : lean([]))),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const ordersService = { ingestMappedOrder: jest.fn().mockResolvedValue({ consolidated: false }), findOrderDetail: jest.fn() };
  const integration = {
    getConnectedShop: jest.fn().mockResolvedValue(shop),
    getValidAccessToken: jest.fn().mockResolvedValue('TOKEN'),
    saveEventQueueState: jest.fn().mockResolvedValue(undefined),
    markShopPolled: jest.fn().mockResolvedValue(undefined),
  };
  const orderGroups = { findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, stock_shortage: opts.groupShortage ?? false }) };
  const notify = jest.fn().mockResolvedValue({});
  const service = new TikiOrderSyncService(orderModel as never, ordersService as never, integration as never, tiki as never, orderGroups as never, { notify } as never);
  return { service, tiki, orderModel, ordersService, integration, notify };
}

const pendingOrder = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  platform_order_id: 'A1',
  consolidated_group_id: groupId,
  marketplace_meta: { fulfillment_type: 'dropship', warehouse_code: 'sgn', confirmation_status: 'pending', confirm_sla_at: new Date('2026-10-31T08:00:00.000Z') },
  marketplace_confirm_attempted_at: null,
  marketplace_confirm_error: null,
  marketplace_confirm_warned_at: null,
  ...over,
});

describe('TikiOrderSyncService', () => {
  it('kéo sự kiện (lọc trùng mã đơn), quét dự phòng, chỉ nhận đơn dropship, ack sau khi xử lý', async () => {
    const { service, tiki, ordersService, integration } = build();
    const res = await service.syncShop('365980', { sweep: true });
    expect(tiki.pullEvents).toHaveBeenNthCalledWith(1, 'TOKEN', 'Q1', 'ACK0');
    expect(tiki.createSubscription).toHaveBeenCalledWith('TOKEN', 'Q1', 'ORDER_STATUS_UPDATED');
    expect(tiki.getOrder.mock.calls.map((c) => c[1])).toEqual(['A1', 'B2']);
    // B2 là tiki_delivery (kho Tiki tự đóng) → không nhận
    expect(ordersService.ingestMappedOrder).toHaveBeenCalledTimes(1);
    expect((ordersService.ingestMappedOrder.mock.calls as unknown[][])[0]?.[0]).toBe(MarketplacePlatform.TIKI);
    expect(tiki.ackEvents).toHaveBeenCalledWith('TOKEN', 'Q1', 'ACK1');
    expect(integration.saveEventQueueState).toHaveBeenCalledWith(shopMongoId, expect.objectContaining({ ackId: 'ACK1' }));
    expect(integration.markShopPolled).toHaveBeenCalled();
    expect(res).toMatchObject({ events: 2, fetched: 2, upserted: 1 });
  });

  it('không quét dự phòng (cron giữa chu kỳ) → không gọi danh sách đơn, không ghi mốc quét', async () => {
    const { service, tiki, integration } = build();
    await service.syncShop('365980', { sweep: false });
    expect(tiki.listOrders).not.toHaveBeenCalled();
    expect(integration.markShopPolled).not.toHaveBeenCalled();
  });

  it('nhóm đơn giữ đủ tồn → tự xác nhận đủ hàng với kho nhà bán đã gán cho kho Tiki', async () => {
    const order = pendingOrder();
    const { service, tiki, orderModel } = build({ pendingOrders: [order] });
    const res = await service.syncShop('365980', { sweep: false });
    expect(tiki.dropshipConfirmAvailable).toHaveBeenCalledWith('TOKEN', 'A1', 'seller_confirmed', 425011);
    expect(orderModel.updateOne).toHaveBeenCalledWith({ _id: order._id }, { $set: expect.objectContaining({ 'marketplace_meta.confirmation_status': 'confirmed' }) as unknown });
    expect(res.confirmed).toBe(1);
  });

  it('nhóm đơn thiếu hàng → KHÔNG xác nhận; còn ≤ 60 phút tới hạn → báo Store Owner 1 lần', async () => {
    const order = pendingOrder({ marketplace_meta: { fulfillment_type: 'dropship', warehouse_code: 'sgn', confirmation_status: 'pending', confirm_sla_at: new Date(Date.now() + 30 * 60_000) } });
    const { service, tiki, notify } = build({ pendingOrders: [order], groupShortage: true });
    await service.syncShop('365980', { sweep: false });
    expect(tiki.dropshipConfirmAvailable).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.MARKETPLACE_CONFIRM_REQUIRED, relatedEntityId: String(order._id) }));
  });

  it('Tiki từ chối xác nhận (400) → ghi lỗi + đọc lại đơn; 5 phút sau mới thử lại', async () => {
    const order = pendingOrder();
    const { service, tiki, orderModel } = build({ pendingOrders: [order] });
    tiki.dropshipConfirmAvailable.mockRejectedValueOnce(new TikiApiError('đã xác nhận', 400, ['already confirmed']));
    await service.syncShop('365980', { sweep: false });
    expect(orderModel.updateOne).toHaveBeenCalledWith({ _id: order._id }, { $set: expect.objectContaining({ marketplace_confirm_error: 'đã xác nhận' }) as unknown });
    expect(tiki.getOrder).toHaveBeenCalledWith('TOKEN', 'A1');

    const recent = pendingOrder({ marketplace_confirm_attempted_at: new Date(), marketplace_confirm_error: 'lỗi' });
    const second = build({ pendingOrders: [recent] });
    await second.service.syncShop('365980', { sweep: false });
    expect(second.tiki.dropshipConfirmAvailable).not.toHaveBeenCalled();
  });
});
