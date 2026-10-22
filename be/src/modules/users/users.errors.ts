export const USER_ERROR_CODES = {
  EMAIL_IN_USE: 'USER_EMAIL_IN_USE',
  EMAIL_INACTIVE: 'USER_EMAIL_INACTIVE',
  NOT_FOUND: 'USER_NOT_FOUND', // (09/10/2026) 404 — id không tồn tại
  LEAVE_NOT_STAFF: 'USER_LEAVE_NOT_STAFF', // 22/10/2026 — 422 nghỉ phép chỉ áp cho nhân viên kho/đóng gói/vận chuyển
  LEAVE_UNTIL_PAST: 'USER_LEAVE_UNTIL_PAST', // 22/10/2026 — 400 hạn nghỉ phép đã qua
} as const;
