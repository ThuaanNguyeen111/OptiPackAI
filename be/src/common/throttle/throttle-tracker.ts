import { JwtService } from '@nestjs/jwt';

/**
 * ===================================================================
 * Khóa đếm giới hạn gọi API (throttler) — theo user khi đã đăng nhập
 * ===================================================================
 * Trước đây đếm theo IP. Cả kho dùng chung 1 wifi (1 IP qua NAT) nên
 * 600 lần/phút bị chia cho mọi máy — thêm app mobile quét liên tục là
 * dễ 429 giả. Giờ:
 *   - có access token HỢP LỆ (đúng chữ ký, còn hạn) → đếm theo `user:<sub>`;
 *   - không có / token sai → đếm theo `ip:<ip>` như cũ (login,
 *     forgot-password... vẫn chặn dò mật khẩu theo IP).
 * Phải verify chữ ký: nếu chỉ decode, kẻ gian tự đặt `sub` ngẫu nhiên
 * mỗi request là có bộ đếm mới, vượt giới hạn.
 * ThrottlerGuard chạy (APP_GUARD) TRƯỚC JwtAuthGuard nên chưa có
 * req.user — tự đọc header ở đây.
 * ===================================================================
 */
export function makeThrottleTracker(
  accessSecret: string | undefined,
): (req: Record<string, unknown>) => string {
  const jwt = new JwtService({});
  return (req) => {
    const headers = req.headers as Record<string, unknown> | undefined;
    const auth = headers?.authorization;
    if (
      accessSecret &&
      typeof auth === 'string' &&
      auth.startsWith('Bearer ')
    ) {
      try {
        const payload = jwt.verify<{ sub?: unknown }>(auth.slice(7), {
          secret: accessSecret,
          algorithms: ['HS256'],
        });
        if (typeof payload.sub === 'string' && payload.sub !== '') {
          return `user:${payload.sub}`;
        }
      } catch {
        // token sai / hết hạn → đếm theo IP
      }
    }
    const ip = typeof req.ip === 'string' && req.ip !== '' ? req.ip : 'unknown';
    return `ip:${ip}`;
  };
}
