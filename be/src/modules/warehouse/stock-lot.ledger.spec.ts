import { Types } from 'mongoose';
import {
  LotAssignmentRef,
  OPENING_LOT_CODE,
  StockLotLedger,
  fifoDateOf,
  netLotsInHand,
  takeFromLots,
} from './stock-lot.ledger';

//!=============================================
// 15/10/2026 — sổ lô hàng, FIFO theo ngày nhập kho.
// Model giả lập đúng phần MongoDB mà sổ lô dùng (find/sort, updateOne có điều
// kiện $gte, upsert, aggregate tổng + lô cũ nhất) để kiểm tra logic thật.
//!=============================================
interface LotRow {
  _id: Types.ObjectId;
  assignment_id: Types.ObjectId;
  bin_location_id: Types.ObjectId;
  master_sku: string | null;
  lot_code: string;
  received_at: Date;
  quantity_received: number;
  quantity_remaining: number;
  source: string;
  [key: string]: unknown;
}

function matches(row: LotRow, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    const actual = row[k];
    if (v && typeof v === 'object' && !(v instanceof Types.ObjectId) && !(v instanceof Date)) {
      const op = v as Record<string, unknown>;
      if ('$gt' in op) return typeof actual === 'number' && actual > (op.$gt as number);
      if ('$gte' in op) return typeof actual === 'number' && actual >= (op.$gte as number);
      if ('$in' in op) return (op.$in as unknown[]).some((x) => String(x) === String(actual));
    }
    if (v instanceof Date) return actual instanceof Date && actual.getTime() === v.getTime();
    return String(actual) === String(v);
  });
}

class FakeLotModel {
  rows: LotRow[] = [];

  private sorted(list: LotRow[]): LotRow[] {
    return [...list].sort((a, b) => a.received_at.getTime() - b.received_at.getTime() || a._id.toString().localeCompare(b._id.toString()));
  }

  create(docs: Record<string, unknown>[]): Promise<LotRow[]> {
    const out = docs.map((d) => {
      const row = { _id: new Types.ObjectId(), ...d } as LotRow;
      this.rows.push(row);
      return row;
    });
    return Promise.resolve(out);
  }

  find(filter: Record<string, unknown>): unknown {
    const list = this.sorted(this.rows.filter((r) => matches(r, filter)));
    const chain = { sort: () => chain, session: () => chain, lean: () => Promise.resolve(list) };
    return chain;
  }

  findOne(filter: Record<string, unknown>): unknown {
    const row = this.sorted(this.rows.filter((r) => matches(r, filter)))[0] ?? null;
    const chain = { sort: () => chain, session: () => chain, lean: () => Promise.resolve(row) };
    return chain;
  }

  updateOne(filter: Record<string, unknown>, update: { $inc: Record<string, number> }): Promise<{ matchedCount: number; modifiedCount: number }> {
    const row = this.rows.find((r) => matches(r, filter));
    if (!row) return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
    for (const [k, d] of Object.entries(update.$inc)) row[k] = (row[k] as number) + d;
    return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
  }

  updateMany(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }): Promise<unknown> {
    for (const row of this.rows.filter((r) => matches(r, filter))) Object.assign(row, update.$set);
    return Promise.resolve({});
  }

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $inc: Record<string, number>; $setOnInsert: Record<string, unknown> },
  ): Promise<LotRow> {
    let row = this.rows.find((r) => matches(r, filter));
    if (!row) {
      row = { _id: new Types.ObjectId(), ...filter, ...update.$setOnInsert, quantity_received: 0, quantity_remaining: 0 } as LotRow;
      this.rows.push(row);
    }
    for (const [k, d] of Object.entries(update.$inc)) row[k] = (row[k] as number) + d;
    return Promise.resolve(row);
  }

  aggregate(pipeline: Record<string, Record<string, unknown>>[]): unknown {
    const match = pipeline[0]?.$match ?? {};
    const list = this.sorted(this.rows.filter((r) => matches(r, match)));
    let result: unknown[];
    const group = pipeline.find((st) => '$group' in st)?.$group;
    if (group?._id === null) {
      result = [{ total: list.reduce((s, r) => s + r.quantity_remaining, 0) }];
    } else {
      const firstBy = new Map<string, LotRow>();
      for (const r of list) if (!firstBy.has(r.assignment_id.toString())) firstBy.set(r.assignment_id.toString(), r);
      result = [...firstBy.values()].map((r) => ({ _id: r.assignment_id, lot_code: r.lot_code, received_at: r.received_at, quantity_remaining: r.quantity_remaining }));
    }
    const promise = Promise.resolve(result);
    return Object.assign(promise, { session: () => promise });
  }

  remaining(assignmentId: Types.ObjectId): number {
    return this.rows.filter((r) => r.assignment_id.equals(assignmentId)).reduce((s, r) => s + r.quantity_remaining, 0);
  }
}

