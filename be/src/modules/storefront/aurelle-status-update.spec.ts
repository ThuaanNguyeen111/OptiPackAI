import { Types } from 'mongoose';
import {
  applyPartnerStatusUpdate,
  isPartnerStatus,
  type MinimalCollection,
  type StatusUpdateCollections,
} from './aurelle-status-update';

type Doc = Record<string, unknown>;

/** Collection giả trong bộ nhớ: đủ findOne + updateOne (có upsert, $set, $setOnInsert) theo bộ lọc bằng nhau. */
function fakeCollection(initial: Doc[] = []): MinimalCollection & { docs: Doc[] } {
  const docs = [...initial];
  const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
  return {
    docs,
    findOne: (filter) => Promise.resolve(docs.find((d) => matches(d, filter)) ?? null),
    updateOne: (filter, update, options) => {
      const existing = docs.find((d) => matches(d, filter));
      const set = (update.$set ?? {}) as Doc;
      const onInsert = (update.$setOnInsert ?? {}) as Doc;
      if (existing) {
        Object.assign(existing, set);
        return Promise.resolve({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 });
      }
      if (options?.upsert) {
        docs.push({ ...filter, ...onInsert, ...set });
        return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 });
      }
      return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    },
  };
}

function setup(order: Doc = {}) {
  const orderId = new Types.ObjectId();
  const orders = fakeCollection([
    {
      _id: orderId,
      public_order_id: 720000001,
      status: 'pending',
      payment_status: 'unpaid',
      fulfillment_status: 'awaiting_packaging',
      ...order,
    },
  ]);
  const shipments = fakeCollection();
  const events = fakeCollection();
  const cols: StatusUpdateCollections = { orders, shipments, events };
  return { cols, orders, shipments, events, orderId };
}

const base = {
  publicOrderId: 720000001,
  status: 'packed' as const,
  eventTime: new Date('2026-10-20T03:00:00Z'),
  idempotencyKey: 'k1',
};

describe('applyPartnerStatusUpdate', () => {
  it('đơn không tồn tại → null', async () => {
    const { cols } = setup();
    expect(await applyPartnerStatusUpdate(cols, { ...base, publicOrderId: 1 })).toBeNull();
  });

  it('packed: ghi trạng thái đơn + 1 dòng hành trình có nhãn tiếng Việt', async () => {
    const { cols, orders, events } = setup();
    const result = await applyPartnerStatusUpdate(cols, base);
    expect(result).toMatchObject({ order_id: 720000001, status: 'packed', applied: true });
    expect(orders.docs[0]?.fulfillment_status).toBe('packed');
    expect(events.docs).toHaveLength(1);
    expect(events.docs[0]).toMatchObject({ status: 'packed', label: 'Đã đóng gói', source: 'partner' });
  });

  it('gửi lại cùng idempotency_key: không ghi thêm hành trình, applied=false', async () => {
    const { cols, events } = setup();
    await applyPartnerStatusUpdate(cols, base);
    const again = await applyPartnerStatusUpdate(cols, base);
    expect(again?.applied).toBe(false);
    expect(events.docs).toHaveLength(1);
  });

  it('shipped kèm mã vận đơn + chuyến → tạo vận đơn website', async () => {
    const { cols, shipments } = setup();
    await applyPartnerStatusUpdate(cols, {
      ...base,
      status: 'shipped',
      trackingCode: 'SHP-1',
      tripCode: 'TRIP-1',
      idempotencyKey: 'k2',
    });
    expect(shipments.docs[0]).toMatchObject({
      tracking_number: 'SHP-1',
      trip_code: 'TRIP-1',
      status: 'in_transit',
      carrier: 'OptiPack',
    });
  });

  it('delivered: đơn hoàn tất, COD đã thu tiền, vận đơn delivered', async () => {
    const { cols, orders, shipments } = setup({ fulfillment_status: 'shipped' });
    await applyPartnerStatusUpdate(cols, { ...base, status: 'delivered', idempotencyKey: 'k3' });
    expect(orders.docs[0]).toMatchObject({
      fulfillment_status: 'delivered',
      status: 'completed',
      payment_status: 'paid',
    });
    expect(shipments.docs[0]?.status).toBe('delivered');
  });

  it('sự kiện cũ hơn trạng thái đã ghi: lưu lịch sử nhưng không kéo đơn lùi', async () => {
    const { cols, orders, events } = setup({
      fulfillment_status: 'shipped',
      fulfillment_updated_at: new Date('2026-10-20T05:00:00Z'),
    });
    const result = await applyPartnerStatusUpdate(cols, { ...base, status: 'packed', idempotencyKey: 'old' });
    expect(result?.applied).toBe(false);
    expect(orders.docs[0]?.fulfillment_status).toBe('shipped');
    expect(events.docs).toHaveLength(1);
  });

  it('đơn đã hủy không đổi trạng thái giao hàng', async () => {
    const { cols, orders } = setup({ status: 'cancelled' });
    const result = await applyPartnerStatusUpdate(cols, { ...base, idempotencyKey: 'c1' });
    expect(result?.applied).toBe(false);
    expect(orders.docs[0]?.fulfillment_status).toBe('awaiting_packaging');
  });

  it('giao thất bại kèm lý do được lưu vào hành trình', async () => {
    const { cols, events } = setup({ fulfillment_status: 'shipped' });
    await applyPartnerStatusUpdate(cols, {
      ...base,
      status: 'failed_delivery',
      reason: 'customer_not_home',
      idempotencyKey: 'f1',
    });
    expect(events.docs[0]).toMatchObject({ status: 'failed_delivery', reason: 'customer_not_home' });
  });
});

describe('isPartnerStatus', () => {
  it('chỉ nhận đúng 6 trạng thái', () => {
    expect(isPartnerStatus('delivered')).toBe(true);
    expect(isPartnerStatus('canceled')).toBe(false);
    expect(isPartnerStatus(undefined)).toBe(false);
  });
});
