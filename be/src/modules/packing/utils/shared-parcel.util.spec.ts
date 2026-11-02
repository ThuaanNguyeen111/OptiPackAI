import { Types } from 'mongoose';
import { expandToUnits } from '../../packaging/engine/units';
import { tee, jean } from '../../packaging/engine/scenarios/order-scenarios';
import { bucketAllocations, orderIdsOf, parcelHasOrder, prefixUnits, unitsOfParcelFrom } from './shared-parcel.util';

/** AOFP-224 — PACKAGING_STANDARD §8: kiện gộp nhiều đơn cùng người nhận. */
describe('shared-parcel.util', () => {
  const alloc = (id: string, key: string | null): { order_id: string; consolidation_key: string | null } => ({
    order_id: id,
    consolidation_key: key,
  });

  it('AURELLE: gom đơn cùng khóa gộp, giữ thứ tự; khóa null đứng riêng', () => {
    const buckets = bucketAllocations([alloc('a', 'k1'), alloc('b', null), alloc('c', 'k1'), alloc('d', 'k2')], 'aurelle');
    expect(buckets.map((b) => b.map((x) => x.order_id))).toEqual([['a', 'c'], ['b'], ['d']]);
  });

  it('Lazada: luôn mỗi đơn 1 bài', () => {
    const buckets = bucketAllocations([alloc('a', 'k1'), alloc('b', 'k1')], 'lazada');
    expect(buckets).toHaveLength(2);
  });

  it('orderIdsOf / parcelHasOrder: dữ liệu cũ không có order_ids = [order_id]', () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    expect(orderIdsOf({ order_id: a, order_ids: [] })).toEqual([a]);
    expect(parcelHasOrder({ order_id: a, order_ids: [a, b] }, b.toString())).toBe(true);
    expect(parcelHasOrder({ order_id: a }, b.toString())).toBe(false);
  });

  it('unitsOfParcelFrom: dựng lại đúng món của kiện gộp và kiện 1 đơn trong bài gộp', () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const allocations = [
      { order_id: a.toString(), platform_order_id: 'AUR-A', units: expandToUnits([tee(1)]) },
      { order_id: b.toString(), platform_order_id: 'AUR-B', units: expandToUnits([jean(1)]) },
    ];
    const keysA = prefixUnits(allocations[0]?.units ?? [], 'AUR-A').map((u) => u.item_key);
    const keysB = prefixUnits(allocations[1]?.units ?? [], 'AUR-B').map((u) => u.item_key);
    const placement = (k: string): { item_key: string } => ({ item_key: k });

    const shared = unitsOfParcelFrom(
      { order_id: a, order_ids: [a, b], placements: [...keysA, ...keysB].map(placement) as never },
      allocations,
    );
    expect(shared.map((u) => u.item_key).sort()).toEqual([...keysA, ...keysB].sort());

    // Kiện chỉ có hàng đơn B nhưng sinh ra từ bài gộp → mã có tiền tố.
    const onlyB = unitsOfParcelFrom({ order_id: b, order_ids: [b], placements: keysB.map(placement) as never }, allocations);
    expect(onlyB.map((u) => u.item_key)).toEqual(keysB);

    // Kiện 1 đơn thường (mã không tiền tố).
    const plainKeys = (allocations[0]?.units ?? []).map((u) => u.item_key);
    const plain = unitsOfParcelFrom({ order_id: a, order_ids: [a], placements: plainKeys.map(placement) as never }, allocations);
    expect(plain.map((u) => u.item_key)).toEqual(plainKeys);
  });
});
