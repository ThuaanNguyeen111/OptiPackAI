import { Types } from 'mongoose';
import { applyPartnerStatusUpdate, type MinimalCollection, type StatusUpdateCollections } from './aurelle-status-update';
import { computeReturnRefund } from './aurelle-return-api';
import { sellableQuantity } from './storefront-stock.util';

type Doc = Record<string, unknown>;

/** Collection giả: findOne/updateOne/find theo bộ lọc bằng nhau (bỏ qua toán tử $in/$nin của stock). */
function fake(initial: Doc[] = []): MinimalCollection & { docs: Doc[]; find(f: Doc): { toArray(): Promise<Doc[]> } } {
  const docs = [...initial];
  const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === 'object' && '$in' in (v as Doc)) return ((v as { $in: unknown[] }).$in).map(String).includes(String(doc[k]));
      return String(doc[k]) === String(v);
    });
  return {
    docs,
    find: (filter) => ({ toArray: () => Promise.resolve(docs.filter((d) => matches(d, filter))) }),
    findOne: (filter) => Promise.resolve(docs.find((d) => matches(d, filter)) ?? null),
    updateOne: (filter, update, options) => {
      const existing = docs.find((d) => matches(d, filter));
      if (Array.isArray(update)) return Promise.resolve({ matchedCount: existing ? 1 : 0, modifiedCount: existing ? 1 : 0 });
      const set = (update.$set ?? {}) as Doc;
      if (existing) {
        Object.assign(existing, set);
        return Promise.resolve({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 });
      }
      if (options?.upsert) {
        docs.push({ ...filter, ...((update.$setOnInsert ?? {}) as Doc), ...set });
        return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 });
      }
      return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    },
  };
}

function setup(order: Doc = {}) {
  const orderId = new Types.ObjectId();
  const vA = new Types.ObjectId();
  const vB = new Types.ObjectId();
  const orders = fake([{ _id: orderId, public_order_id: 1, status: 'pending', payment_status: 'paid', fulfillment_status: 'awaiting_packaging', stock_state: 'reserved', ...order }]);
  const items = fake([
    { _id: new Types.ObjectId(), order_id: orderId, variant_id: vA, sku_snapshot: 'ATHUN-005-DEN-M', quantity: 2, line_total: 400000 },
    { _id: new Types.ObjectId(), order_id: orderId, variant_id: vB, sku_snapshot: 'ATHUN-005-DEN-L', quantity: 1, line_total: 200000 },
  ]);
  const stockUpdates: Doc[] = [];
  const stocks = { updateOne: (filter: Doc, update: Doc[]) => { stockUpdates.push({ filter, update }); return Promise.resolve({}); } };
  const cols: StatusUpdateCollections = {
    orders, shipments: fake(), events: fake(),
    stock: { orders, items, stocks },
    orderItems: items,
  };
  return { cols, orders, items, stockUpdates, orderId, vA };
}

const input = { publicOrderId: 1, eventTime: new Date('2026-10-22T03:00:00Z'), idempotencyKey: 'k' };

