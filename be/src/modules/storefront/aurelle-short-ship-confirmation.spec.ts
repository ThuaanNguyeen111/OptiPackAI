import { Types } from 'mongoose';
import { applyPartnerStatusUpdate, type MinimalCollection, type StatusUpdateCollections } from './aurelle-status-update';
import { toOpenApiOrder, type StorefrontOrderLike } from './aurelle-open-api.mapper';
import { buildBackorderEmail, buildShortShippedEmail } from './aurelle-short-shipped-mail';

//!=============================================
// 27/11/2026 — giao thiếu CHỜ KHÁCH XÁC NHẬN (24 giờ) + "đang chờ bổ sung hàng" (backordered).
//!=============================================
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

const input = { publicOrderId: 1, eventTime: new Date('2026-11-27T03:00:00Z'), idempotencyKey: 'k' };
const deadline = new Date('2026-11-28T03:00:00Z');

describe('AURELLE — giao thiếu chờ khách xác nhận (27/11/2026)', () => {
  it('short_shipped kèm hạn → đơn có short_ship_confirmation pending, vẫn chờ đóng gói', async () => {
    const { cols, orders } = setup();
    await applyPartnerStatusUpdate(cols, { ...input, status: 'short_shipped', items: [{ sku: 'ATHUN-005-DEN-M', shipped_quantity: 1 }], confirmDeadline: deadline });
    expect(orders.docs[0]).toMatchObject({
      short_ship_confirmation: { status: 'pending', deadline_at: deadline, decided_at: null },
      fulfillment_status: 'awaiting_packaging',
      short_refund_amount: 200000,
    });
  });

  it('short_shipped thiếu toàn bộ → hủy đơn, không hỏi khách', async () => {
    const { cols, orders } = setup();
    await applyPartnerStatusUpdate(cols, {
      ...input,
      status: 'short_shipped',
      items: [{ sku: 'ATHUN-005-DEN-M', shipped_quantity: 0 }, { sku: 'ATHUN-005-DEN-L', shipped_quantity: 0 }],
      confirmDeadline: deadline,
    });
    expect(orders.docs[0]?.status).toBe('cancelled');
    expect(orders.docs[0]?.short_ship_confirmation).toBeUndefined();
  });

  it('shop đã đóng gói khi khách chưa trả lời → coi như đồng ý (auto_accepted)', async () => {
    const { cols, orders } = setup({ short_ship_confirmation: { status: 'pending', deadline_at: deadline, decided_at: null } });
    await applyPartnerStatusUpdate(cols, { ...input, idempotencyKey: 'k2', status: 'packed' });
    expect(orders.docs[0]?.['short_ship_confirmation.status']).toBe('auto_accepted');
  });

  it('Open API trả short_ship_decision: pending / accepted; không có đề nghị thì không có field', () => {
    const base = {
      public_order_id: 1, order_number: 'AUR-1', status: 'pending', payment_status: 'unpaid', fulfillment_status: 'awaiting_packaging',
      total_amount: 1, created_at: new Date(), updated_at: new Date(), placed_at: new Date(), customer_note: '',
      shipping_address_snapshot: { recipient_name: 'A', phone: '0900000000', address_line: '1', ward: 'W', province: 'P' },
    } as unknown as StorefrontOrderLike;
    expect(toOpenApiOrder({ ...base, short_ship_confirmation: { status: 'pending' } }, 1).short_ship_decision).toBe('pending');
    expect(toOpenApiOrder({ ...base, short_ship_confirmation: { status: 'auto_accepted' } }, 1).short_ship_decision).toBe('accepted');
    expect(toOpenApiOrder(base, 1).short_ship_decision).toBeUndefined();
  });

  it('email giao thiếu có hạn → yêu cầu chọn Đồng ý / Hủy trước hạn (giờ VN)', () => {
    const { subject, html } = buildShortShippedEmail({
      customerName: 'Lan', orderNumber: 'AUR-1', totalAmount: 630000, shortAmount: 200000, cancelled: false, orderUrl: 'http://x',
      lines: [{ productName: 'Quần', variant: 'Trắng / L', ordered: 3, short: 1, unitPrice: 200000 }],
      confirmDeadline: deadline,
    });
    expect(subject).toBe('Đơn AUR-1 được giao thiếu 1 sản phẩm');
    expect(html).toContain('Đồng ý nhận phần có sẵn');
    expect(html).toContain('10:00 ngày 28/11');
  });
});

describe('AURELLE — đang chờ bổ sung hàng (27/11/2026)', () => {
  it('backordered ghi SKU thiếu; đơn đóng gói sau đó thì tự xoá', async () => {
    const { cols, orders } = setup();
    const res = await applyPartnerStatusUpdate(cols, { ...input, status: 'backordered', missingItems: [{ sku: 'ATHUN-005-DEN-M', missing_quantity: 1 }] });
    expect(res?.applied).toBe(true);
    expect(orders.docs[0]?.backorder).toEqual({ items: [{ sku: 'ATHUN-005-DEN-M', missing_quantity: 1 }], since: input.eventTime });
    await applyPartnerStatusUpdate(cols, { ...input, idempotencyKey: 'k3', status: 'packed', eventTime: new Date('2026-11-27T05:00:00Z') });
    expect(orders.docs[0]?.backorder).toBeNull();
  });

  it('backordered khi đơn đã hủy / đã rời kho → không áp dụng', async () => {
    const { cols, orders } = setup({ fulfillment_status: 'shipped' });
    const res = await applyPartnerStatusUpdate(cols, { ...input, status: 'backordered', missingItems: [{ sku: 'X', missing_quantity: 1 }] });
    expect(res?.applied).toBe(false);
    expect(orders.docs[0]?.backorder).toBeUndefined();
  });

  it('email chờ bổ sung hàng nêu SKU thiếu và cách hủy miễn phí', () => {
    const { subject, html } = buildBackorderEmail({ customerName: 'Lan', orderNumber: 'AUR-1', orderUrl: 'http://x', lines: [{ productName: 'Quần', variant: 'Trắng / L', missing: 1 }] });
    expect(subject).toBe('Đơn AUR-1 đang chờ shop bổ sung hàng');
    expect(html).toContain('hủy đơn miễn phí');
    expect(html).toContain('thiếu 1');
  });
});
