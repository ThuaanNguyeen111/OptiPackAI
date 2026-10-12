/**
 * (09/10/2026) Mã lỗi Auth cho FE phân biệt bằng code thay vì so câu chữ.
 * Exception vẫn là UnauthorizedException/ForbiddenException (giữ HTTP status
 * và `instanceof`), chỉ thêm `error_code` vào body — GlobalExceptionFilter
 * ưu tiên mã này thay cho UNAUTHORIZED/FORBIDDEN chung.
 */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS', // 401 sai email/mật khẩu
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED', // 403 sai quá 5 lần, khóa 15 phút
  ACCOUNT_INACTIVE: 'AUTH_ACCOUNT_INACTIVE', // 401 tài khoản bị vô hiệu hóa
  PASSWORD_DEADLINE_LOCKED: 'AUTH_PASSWORD_DEADLINE_LOCKED', // 403 (login) / 401 (token) quá 72h chưa đổi mật khẩu tạm
  PASSWORD_CHANGE_REQUIRED: 'AUTH_PASSWORD_CHANGE_REQUIRED', // 403 phải đổi mật khẩu trước — FE chuyển sang màn đổi mật khẩu
  MFA_MISCONFIGURED: 'AUTH_MFA_MISCONFIGURED', // 401
  MFA_TOKEN_INVALID: 'AUTH_MFA_TOKEN_INVALID', // 401 mã TOTP sai
  MFA_BACKUP_CODE_INVALID: 'AUTH_MFA_BACKUP_CODE_INVALID', // 401
  MFA_SETUP_NOT_STARTED: 'AUTH_MFA_SETUP_NOT_STARTED', // 401 verify khi chưa gọi setup
  CURRENT_PASSWORD_INVALID: 'AUTH_CURRENT_PASSWORD_INVALID', // 401 đổi mật khẩu, mật khẩu cũ sai
  RESET_TOKEN_INVALID: 'AUTH_RESET_TOKEN_INVALID', // 401 link quên mật khẩu sai/hết hạn
  GOOGLE_AUTH_FAILED: 'AUTH_GOOGLE_AUTH_FAILED', // 401
  GOOGLE_RESPONSE_INVALID: 'AUTH_GOOGLE_RESPONSE_INVALID', // 401
  REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID', // 401
  REFRESH_TOKEN_EXPIRED: 'AUTH_REFRESH_TOKEN_EXPIRED', // 401
  REFRESH_TOKEN_REUSED: 'AUTH_REFRESH_TOKEN_REUSED', // 401 dùng lại token đã xoay — thu hồi mọi phiên
  ROLE_INVALID: 'AUTH_ROLE_INVALID', // 401
  FORBIDDEN_ROLE: 'AUTH_FORBIDDEN_ROLE', // 403 vai trò không được gọi route này
  UNAUTHENTICATED: 'AUTH_UNAUTHENTICATED', // 401
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/** Body cho Unauthorized/ForbiddenException: giữ message, thêm error_code. */
export function authError(code: AuthErrorCode, message: string): { error_code: AuthErrorCode; message: string } {
  return { error_code: code, message };
}
