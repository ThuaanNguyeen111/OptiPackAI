import { OrderGroupsService } from './order-groups.service';

/** (16/11/2026) Danh sách Hỏa Tốc ở Tổng quan (mobile) lọc theo khoảng ngày tạo nhóm. */
describe('OrderGroupsService.listOrderGroups — from/to', () => {
  let queries: Record<string, unknown>[];
  let service: OrderGroupsService;

  beforeEach(() => {
    queries = [];
    const find = (query: Record<string, unknown>): unknown => {
      queries.push(query);
      return { sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) };
    };
    const x = {} as never;
    service = new OrderGroupsService({ find } as never, x, x, x, x, x, x, x, x, x, x, x, x, x);
  });

  const from = new Date('2026-11-01T00:00:00Z');
  const to = new Date('2026-11-08T00:00:00Z');

  it('lọc created_at trong [from, to), áp cho cả nhóm hỏa tốc được ghim', async () => {
    await service.listOrderGroups({ orderPriority: 'express', from, to });
    expect(queries.map((q) => q.created_at)).toEqual([
      { $gte: from, $lt: to },
      { $gte: from, $lt: to },
    ]);
  });

  it('có cả before thì lấy mốc sớm hơn làm cận trên', async () => {
    const before = new Date('2026-11-05T00:00:00Z');
    await service.listOrderGroups({ from, to, before });
    expect(queries[0]?.created_at).toEqual({ $gte: from, $lt: before });
  });
});
