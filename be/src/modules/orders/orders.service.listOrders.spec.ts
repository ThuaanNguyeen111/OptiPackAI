import { OrdersService } from './orders.service';

/** (16/11/2026) Mobile tìm đơn theo mã hoặc tên người nhận — BE lọc, không tải 100 đơn rồi lọc trên máy. */
describe('OrdersService.listOrders — tìm theo q', () => {
  let lastQuery: Record<string, unknown> = {};
  let service: OrdersService;

  beforeEach(() => {
    const find = (query: Record<string, unknown>): unknown => {
      lastQuery = query;
      return { sort: () => ({ limit: () => Promise.resolve([]) }) };
    };
    service = new OrdersService({ find } as never, {} as never, {}, {} as never, {} as never);
  });

  const queryOf = async (q: string): Promise<Record<string, unknown>> => {
    await service.listOrders({ q, limit: 20 });
    return lastQuery;
  };

  it('khớp mã đơn sàn, số đơn hoặc tên người nhận; tên không phân biệt hoa thường', async () => {
    const query = await queryOf('  Nguyễn An ');
    const or = query.$or as Record<string, RegExp>[];
    expect(or.map((c) => Object.keys(c)[0])).toEqual([
      'platform_order_id',
      'platform_order_number',
      'recipient.full_name',
    ]);
    const name = or[2]?.['recipient.full_name'];
    expect(name?.test('ông NGUYỄN AN')).toBe(true);
    expect(or[0]?.platform_order_id?.test('Nguyễn An')).toBe(true);
  });

  it('ký tự đặc biệt trong q được hiểu nguyên văn, không thành regex', async () => {
    const or = (await queryOf('a.c(')).$or as Record<string, RegExp>[];
    expect(or[2]?.['recipient.full_name']?.test('abc(')).toBe(false);
    expect(or[2]?.['recipient.full_name']?.test('a.c(')).toBe(true);
  });

  it('q rỗng thì không lọc', async () => {
    expect((await queryOf('   ')).$or).toBeUndefined();
  });
});
