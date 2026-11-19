import { clearSession, getAccessToken, getRefreshToken } from './auth-storage'

/**
 * AOFP-334 — phiên hết hạn giữa chừng (refresh trả 401): KHÔNG đẩy về /login.
 * Phát `auth:expired` → SessionExpiredDialog hiện trên trang, form giữ nguyên;
 * mọi request đang chờ đợi `waitForReLogin()` và được gửi lại sau khi đăng nhập lại.
 */
export const AUTH_EXPIRED_EVENT = 'auth:expired'
export const AUTH_RENEWED_EVENT = 'auth:renewed'

let pending: { promise: Promise<boolean>; resolve: (ok: boolean) => void } | null = null
let expiredEmail: string | null = null

function emailFromToken(token: string | null): string | null {
  try {
    const part = token?.split('.')[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { email?: unknown }
    return typeof json.email === 'string' ? json.email : null
  } catch {
    return null
  }
}

export function isWaitingForReLogin(): boolean {
  return pending !== null
}

/** Email của phiên vừa hết (đọc từ access token trước khi xoá) để điền sẵn. */
export function expiredSessionEmail(): string | null {
  return expiredEmail
}

/** true = đã đăng nhập lại (gửi lại request), false = người dùng chọn đăng xuất. */
export function waitForReLogin(): Promise<boolean> {
  if (pending) return pending.promise
  expiredEmail = emailFromToken(getAccessToken())
  clearSession()
  let resolve: (ok: boolean) => void = () => undefined
  const promise = new Promise<boolean>((r) => {
    resolve = r
  })
  pending = { promise, resolve }
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  return promise
}

export function finishReLogin(ok: boolean): void {
  const current = pending
  pending = null
  current?.resolve(ok)
  window.dispatchEvent(new Event(AUTH_RENEWED_EVENT))
}

// Tab khác đăng nhập lại (localStorage dùng chung) → tab này cũng chạy tiếp.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    if (pending && getAccessToken() && getRefreshToken()) finishReLogin(true)
  })
}
