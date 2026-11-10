import { OrderSchema } from './order.schema';

// 10/11/2026 (BE-3) — truy vấn theo nhóm (`find({ consolidated_group_id })`) không lọc is_consolidated,
// nên index phải là index thường; partial `is_consolidated: true` làm MongoDB quét cả bảng orders.
describe('orders — index consolidated_group_id', () => {
  it('là index thường (không partial), đúng 1 index trên field này', () => {
    const matches = OrderSchema.indexes().filter(([keys]) => Object.keys(keys).join(',') === 'consolidated_group_id');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]?.partialFilterExpression).toBeUndefined();
  });
});
