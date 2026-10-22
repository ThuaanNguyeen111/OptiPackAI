import {
  applyExchangeShipmentUpdate,
  isExchangeShipmentStatus,
  type ReturnUpdateCollections,
} from './aurelle-return-api';

/** 22/10/2026 — website AURELLE nhận mốc giao hàng đổi từ OptiPack. */
function fakeCols(doc: Record<string, unknown> | null) {
  const keys = new Set<string>();
  const events: Record<string, unknown>[] = [];
  const returnsUpdate = jest.fn((_filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
    if (doc) Object.assign(doc, update.$set);
    return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
  });
  const cols: ReturnUpdateCollections = {
    returns: { findOne: jest.fn(() => Promise.resolve(doc)), updateOne: returnsUpdate },
    events: {
      findOne: jest.fn(() => Promise.resolve(null)),
      updateOne: jest.fn((filter: Record<string, unknown>, update: { $setOnInsert: Record<string, unknown> }) => {
        const key = String(filter.idempotency_key);
        if (keys.has(key)) return Promise.resolve({ matchedCount: 1, modifiedCount: 0, upsertedCount: 0 });
        keys.add(key);
        events.push(update.$setOnInsert);
        return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 });
      }),
    },
  };
  return { cols, events, returnsUpdate };
}

const base = { status: 'shipped' as const, eventTime: new Date('2026-10-22T05:00:00Z'), carrier: 'GHN', trackingCode: 'GHN123', idempotencyKey: 'k1' };

describe('applyExchangeShipmentUpdate', () => {
  it('ghi lịch sử return_exchange_shipped + trạng thái hàng đổi hiện tại; gửi lại cùng khóa không ghi thêm', async () => {
    const doc: Record<string, unknown> = { _id: 'r1', type: 'exchange', order_id: 'o1', exchange_shipment: null };
    const { cols, events } = fakeCols(doc);
    const first = await applyExchangeShipmentUpdate(cols, { returnId: 'r1', ...base });
    expect(first).toMatchObject({ applied: true, status: 'shipped' });
    expect(events[0]).toMatchObject({ status: 'return_exchange_shipped', label: 'Hàng đổi đang giao', tracking_code: 'GHN123' });
    expect(doc.exchange_shipment).toEqual({ status: 'shipped', carrier: 'GHN', tracking_code: 'GHN123', updated_at: base.eventTime });
    const again = await applyExchangeShipmentUpdate(cols, { returnId: 'r1', ...base });
    expect(again).toMatchObject({ applied: false });
    expect(events).toHaveLength(1);
  });

  it('yêu cầu không phải đổi hàng → not_exchange; không có yêu cầu → null', async () => {
    expect(await applyExchangeShipmentUpdate(fakeCols({ _id: 'r2', type: 'return_refund' }).cols, { returnId: 'r2', ...base })).toBe('not_exchange');
    expect(await applyExchangeShipmentUpdate(fakeCols(null).cols, { returnId: 'x', ...base })).toBeNull();
  });

  it('đã giao rồi thì sự kiện muộn không kéo lùi trạng thái; giao thất bại rồi giao lại vẫn nhận', async () => {
    const delivered: Record<string, unknown> = {
      _id: 'r3', type: 'exchange', order_id: 'o1',
      exchange_shipment: { status: 'delivered', updated_at: new Date('2026-10-22T06:00:00Z') },
    };
    const late = await applyExchangeShipmentUpdate(fakeCols(delivered).cols, { returnId: 'r3', ...base, idempotencyKey: 'k3' });
    expect(late).toMatchObject({ applied: false });
    expect((delivered.exchange_shipment as { status: string }).status).toBe('delivered');

    const failed: Record<string, unknown> = {
      _id: 'r4', type: 'exchange', order_id: 'o1',
      exchange_shipment: { status: 'failed_delivery', updated_at: new Date('2026-10-22T04:00:00Z') },
    };
    const retry = await applyExchangeShipmentUpdate(fakeCols(failed).cols, { returnId: 'r4', ...base, idempotencyKey: 'k4' });
    expect(retry).toMatchObject({ applied: true });
  });

  it('isExchangeShipmentStatus chỉ nhận 4 mốc', () => {
    expect(['packed', 'shipped', 'delivered', 'failed_delivery'].every(isExchangeShipmentStatus)).toBe(true);
    expect(isExchangeShipmentStatus('returned')).toBe(false);
  });
});