function assignment(createdAt = new Date('2026-09-01T00:00:00Z')): LotAssignmentRef {
  return {
    _id: new Types.ObjectId(),
    warehouse_id: new Types.ObjectId(),
    bin_location_id: new Types.ObjectId(),
    platform: 'lazada',
    shop_id: 'shop-1',
    seller_sku: 'AO-THUN-M',
    master_sku: null,
    created_at: createdAt,
  };
}

const session = {} as never;
const D = (iso: string): Date => new Date(iso);

describe('StockLotLedger — FIFO theo ngày nhập kho', () => {
  let model: FakeLotModel;
  let ledger: StockLotLedger;

  beforeEach(() => {
    model = new FakeLotModel();
    ledger = new StockLotLedger(model as never);
  });

  it('không có model → mọi thao tác là no-op (unit test cũ chạy như trước)', async () => {
    const off = new StockLotLedger();
    expect(off.enabled).toBe(false);
    expect(await off.consume(assignment(), 3, 3, session)).toEqual([]);
    expect(await off.add(assignment(), { quantity: 3, receivedAt: new Date(), source: 'receipt' }, 0, session)).toEqual([]);
  });

  it('2 lô ngày khác nhau, lấy 3: trừ hết lô CŨ (2) rồi 1 ở lô mới', async () => {
    const a = assignment();
    await ledger.add(a, { quantity: 2, receivedAt: D('2026-10-05T00:00:00Z'), source: 'receipt', lotCode: 'LO-MOI' }, 0, session);
    await ledger.add(a, { quantity: 4, receivedAt: D('2026-10-01T00:00:00Z'), source: 'receipt', lotCode: 'LO-CU' }, 2, session);

    const taken = await ledger.consume(a, 5, 6, session);

    expect(taken.map((t) => [t.lot_code, t.quantity])).toEqual([
      ['LO-CU', 4],
      ['LO-MOI', 1],
    ]);
    expect(model.remaining(a._id)).toBe(1);
  });

  it('dòng tồn cũ chưa có lô: tự bù lô tồn đầu kỳ (ngày tạo dòng) và xuất nó TRƯỚC hàng mới nhập', async () => {
    const a = assignment(D('2026-08-01T00:00:00Z'));
    // Dòng đang có 5 cái từ trước khi theo dõi lô; nay nhập thêm lô mới 3 cái.
    await ledger.add(a, { quantity: 3, receivedAt: D('2026-10-10T00:00:00Z'), source: 'receipt', lotCode: 'LO-10' }, 5, session);

    expect(model.rows.map((r) => [r.lot_code, r.quantity_remaining])).toEqual([
      [OPENING_LOT_CODE, 5],
      ['LO-10', 3],
    ]);
    const taken = await ledger.consume(a, 6, 8, session);
    expect(taken.map((t) => [t.lot_code, t.quantity])).toEqual([
      [OPENING_LOT_CODE, 5],
      ['LO-10', 1],
    ]);
  });

  it('trả kệ: cộng lại ĐÚNG lô đã lấy, lô lấy sau cùng trước', async () => {
    const a = assignment();
    await ledger.add(a, { quantity: 2, receivedAt: D('2026-10-01T00:00:00Z'), source: 'receipt', lotCode: 'A' }, 0, session);
    await ledger.add(a, { quantity: 5, receivedAt: D('2026-10-03T00:00:00Z'), source: 'receipt', lotCode: 'B' }, 2, session);
    const taken = await ledger.consume(a, 4, 7, session); // A×2, B×2

    const inHand = netLotsInHand([{ scanned_quantity: 4, lot_allocations: taken }]);
    const back = takeFromLots(inHand, 3).allocations; // B×2 rồi A×1
    const restored = await ledger.restore(a, 3, back, 3, session);

    expect(restored.map((r) => [r.lot_code, r.quantity])).toEqual([
      ['B', 2],
      ['A', 1],
    ]);
    expect(model.rows.map((r) => [r.lot_code, r.quantity_remaining])).toEqual([
      ['A', 1],
      ['B', 5],
    ]);
  });

  it('trả kệ không rõ lô (event cũ): cộng vào lô cũ nhất của dòng', async () => {
    const a = assignment();
    await ledger.add(a, { quantity: 1, receivedAt: D('2026-10-02T00:00:00Z'), source: 'receipt', lotCode: 'B' }, 0, session);
    await ledger.add(a, { quantity: 1, receivedAt: D('2026-10-01T00:00:00Z'), source: 'receipt', lotCode: 'A' }, 1, session);

    const restored = await ledger.restore(a, 2, [], 2, session);

    expect(restored).toEqual([expect.objectContaining({ lot_code: 'A', quantity: 2 })]);
  });

  it('chuyển ô: lô sang ô đích GIỮ nguyên mã + ngày nhập', async () => {
    const from = assignment();
    const to = assignment();
    await ledger.add(from, { quantity: 3, receivedAt: D('2026-09-20T00:00:00Z'), source: 'receipt', lotCode: 'LO-9' }, 0, session);

    const moved = await ledger.consume(from, 2, 3, session);
    await ledger.deposit(to, moved, 0, session);

    const dest = model.rows.filter((r) => r.assignment_id.equals(to._id));
    expect(dest).toHaveLength(1);
    expect(dest[0]).toMatchObject({ lot_code: 'LO-9', quantity_remaining: 2, source: 'transfer' });
    expect(dest[0]?.received_at.toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });

  it('bất biến: tổng lô = tồn sau chuỗi nhập / lấy / trả', async () => {
    const a = assignment();
    let onHand = 0;
    await ledger.add(a, { quantity: 10, receivedAt: D('2026-10-01T00:00:00Z'), source: 'receipt' }, onHand, session);
    onHand += 10;
    const taken = await ledger.consume(a, 7, onHand, session);
    onHand -= 7;
    await ledger.restore(a, 2, takeFromLots(netLotsInHand([{ scanned_quantity: 7, lot_allocations: taken }]), 2).allocations, onHand, session);
    onHand += 2;
    await ledger.add(a, { quantity: 4, receivedAt: D('2026-10-02T00:00:00Z'), source: 'receipt' }, onHand, session);
    onHand += 4;

    expect(model.remaining(a._id)).toBe(onHand);
  });

  it('oldestLots + fifoDateOf: chọn ô có lô cũ nhất; dòng chưa có lô dùng ngày tạo dòng', async () => {
    const binNew = assignment(D('2026-10-01T00:00:00Z'));
    const binOld = assignment(D('2026-10-01T00:00:00Z'));
    const legacy = assignment(D('2026-07-01T00:00:00Z'));
    await ledger.add(binNew, { quantity: 1, receivedAt: D('2026-10-12T00:00:00Z'), source: 'receipt' }, 0, session);
    await ledger.add(binOld, { quantity: 1, receivedAt: D('2026-10-02T00:00:00Z'), source: 'receipt' }, 0, session);

    const oldest = await ledger.oldestLots([binNew._id, binOld._id, legacy._id]);
    const order = [binNew, binOld, legacy].sort((x, y) => fifoDateOf(x, oldest) - fifoDateOf(y, oldest));

    expect(order.map((a) => a._id)).toEqual([legacy._id, binOld._id, binNew._id]);
  });
});
