/**
 * Mã thao tác gửi kèm các lệnh ghi (`client_event_id`) để BE nhận ra "cùng một lần bấm"
 * khi app gửi lại do mất mạng, hết hạn token hoặc bấm đúp.
 */
export function newClientEventId(prefix = 'op'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
