import { Types } from 'mongoose';
import { DashboardService } from './dashboard.service';
import { DASHBOARD_ERROR_CODES } from './dashboard.errors';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { ShipmentStatus } from '../shipments/enums/shipment-status.enum';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';

//!=============================================
// 28/10/2026 — Bảng điều khiển: số liệu lấy từ dữ liệu thật (không còn số giả ở FE).
//!=============================================
type Filter = Record<string, unknown>;
interface Rule { when: (f: Filter) => boolean; rows: unknown[] }
interface Chain { select: jest.Mock<Chain>; lean: jest.Mock<Promise<unknown[]>> }

/** Model giả: find(filter) trả hàng của rule khớp đầu tiên; countDocuments trả số cố định theo rule. */
interface ModelMock { find: jest.Mock; countDocuments: jest.Mock; distinct: jest.Mock }
function model(rules: Rule[] = [], counts: { when: (f: Filter) => boolean; n: number }[] = []): ModelMock {
  const rowsFor = (f: Filter): unknown[] => rules.find((r) => r.when(f))?.rows ?? [];
  return {
    find: jest.fn((f: Filter): Chain => {
      const chain: Chain = { select: jest.fn((): Chain => chain), lean: jest.fn(() => Promise.resolve(rowsFor(f))) };
      return chain;
    }),
    countDocuments: jest.fn((f: Filter) => ({ exec: () => Promise.resolve(counts.find((c) => c.when(f))?.n ?? 0) })),
    distinct: jest.fn(() => Promise.resolve([])),
  };
}

