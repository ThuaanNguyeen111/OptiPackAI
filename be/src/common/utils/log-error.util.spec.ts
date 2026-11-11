import { AxiosError, AxiosHeaders } from 'axios';
import { describeError } from './log-error.util';
import { AppException } from '../exceptions/app-exception';

describe('describeError — log 1 dòng, không lộ bí mật', () => {
  const config = (url: string, extra: Record<string, unknown> = {}): never =>
    ({ method: 'get', url, headers: new AxiosHeaders({ Authorization: 'Bearer SECRET-HEADER' }), ...extra }) as never;

  it('lỗi mạng (sàn giả lập tắt) → method + path, KHÔNG có access_token / sign trong query', () => {
    const err = new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED',
      config('http://localhost:4000/rest/orders/get?app_key=1&access_token=SECRET-TOKEN&sign=SECRET-SIGN'));
    const line = describeError(err);
    expect(line).toBe('GET http://localhost:4000/rest/orders/get → ECONNREFUSED');
    expect(line).not.toMatch(/SECRET/);
  });

  it('sàn trả lỗi → HTTP status + code/message ngắn; không ghi body gửi đi (client_secret)', () => {
    const err = new AxiosError('fail', 'ERR_BAD_REQUEST',
      config('/auth/token', { method: 'post', baseURL: 'https://api.tiki.vn', data: 'client_secret=SECRET-BODY' }),
      undefined,
      { status: 401, statusText: '', headers: {}, config: config('/auth/token'), data: { error: { code: 'invalid_client', message: 'bad secret' } } });
    const line = describeError(err);
    expect(line).toBe('POST https://api.tiki.vn/auth/token → HTTP 401 (code=invalid_client, message=bad secret)');
    expect(line).not.toMatch(/SECRET/);
  });

  it('kiểu Lazada { code, message } ở gốc body', () => {
    const err = new AxiosError('fail', 'ERR', config('https://api.lazada.vn/rest/orders/get?access_token=SECRET'), undefined,
      { status: 500, statusText: '', headers: {}, config: config('x'), data: { code: 'ServiceTimeout', message: 'timeout', request_id: 'r' } });
    expect(describeError(err)).toBe('GET https://api.lazada.vn/rest/orders/get → HTTP 500 (code=ServiceTimeout, message=timeout)');
  });

  it('AppException → mã lỗi + câu; Error khác → tên + câu; giá trị lạ → chuỗi', () => {
    expect(describeError(new AppException('ORD_SYNC_FAILED', 'Không lấy được đơn'))).toBe('ORD_SYNC_FAILED: Không lấy được đơn');
    expect(describeError(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
    expect(describeError('boom')).toBe('boom');
  });
});
