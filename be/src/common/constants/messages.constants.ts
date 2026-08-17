
//!=============================================

export const AUTH_MESSAGES = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác.',
  ACCOUNT_LOCKED_FAILED_ATTEMPTS:
    'Tài khoản tạm khóa do đăng nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.',
  ACCOUNT_INACTIVE: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ Quản trị viên.',
  ACCOUNT_LOCKED_PASSWORD_DEADLINE:
    'Tài khoản đã bị khóa do chưa đổi mật khẩu trong 72 giờ kể từ khi được cấp. Vui lòng liên hệ Quản trị viên để được mở khóa.',
  MFA_MISCONFIGURED:
    'Cấu hình xác thực 2 lớp của tài khoản không hợp lệ. Vui lòng liên hệ Quản trị viên.',
  MFA_BACKUP_CODE_INVALID: 'Mã dự phòng không chính xác hoặc đã được sử dụng.',
  MFA_TOKEN_INVALID: 'Mã xác thực không chính xác.',
  CURRENT_PASSWORD_INVALID: 'Mật khẩu hiện tại không chính xác.',
  RESET_TOKEN_INVALID: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
  PASSWORD_RESET_SUCCESS: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
  FORGOT_PASSWORD_GENERIC:
    'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư.',
  CHANGE_PASSWORD_SUCCESS: 'Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được đăng xuất.',
  LOGOUT_SUCCESS: 'Đăng xuất thành công.',
  MFA_SETUP_NOT_STARTED: 'Chưa thiết lập xác thực 2 lớp. Vui lòng gọi bước thiết lập trước.',
  MFA_ENABLED_SUCCESS:
    'Xác thực 2 lớp đã được kích hoạt. Vui lòng lưu lại 10 mã dự phòng bên dưới ở nơi an toàn — mỗi mã chỉ hiển thị một lần và chỉ dùng được một lần.',
  MFA_DISABLED_BY_ADMIN:
    'Xác thực 2 lớp đã được tắt. Vui lòng thiết lập lại từ đầu nếu muốn bật lại.',
  USER_REACTIVATED: 'Tài khoản đã được kích hoạt lại.',
  USER_DEACTIVATED: 'Tài khoản đã được vô hiệu hóa và các phiên đăng nhập liên quan đã bị thu hồi.',
} as const;

export const GOOGLE_OAUTH_MESSAGES = {
  STATE_MISSING: 'Thiếu tham số xác thực. Yêu cầu đăng nhập Google không hợp lệ.',
  STATE_INVALID: 'Phiên đăng nhập Google đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
  GOOGLE_AUTH_FAILED: 'Xác thực với Google thất bại. Vui lòng thử lại.',
  GOOGLE_RESPONSE_FORMAT_INVALID: 'Phản hồi từ Google không đúng định dạng mong đợi.',
  EMAIL_NOT_VERIFIED: 'Email Google của bạn chưa được xác thực.',
  ACCOUNT_NOT_REGISTERED:
    'Email này chưa được đăng ký trong hệ thống. Vui lòng liên hệ Quản trị viên để được cấp tài khoản.',
} as const;


export enum GoogleOAuthErrorCode {
  MISSING_CODE = 'missing_code',
  INVALID_STATE = 'invalid_state',
  EMAIL_NOT_VERIFIED = 'email_not_verified',
  ACCOUNT_NOT_REGISTERED = 'account_not_registered',
  ACCOUNT_INACTIVE = 'account_inactive',
  ACCOUNT_LOCKED = 'account_locked',
  SERVER_ERROR = 'server_error',
}
