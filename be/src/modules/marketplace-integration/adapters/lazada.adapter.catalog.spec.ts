import { LazadaAdapter, toLazadaProductDate } from './lazada.adapter';

const mockGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]): unknown => mockGet(...args),
    isAxiosError: (): boolean => false,
  },
}));

//!=============================================
// 04/10/2026 — GetProducts theo catalog (không lọc sku_seller_list): tham số đúng,
// chịu được trang rỗng (Lazada bỏ hẳn `data`/`products`).
//!=============================================
describe('LazadaAdapter — listProductsPage', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'marketplace.lazada.appKey': 'APPKEY',
        'marketplace.lazada.appSecret': 'SECRET',
        'marketplace.lazada.redirectUri': 'http://localhost/cb',
        'marketplace.lazada.apiBaseUrl': 'https://api.lazada.vn/rest',
      };
      return values[key];
    }),
  };
  let adapter: LazadaAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new LazadaAdapter(config as never);
  });

  function sentParams(): Record<string, unknown> {
    const calls = mockGet.mock.calls as [
      string,
      { params?: Record<string, unknown> },
    ][];
    return calls[0]?.[1].params ?? {};
  }

  it('gửi filter=all, limit, offset, update_after; KHÔNG gửi sku_seller_list', async () => {
    mockGet.mockResolvedValue({
      data: {
        code: '0',
        data: { total_products: '1', products: [{ item_id: '1', skus: [] }] },
      },
    });

    const res = await adapter.listProductsPage('TOKEN', {
      updatedAfter: new Date('2026-10-04T08:00:00Z'),
      offset: 50,
      limit: 50,
    });

    const p = sentParams();
    expect(p).toMatchObject({
      access_token: 'TOKEN',
      filter: 'all',
      limit: 50,
      offset: 50,
      update_after: '2026-10-04T08:00:00+0000',
    });
    expect(p).not.toHaveProperty('sku_seller_list');
    expect(res).toEqual({ products: [{ item_id: '1', skus: [] }], total: 1 });
  });

  it('updatedAfter = null -> không gửi update_after', async () => {
    mockGet.mockResolvedValue({
      data: { code: '0', data: { total_products: '0', products: [] } },
    });

    await adapter.listProductsPage('TOKEN', {
      updatedAfter: null,
      offset: 0,
      limit: 50,
    });

    expect(sentParams()).not.toHaveProperty('update_after');
  });

  it('trang rỗng Lazada bỏ hẳn data -> trả mảng rỗng, không lỗi', async () => {
    mockGet.mockResolvedValue({ data: { code: '0' } });

    await expect(
      adapter.listProductsPage('TOKEN', {
        updatedAfter: null,
        offset: 0,
        limit: 50,
      }),
    ).resolves.toEqual({ products: [], total: 0 });
  });

  it('code khác "0" -> ném lỗi', async () => {
    mockGet.mockResolvedValue({
      data: { code: 'IllegalAccessToken', message: 'invalid token' },
    });

    await expect(
      adapter.listProductsPage('TOKEN', {
        updatedAfter: null,
        offset: 0,
        limit: 50,
      }),
    ).rejects.toThrow('invalid token');
  });

  it('toLazadaProductDate: bỏ mili-giây và Z, dùng +0000 (tránh E017 Invalid Date Format)', () => {
    expect(toLazadaProductDate(new Date('2026-10-04T15:26:51.619Z'))).toBe(
      '2026-10-04T15:26:51+0000',
    );
  });
});
