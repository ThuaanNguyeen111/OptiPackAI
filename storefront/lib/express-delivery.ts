/** 29/10/2026 — giờ hẹn hỏa tốc hiển thị theo giờ Việt Nam (HH:mm, kèm ngày nếu khác hôm nay). */
export function formatPromisedTime(iso: string, now: Date = new Date()) {
  const at = new Date(iso)
  const day = (d: Date) => d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const time = at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  return day(at) === day(now) ? time : `${time} ngày ${day(at)}`
}