describe('DashboardService.summary', () => {
  const now = new Date('2026-10-28T10:00:00.000Z');
  const from = '2026-10-21T17:00:00.000Z'; // 00:00 ngày 22/10 giờ VN
  const to = '2026-10-28T17:00:00.000Z';
  const inRange = (f: Filter, field: string): boolean => {
    const v = f[field] as { $gte?: Date } | undefined;
    return v?.$gte?.toISOString() === from;
  };
  const g1 = new Types.ObjectId();
  const g2 = new Types.ObjectId();

  function build(over: Partial<Record<string, ModelMock>> = {}): { service: DashboardService; report: jest.Mock } {
    const report = jest.fn().mockResolvedValue({ packagingCostVnd: 30_000, orders: 3 });
    const service = new DashboardService(
      (over.order ?? model([
        { when: (f) => inRange(f, 'created_at'), rows: [
          { _id: new Types.ObjectId(), platform: 'aurelle', status: OrderStatus.PENDING, total_amount: 300_000, created_at: new Date('2026-10-22T03:00:00Z') },
          { _id: new Types.ObjectId(), platform: 'aurelle', status: OrderStatus.CANCELED, total_amount: 999_000, created_at: new Date('2026-10-22T04:00:00Z') },
          { _id: new Types.ObjectId(), platform: 'lazada', status: OrderStatus.PENDING, total_amount: 100_000, created_at: new Date('2026-10-27T18:00:00Z') },
        ] },
        { when: (f) => 'consolidated_group_id' in f && 'origin' in f, rows: [
          { _id: new Types.ObjectId(), platform: 'aurelle', status: OrderStatus.DELIVERED, total_amount: 300_000, consolidated_group_id: g1 },
        ] },
      ], [{ when: (f) => 'consolidated_group_id' in f, n: 2 }, { when: (f) => f.need_cancel_confirm === true, n: 1 }])) as never,
      (over.group ?? model([
        { when: (f) => f.order_priority === 'express', rows: [
          { _id: g1, packaging_deadline: new Date('2026-10-23T00:00:00Z'), fulfillment_status: GroupFulfillmentStatus.DELIVERED },
          { _id: g2, packaging_deadline: new Date('2026-10-24T00:00:00Z'), fulfillment_status: GroupFulfillmentStatus.PICKING },
        ] },
        { when: (f) => 'stock_shortage_items.0' in f, rows: [
          { stock_shortage_items: [{ sku: 'AO-DEN-M', shortage: 2 }, { sku: 'QUAN-L', shortage: 0 }] },
          { stock_shortage_items: [{ sku: 'AO-DEN-M', shortage: 1 }] },
        ] },
      ], [{ when: (f) => f.fulfillment_status === GroupFulfillmentStatus.AWAITING_PACKAGING, n: 4 }])) as never,
      (over.shipment ?? model([
        { when: (f) => inRange(f, 'created_at'), rows: [
          { order_group_id: g1, estimated_cost_vnd: 99_000, carrier_parcels: [{ carrier_order_code: 'GHN1', carrier_status: 'delivered', fee: { total: 20_900 } }] },
          { order_group_id: g2, estimated_cost_vnd: 25_000, carrier_parcels: [] },
        ] },
        { when: (f) => f.status === ShipmentStatus.DELIVERED && inRange(f, 'delivered_at'), rows: [
          { order_group_id: g1, attempt_count: 1, created_at: new Date('2026-10-23T00:00:00Z'), delivered_at: new Date('2026-10-24T00:00:00Z') },
        ] },
      ])) as never,
      (over.ret ?? model([{ when: (f) => inRange(f, 'created_at'), rows: [{ type: 'return_refund' }] }])) as never,
      (over.plan ?? model([{ when: (f) => f.status === 'packed', rows: [{ order_group_id: g1, packed_at: new Date('2026-10-22T20:00:00Z') }] }])) as never,
      model() as never,
      (over.stock ?? model([{ when: () => true, rows: [
        { seller_sku: 'AO-DEN-M', quantity_on_hand: 0 }, { seller_sku: 'AO-DEN-M', quantity_on_hand: 0 }, { seller_sku: 'QUAN-L', quantity_on_hand: 5 },
      ] }])) as never,
      model([{ when: () => true, rows: [
        { code: 'BOX-M', name: 'Thùng M', kind: 'box', qty_new: 3, qty_reused: 1, reorder_level: 10 },
        { code: 'BOX-L', name: 'Thùng L', kind: 'box', qty_new: 50, qty_reused: 0, reorder_level: 10 },
      ] }]) as never,
      { summary: report } as never,
    );
    return { service, report };
  }

  it('doanh thu: đặt hàng (trừ đơn hủy) + đã giao theo vận đơn; theo sàn; theo ngày giờ VN', async () => {
    const { summary } = { summary: await build().service.summary(from, to, undefined, now) };
    expect(summary.sales.current).toMatchObject({
      ordersReceived: 3, ordersCanceled: 1, revenuePlacedVnd: 400_000, ordersDelivered: 1, revenueDeliveredVnd: 300_000, avgOrderValueVnd: 200_000, cancelRate: 0.333,
    });
    expect(summary.sales.byPlatform.map((p) => [p.platform, p.revenuePlacedVnd])).toEqual([['aurelle', 300_000], ['lazada', 100_000]]);
    expect(summary.sales.daily).toHaveLength(7);
    expect(summary.sales.daily.find((d) => d.date === '2026-10-28')).toMatchObject({ ordersReceived: 1, revenuePlacedVnd: 100_000 }); // 18h UTC 27 = 28 ở VN
    expect(summary.sales.daily.find((d) => d.date === '2026-10-24')).toMatchObject({ ordersDelivered: 1, revenueDeliveredVnd: 300_000 });
  });

  it('chi phí: phí GHN thật + báo giá; bao bì lấy từ báo cáo đóng gói; tỷ lệ trên doanh thu', async () => {
    const { service, report } = build();
    const s = await service.summary(from, to, undefined, now);
    expect(s.costs).toMatchObject({ shippingCostVnd: 45_900, ordersShipped: 2, shippingCostPerOrderVnd: 22_950, packagingCostVnd: 30_000, packagingCostPerOrderVnd: 10_000, fulfillmentCostRate: 0.19 });
    expect(report).toHaveBeenCalledWith(from, to, undefined, undefined);
    expect(s.delivery).toMatchObject({ shipmentsCreated: 2, shipmentsDelivered: 1, firstAttemptSuccessRate: 1, avgDeliveryHours: 24 });
    expect(s.returns).toMatchObject({ customerRequests: 1, returnRate: 1 });
  });

  it('hỏa tốc: đóng trước hạn = đúng hạn; quá hạn chưa đóng = trễ', async () => {
    const s = await build().service.summary(from, to, undefined, now);
    expect(s.express).toEqual({ total: 2, onTime: 1, late: 1, pending: 0, onTimeRate: 0.5 });
  });

  it('việc cần xử lý + kho: đếm theo trạng thái, SKU thiếu cộng dồn, SKU hết hàng, vật tư dưới mức đặt lại', async () => {
    const s = await build().service.summary(from, to, undefined, now);
    expect(s.actionQueue.awaitingPick).toBe(4);
    expect(s.actionQueue.ordersAwaitingCancelConfirm).toBe(1);
    expect(s.warehouse.shortageSkus).toEqual([{ sku: 'AO-DEN-M', shortage: 3, groups: 2 }]);
    expect(s.warehouse.outOfStockSkus).toEqual(['AO-DEN-M']);
    expect(s.warehouse.materialsBelowReorder).toEqual([{ code: 'BOX-M', name: 'Thùng M', kind: 'box', usable: 4, reorderLevel: 10 }]);
  });

  it('lọc sàn: báo cáo đóng gói nhận đúng id nhóm của sàn; sàn lạ → 400', async () => {
    const group = model();
    group.distinct.mockResolvedValue([g1]);
    const { service, report } = build({ group });
    await service.summary(from, to, 'aurelle', now);
    expect(report).toHaveBeenCalledWith(from, to, undefined, [g1]);
    await expect(service.summary(from, to, 'shopee', now)).rejects.toMatchObject({ errorCode: DASHBOARD_ERROR_CODES.INVALID_PLATFORM });
  });

  it('khoảng ngày sai → 400 DASH_INVALID_DATE_RANGE', async () => {
    await expect(build().service.summary(to, from, undefined, now)).rejects.toMatchObject({ errorCode: DASHBOARD_ERROR_CODES.INVALID_DATE_RANGE });
  });
});
