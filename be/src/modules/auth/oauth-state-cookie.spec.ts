import { readCookie } from './auth.controller';

// AOFP-338 F-50 — callback Google so `state` trên URL với cookie của chính trình duyệt đã bắt đầu đăng nhập.
describe('readCookie', () => {
  it('đọc đúng cookie trong header nhiều cookie, giải mã %', () => {
    expect(readCookie('a=1; op_oauth_state=x.y%3Dz; b=2', 'op_oauth_state')).toBe('x.y=z');
  });

  it('không có cookie / header trống → undefined (callback từ chối)', () => {
    expect(readCookie('a=1', 'op_oauth_state')).toBeUndefined();
    expect(readCookie(undefined, 'op_oauth_state')).toBeUndefined();
  });
});
