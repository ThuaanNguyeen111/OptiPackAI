import { deductOrderStock, type StockSettleCollections } from './storefront-stock.util';
import { applyPartnerStatusUpdate, type MinimalCollection } from './aurelle-status-update';

//!=============================================
// 21/10/2026 — hàng rời kho thì trừ hẳn giữ chỗ tồn website, đúng 1 lần.
//!=============================================
function stockCols(flipped = 1): { cols: StockSettleCollections; orders: jest.Mock; stocks: jest.Mock } {
  const orders = jest.fn().mockResolvedValue({ modifiedCount: flipped });
  const stocks = jest.fn().mockResolvedValue({});
  const lines = [{ variant_id: 'v1', quantity: 2 }, { variant_id: 'v2', quantity: 1 }];
  return {
    cols: {
      orders: { updateOne: orders },
      items: { find: () => ({ toArray: () => Promise.resolve(lines) }) },
      stocks: { updateOne: stocks },
    },
    orders,
    stocks,
  };
}

describe('deductOrderStock', () => {
  it('đơn còn giữ chỗ → đánh dấu deducted, bớt cả giữ chỗ lẫn tồn thực, không âm', async () => {
    const { cols, orders, stocks } = stockCols();
    await expect(deductOrderStock(cols, 'o1')).resolves.toBe(true);
    expect(orders).toHaveBeenCalledWith({ _id: 'o1', stock_state: { $in: ['reserved', null] } }, { $set: { stock_state: 'deducted' } });
    expect(stocks).toHaveBeenCalledTimes(2);
    const [filter, pipeline] = stocks.mock.calls[0] as [unknown, { $set: Record<string, unknown> }[]];
    expect(filter).toEqual({ variant_id: 'v1' });
    expect(pipeline[0]?.$set).toMatchObject({
      reserved_quantity: { $max: [0, { $subtract: ['$reserved_quantity', 2] }] },
      quantity_on_hand: { $max: [0, { $subtract: ['$quantity_on_hand', 2] }] },
    });
  });

  it('đã trừ/đã huỷ trước đó → false, không đụng tồn', async () => {
    const { cols, stocks } = stockCols(0);
    await expect(deductOrderStock(cols, 'o1')).resolves.toBe(false);
    expect(stocks).not.toHaveBeenCalled();
  });
});

describe('applyPartnerStatusUpdate — trừ giữ chỗ (21/10/2026)', () => {
  const order = { _id: 'o1', public_order_id: 720000001, status: 'pending', fulfillment_status: 'packed' };
  const collection = (doc: Record<string, unknown> | null): MinimalCollection => ({
    findOne: () => Promise.resolve(doc),
    updateOne: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1, upsertedCount: 1 }),
  });
  const run = (status: 'packed' | 'shipped', stock: StockSettleCollections) => applyPartnerStatusUpdate(
    { orders: collection(order), shipments: collection(null), events: collection(null), stock },
    { publicOrderId: 720000001, status, eventTime: new Date(), idempotencyKey: `k-${status}` },
  );

  it('shipped → trừ tồn', async () => {
    const { cols, orders } = stockCols();
    await run('shipped', cols);
    expect(orders).toHaveBeenCalledTimes(1);
  });

  it('packed → hàng chưa rời kho, không trừ', async () => {
    const { cols, orders } = stockCols();
    await run('packed', cols);
    expect(orders).not.toHaveBeenCalled();
  });
});
