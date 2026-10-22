/**
 * 22/10/2026 — Trạng thái NGHỈ PHÉP của nhân viên.
 *
 * Người đang nghỉ vẫn đăng nhập/xem được (khác "vô hiệu hóa"), nhưng hệ thống KHÔNG
 * tự giao việc lấy hàng / đóng gói cho họ và giao tay sẽ bị từ chối. `on_leave_until`
 * (tùy chọn) = hết hạn nghỉ thì tự coi như đi làm lại, không cần ai tắt.
 */
export interface OnLeaveFields {
  on_leave?: boolean | null;
  on_leave_until?: Date | null;
}

/** true = đang nghỉ tại thời điểm `now` (nghỉ có hạn mà đã qua hạn thì không tính). */
export function isOnLeave(user: OnLeaveFields | null | undefined, now: Date = new Date()): boolean {
  if (user?.on_leave !== true) return false;
  return !(user.on_leave_until && user.on_leave_until.getTime() <= now.getTime());
}

/** Điều kiện Mongo: nhân viên KHÔNG nghỉ tại `now` — ghép vào bộ lọc tìm người giao việc (dùng trong $and). */
export function notOnLeaveFilter(now: Date = new Date()): Record<string, unknown> {
  return {
    $or: [{ on_leave: { $ne: true } }, { on_leave_until: { $ne: null, $lte: now } }],
  };
}