describe('AURELLE — hành động người bán (22/10/2026)', () => {
  it('canceled_by_seller: đơn hủy, ghi nguồn + lý do, đã thanh toán → hoàn tiền, nhả giữ chỗ', async () => {
    const { cols, orders, stockUpdates } = setup();
    const res = await applyPartnerStatusUpdate(cols, { ...input, status: 'canceled_by_seller', reason: 'Hết hàng' });
    expect(res?.applied).toBe(true);
    expect(orders.docs[0]).toMatchObject({ status: 'cancelled', cancel_source: 'seller', cancel_reason: 'Hết hàng', payment_status: 'refunded', stock_state: 'released' });
    expect(stockUpdates).toHaveLength(2); // nhả 2 dòng
  });

  it('canceled_by_seller khi hàng đã rời kho → không áp dụng', async () => {
    const { cols, orders } = setup({ fulfillment_status: 'shipped' });
    const res = await applyPartnerStatusUpdate(cols, { ...input, status: 'canceled_by_seller' });
    expect(res?.applied).toBe(false);
    expect(orders.docs[0]?.status).toBe('pending');
  });

  it('short_shipped: ghi short_quantity, nhả giữ chỗ phần thiếu, tiền giảm trừ = đơn giá × số thiếu', async () => {
    const { cols, orders, items, stockUpdates, vA } = setup();
    await applyPartnerStatusUpdate(cols, { ...input, status: 'short_shipped', items: [{ sku: 'athun-005-den-m', shipped_quantity: 1 }] });
    expect(items.docs[0]?.short_quantity).toBe(1);
    expect(items.docs[1]?.short_quantity).toBeUndefined(); // SKU không gửi = giao đủ
    expect(orders.docs[0]).toMatchObject({ short_refund_amount: 200000, status: 'pending' });
    expect(stockUpdates).toHaveLength(1);
    expect(String((stockUpdates[0]?.filter as Doc).variant_id)).toBe(String(vA));
  });

  it('short_shipped gửi lại cùng số → không nhả giữ chỗ lần 2 (đặt tuyệt đối)', async () => {
    const { cols, stockUpdates } = setup();
    const msg = { ...input, status: 'short_shipped' as const, items: [{ sku: 'ATHUN-005-DEN-M', shipped_quantity: 1 }] };
    await applyPartnerStatusUpdate(cols, msg);
    await applyPartnerStatusUpdate(cols, { ...msg, idempotencyKey: 'k2' });
    expect(stockUpdates).toHaveLength(1);
  });

  it('short_shipped thiếu toàn bộ → coi như người bán hủy', async () => {
    const { cols, orders } = setup();
    await applyPartnerStatusUpdate(cols, {
      ...input, status: 'short_shipped',
      items: [{ sku: 'ATHUN-005-DEN-M', shipped_quantity: 0 }, { sku: 'ATHUN-005-DEN-L', shipped_quantity: 0 }],
    });
    expect(orders.docs[0]).toMatchObject({ status: 'cancelled', cancel_source: 'seller', short_refund_amount: 600000 });
  });

  it('returned: cộng lại tồn website đúng 1 lần (deducted → restocked)', async () => {
    const { cols, orders, stockUpdates } = setup({ fulfillment_status: 'shipped_back', stock_state: 'deducted' });
    await applyPartnerStatusUpdate(cols, { ...input, status: 'returned' });
    expect(orders.docs[0]?.stock_state).toBe('restocked');
    expect(stockUpdates).toHaveLength(2);
    await applyPartnerStatusUpdate(cols, { ...input, status: 'returned', idempotencyKey: 'k3' });
    expect(stockUpdates).toHaveLength(2);
  });
});

describe('computeReturnRefund', () => {
  const lines = [{ sku_snapshot: 'A', quantity: 2, line_total: 300000 }];
  it('đơn giá thực × số trả', () => {
    expect(computeReturnRefund('return_refund', [{ sku: 'a', quantity: 1 }], lines)).toBe(150000);
  });
  it('đổi hàng → 0; trả quá số mua → chặn ở số mua', () => {
    expect(computeReturnRefund('exchange', [{ sku: 'A', quantity: 1 }], lines)).toBe(0);
    expect(computeReturnRefund('refund_only', [{ sku: 'A', quantity: 5 }], lines)).toBe(300000);
  });
});

describe('sellableQuantity', () => {
  const stock = { quantity_on_hand: 5, reserved_quantity: 2 };
  afterEach(() => { delete process.env.STOREFRONT_REQUIRE_OPTIPACK_STOCK; });
  it('mặc định: SKU website tự quản → 0; SKU OptiPack quản → tồn − giữ chỗ', () => {
    expect(sellableQuantity({ stock_source: 'storefront' }, stock)).toBe(0);
    expect(sellableQuantity({ stock_source: 'optipack' }, stock)).toBe(3);
  });
  it('tắt quy tắc → bán theo tồn website', () => {
    process.env.STOREFRONT_REQUIRE_OPTIPACK_STOCK = 'false';
    expect(sellableQuantity({ stock_source: 'storefront' }, stock)).toBe(3);
  });
});
