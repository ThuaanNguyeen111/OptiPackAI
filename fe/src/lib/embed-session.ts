import { writeSession } from './auth-storage'
import { isUserRole } from '../types/auth'

/**
 * Chế độ nhúng: app mobile mở các trang `/embed/*` trong WebView (xem khung 3D đóng gói).
 *
 * App đưa phiên đăng nhập qua **fragment** của URL (`#t=<access>&r=<role>&a=<địa chỉ API>`):
 * fragment không gửi lên máy chủ và không vào log. Hàm này chạy trước khi React dựng, ghi phiên vào
 * `localStorage` của WebView rồi xoá fragment khỏi thanh địa chỉ.
 *
 * Chỉ truyền access token. Refresh token là giá trị giữ chỗ: refresh token của BE xoay vòng và có
 * phát hiện dùng lại, nên nếu WebView cũng tự làm mới thì sẽ làm app bị đăng xuất. Hết hạn thì
 * trang báo để app mở lại bằng token mới.
 */
const EMBED_FLAG = 'optipack-embed'
const EMBED_API = 'optipack-embed-api'

export function bootstrapEmbedSession(): void {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.startsWith('/embed/')) return

  const hash = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(hash)
  const accessToken = params.get('t')
  const role = Number(params.get('r'))
  const api = params.get('a')

  sessionStorage.setItem(EMBED_FLAG, '1')
  if (api) sessionStorage.setItem(EMBED_API, api.replace(/\/+$/, ''))
  if (accessToken && isUserRole(role)) {
    writeSession({
      accessToken,
      refreshToken: 'embed',
      role,
      mustChangePassword: false,
    })
  }
  // Xoá fragment (chứa token) khỏi lịch sử trình duyệt.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

// Chạy ngay khi file được nạp: `lib/api.ts` đọc `embedApiBase()` lúc nạp module (trước khi `main.tsx`
// chạy), nên phiên và địa chỉ API phải được ghi trước đó.
bootstrapEmbedSession()

export function isEmbedMode(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem(EMBED_FLAG) === '1'
}

/** Địa chỉ API do app truyền vào (trong WebView `localhost` là chính điện thoại, không phải máy dev). */
export function embedApiBase(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(EMBED_API)
}
