import { Types } from 'mongoose';
import { PackagingBagService } from './packaging-bag.service';

/** Kho túi giả: mỗi lần đọc thấy số đã trừ ở các dòng trước (cùng giao dịch). */
function setup(stock: Record<string, number>): {
  service: PackagingBagService;
  movements: Record<string, unknown>[];
  stock: Record<string, number>;
} {
  const bags = new Map(
    Object.keys(stock).map((code) => [code, { _id: new Types.ObjectId(), code, name: `Túi ${code}`, reorder_level: 10 }]),
  );
  const movements: Record<string, unknown>[] = [];
  const bagModel = {
    findOne: jest.fn(({ code }: { code: string }) => {
      const bag = bags.get(code);
      return { session: () => Promise.resolve(bag ? { ...bag, quantity_on_hand: stock[code] } : null) };
    }),
    updateOne: jest.fn((filter: { _id: Types.ObjectId; quantity_on_hand: { $gte: number } }, update: { $inc: { quantity_on_hand: number } }) => {
      const code = [...bags.values()].find((b) => b._id.equals(filter._id))?.code;
      if (!code || (stock[code] ?? 0) < filter.quantity_on_hand.$gte) return Promise.resolve({ modifiedCount: 0 });
      stock[code] = (stock[code] ?? 0) + update.$inc.quantity_on_hand;
      return Promise.resolve({ modifiedCount: 1 });
    }),
  };
  const movementModel = {
    create: jest.fn((docs: Record<string, unknown>[]) => {
      movements.push(...docs);
      return Promise.resolve(docs);
    }),
  };
  return { service: new PackagingBagService(bagModel as never, movementModel as never), movements, stock };
}

describe('PackagingBagService.consumeForParcels', () => {
  const ref = { groupId: new Types.ObjectId(), planId: new Types.ObjectId() };

  it('trừ đủ: ghi sổ consume từng kiện, trả before/after để cảnh báo tồn thấp', async () => {
    const { service, movements, stock } = setup({ 'ZIP-M': 12 });
    const out = await service.consumeForParcels(
      {} as never,
      [
        { code: 'ZIP-M', quantity: 2, parcelNo: 1 },
        { code: 'ZIP-M', quantity: 1, parcelNo: 2 },
      ],
      ref,
      'u1',
    );
    expect(stock['ZIP-M']).toBe(9);
    expect(out.shortfalls).toEqual([]);
    expect(out.consumed).toEqual([{ code: 'ZIP-M', name: 'Túi ZIP-M', before: 12, after: 9, reorderLevel: 10 }]);
    expect(movements.map((m) => [m.parcel_no, m.delta, m.type])).toEqual([
      [1, -2, 'consume'],
      [2, -1, 'consume'],
    ]);
  });

  it('thiếu túi: KHÔNG chặn — trừ phần có, trả phần thiếu theo kiện', async () => {
    const { service, stock } = setup({ 'ZIP-M': 1 });
    const out = await service.consumeForParcels({} as never, [{ code: 'ZIP-M', quantity: 3, parcelNo: 1 }], ref, 'u1');
    expect(stock['ZIP-M']).toBe(0);
    expect(out.shortfalls).toEqual([{ parcelNo: 1, code: 'ZIP-M', missing: 2 }]);
  });

  it('mã túi không còn trong danh mục: ghi thiếu toàn bộ, không lỗi', async () => {
    const { service } = setup({});
    const out = await service.consumeForParcels({} as never, [{ code: 'ZIP-X', quantity: 2, parcelNo: 3 }], ref, 'u1');
    expect(out.shortfalls).toEqual([{ parcelNo: 3, code: 'ZIP-X', missing: 2 }]);
    expect(out.consumed).toEqual([]);
  });
});
