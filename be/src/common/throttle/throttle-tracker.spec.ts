import { JwtService } from '@nestjs/jwt';
import { makeThrottleTracker } from './throttle-tracker';

describe('makeThrottleTracker', () => {
  const secret = 'test-secret';
  const jwt = new JwtService({ secret });
  const tracker = makeThrottleTracker(secret);
  const bearer = (token: string): Record<string, unknown> => ({
    ip: '10.0.0.5',
    headers: { authorization: `Bearer ${token}` },
  });

  it('token hợp lệ → đếm theo user', () => {
    const token = jwt.sign({ sub: 'u1' }, { algorithm: 'HS256' });
    expect(tracker(bearer(token))).toBe('user:u1');
  });

  it('2 user cùng IP có bộ đếm riêng', () => {
    const a = tracker(bearer(jwt.sign({ sub: 'a' })));
    const b = tracker(bearer(jwt.sign({ sub: 'b' })));
    expect(a).not.toBe(b);
  });

  it('token ký bằng secret khác → đếm theo IP', () => {
    const forged = new JwtService({ secret: 'other' }).sign({ sub: 'x' });
    expect(tracker(bearer(forged))).toBe('ip:10.0.0.5');
  });

  it('token hết hạn → đếm theo IP', () => {
    const expired = jwt.sign({
      sub: 'u1',
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    expect(tracker(bearer(expired))).toBe('ip:10.0.0.5');
  });

  it('không có token → đếm theo IP', () => {
    expect(tracker({ ip: '10.0.0.6', headers: {} })).toBe('ip:10.0.0.6');
    expect(tracker({ headers: {} })).toBe('ip:unknown');
  });

  it('thiếu secret cấu hình → luôn theo IP', () => {
    const token = jwt.sign({ sub: 'u1' });
    expect(makeThrottleTracker(undefined)(bearer(token))).toBe('ip:10.0.0.5');
  });
});
