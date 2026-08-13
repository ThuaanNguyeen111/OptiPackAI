//!=============================================
// STRICT FIX: thay cho pattern `configService.get<string>('x')!` (non-null
// assertion — bị ESLint no-non-null-assertion chặn). Hàm này validate thật
// sự lúc runtime, fail nhanh với thông báo rõ ràng thay vì âm thầm cast.
//!=============================================
export function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${key}`);
  }
  return value;
}
