import { createHmac } from 'crypto';
import { LazadaAdapter } from './lazada.adapter';

const mockPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]): unknown => mockPost(...args),
    isAxiosError: (): boolean => false,
  },
}));

//!=============================================
// 02/10/2026 — Pack (/order/fulfill/pack): API GHI đầu tiên lên Lazada.
// Kiểm tra: gọi đúng endpoint, gửi form-urlencoded, packReq là JSON, chữ ký đúng
// công thức (path + tham số sắp xếp, HMAC-SHA256 UPPERCASE), KHÔNG tự retry.
//!=============================================
describe('LazadaAdapter — packOrders', () => {
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

  const request = {
    pack_order_list: [
      { order_id: 560694402192001, order_item_list: [560694402292001] },
    ],
    delivery_type: 'dropship' as const,
    shipping_allocate_type: 'TFS',
  };

  it('POST đúng endpoint, body form-urlencoded có packReq JSON + access_token + chữ ký hợp lệ', async () => {
    mockPost.mockResolvedValue({
      data: { code: '0', result: { success: true } },
    });

    await adapter.packOrders('TOKEN', request);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, options] = mockPost.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://api.lazada.vn/rest/order/fulfill/pack');
    expect(options.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );

    const params = Object.fromEntries(new URLSearchParams(body));
    expect(params.access_token).toBe('TOKEN');
    expect(JSON.parse(params.packReq ?? '{}')).toEqual(request);

    const { sign, ...rest } = params;
    const stringToSign =
      '/order/fulfill/pack' +
      Object.entries(rest)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}${v}`)
        .join('');
    expect(sign).toBe(
      createHmac('sha256', 'SECRET')
        .update(stringToSign)
        .digest('hex')
        .toUpperCase(),
    );
  });

  it('code khác "0" -> ném lỗi', async () => {
    mockPost.mockResolvedValue({
      data: { code: 'IllegalAccessToken', message: 'invalid token' },
    });

    await expect(adapter.packOrders('TOKEN', request)).rejects.toThrow(
      'invalid token',
    );
  });

  it('lỗi mạng -> KHÔNG tự gửi lại (API ghi)', async () => {
    mockPost.mockRejectedValue(new Error('ECONNRESET'));

    await expect(adapter.packOrders('TOKEN', request)).rejects.toThrow(
      'ECONNRESET',
    );
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
