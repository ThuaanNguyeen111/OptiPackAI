import axios, { AxiosError, AxiosHeaders } from 'axios';
import { TikiAdapter, TikiApiError, TIKI_CLIENT_CREDENTIALS_MARKER } from './tiki.adapter';

//!=============================================
// 31/10/2026 — Tiki app Inhouse: token client_credentials (Basic AppID:Secret), Bearer cho mọi
// API, thử lại 429/5xx, lỗi 4xx đọc `errors` của Tiki, thiếu cấu hình không làm sập app.
//!=============================================
function config(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] } as never;
}
const cfg = config({ 'marketplace.tiki.clientId': '7463062494373526', 'marketplace.tiki.clientSecret': 'SECRET' });

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError('fail', 'ERR', undefined, undefined, { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } });
}

describe('TikiAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('kết nối thẳng: token client_credentials + đọc nhà bán → shop 365980, không có refresh token thật', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: { access_token: 'AT', expires_in: 1295999, token_type: 'bearer', scope: '' } });
    const request = jest.spyOn(axios, 'request').mockResolvedValue({ data: { id: 365980, name: 'OptiPackAI Test Shop', active: 1 } });
    const result = await new TikiAdapter(cfg).connectDirect();
    const [url, body, options] = post.mock.calls[0] as [string, string, { headers: Record<string, string> }];
    expect(url).toBe('https://api.tiki.vn/sc/oauth2/token');
    expect(body).toBe('grant_type=client_credentials');
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('7463062494373526:SECRET').toString('base64')}`);
    const call = request.mock.calls[0]?.[0] as { url: string; headers: Record<string, string> };
    expect(call.url).toBe('https://api.tiki.vn/integration/v2/sellers/me');
    expect(call.headers.Authorization).toBe('Bearer AT');
    expect(result).toMatchObject({ shopId: '365980', shopName: 'OptiPackAI Test Shop', accessToken: 'AT', refreshToken: TIKI_CLIENT_CREDENTIALS_MARKER });
    expect(result.accessTokenExpiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 24 * 3600_000);
  });

  it('thiếu App ID/Secret → báo lỗi khi dùng, KHÔNG sập lúc khởi tạo', async () => {
    const adapter = new TikiAdapter(config({}));
    await expect(adapter.connectDirect()).rejects.toThrow('TIKI_CLIENT_ID');
  });

  it('429 → thử lại; 400 → ném ngay kèm errors của Tiki', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
    const request = jest.spyOn(axios, 'request')
      .mockRejectedValueOnce(httpError(429, {}))
      .mockResolvedValueOnce({ data: { data: [], paging: { total: 0, current_page: 1, last_page: 0, per_page: 50 } } });
    const adapter = new TikiAdapter(cfg);
    await adapter.listOrders('AT', { createdFrom: '2026-10-01 00:00:00', page: 1, limit: 50, fulfillmentTypes: ['dropship'], excludeStatuses: ['processing'] });
    expect(request).toHaveBeenCalledTimes(2);
    const params = (request.mock.calls[1]?.[0] as { params: Record<string, string> }).params;
    expect(params).toMatchObject({ created_from_date: '2026-10-01 00:00:00', fulfillment_type: 'in|dropship', status: 'nin|processing' });

    request.mockRejectedValueOnce(httpError(400, { errors: ['Order is not queueing'] }));
    const err = await adapter.dropshipConfirmAvailable('AT', 'A1', 'seller_confirmed', 425011).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TikiApiError);
    expect((err as TikiApiError).status).toBe(400);
    expect((err as TikiApiError).message).toContain('Order is not queueing');
  });
});
