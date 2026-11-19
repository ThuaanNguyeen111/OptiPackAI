export const USER_ERROR_CODES = {
  EMAIL_IN_USE: 'USER_EMAIL_IN_USE',
  EMAIL_INACTIVE: 'USER_EMAIL_INACTIVE',
  NOT_FOUND: 'USER_NOT_FOUND', // (09/10/2026) 404 — id không tồn tại
  LEAVE_NOT_STAFF: 'USER_LEAVE_NOT_STAFF', // 22/10/2026 — 422 nghỉ phép chỉ áp cho nhân viên kho/đóng gói/vận chuyển
  LEAVE_UNTIL_PAST: 'USER_LEAVE_UNTIL_PAST', // 22/10/2026 — 400 hạn nghỉ phép đã qua
  SELF_ACTION_FORBIDDEN: 'USR_SELF_ACTION_FORBIDDEN', // AOFP-335 — 403 Admin tự khoá / tự đổi vai trò / tự reset mật khẩu
  LAST_ADMIN: 'USR_LAST_ADMIN', // AOFP-335 — 409 hạ quyền hoặc khoá Admin cuối cùng còn hoạt động
} as const;
