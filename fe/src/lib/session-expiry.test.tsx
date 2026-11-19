import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api'
import { getAccessToken, getRefreshToken, updateTokens, writeSession } from './auth-storage'
import { AUTH_EXPIRED_EVENT, finishReLogin, isWaitingForReLogin } from './session-expiry'
import { SessionExpiredDialog } from '../components/auth/SessionExpiredDialog'
import { UserRole } from '../types/auth'

vi.mock('../context/use-auth', () => ({
  useAuth: () => ({ applyLoginSuccess: vi.fn(), logout: vi.fn(() => Promise.resolve()) }),
}))

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** fetch giả: route theo đường dẫn + token gửi kèm. */
function stubFetch(handler: (url: string, auth: string | null) => Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn((url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    return Promise.resolve(handler(url, headers.Authorization ?? null))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const refreshCalls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')).length

beforeEach(() => {
  localStorage.clear()
  writeSession({ accessToken: 'A1', refreshToken: 'R1', role: UserRole.ADMIN, mustChangePassword: false })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (isWaitingForReLogin()) finishReLogin(false)
})

describe('AOFP-334 — làm mới phiên', () => {
  it('AC1: tab khác đã xoay token trong lúc request chờ → dùng token mới, KHÔNG gửi refresh token cũ', async () => {
    const fetch = stubFetch((url, auth) => {
      if (url.endsWith('/data') && auth === 'Bearer A1') {
        updateTokens('A2', 'R2') // tab khác xoay xong đúng lúc request này bị 401
        return json(401, {})
      }
      if (url.endsWith('/data')) return json(200, { ok: auth })
      return json(500, {})
    })
    await expect(apiRequest('/data', { auth: true })).resolves.toEqual({ ok: 'Bearer A2' })
    expect(refreshCalls(fetch)).toBe(0)
  })

  it('2 request cùng hết hạn trong 1 tab → chỉ 1 lần refresh', async () => {
    const fetch = stubFetch((url, auth) => {
      if (url.endsWith('/auth/refresh')) return json(200, { access_token: 'A2', refresh_token: 'R2' })
      return auth === 'Bearer A2' ? json(200, { ok: true }) : json(401, {})
    })
    await Promise.all([apiRequest('/a', { auth: true }), apiRequest('/b', { auth: true })])
    expect(refreshCalls(fetch)).toBe(1)
    expect(getRefreshToken()).toBe('R2')
  })

  it('refresh lỗi 500 → giữ phiên, không hiện hộp đăng nhập lại', async () => {
    const onExpired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    stubFetch((url) => (url.endsWith('/auth/refresh') ? json(500, {}) : json(401, { message: 'hết hạn' })))
    await expect(apiRequest('/data', { auth: true })).rejects.toMatchObject({ status: 401 })
    expect(getRefreshToken()).toBe('R1')
    expect(onExpired).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  })

  it('AC3: refresh trả 401 → hộp đăng nhập lại; đăng nhập xong thì thao tác dở được gửi lại', async () => {
    const body = { name: 'đang nhập dở' }
    const fetch = stubFetch((url, auth) => {
      if (url.endsWith('/auth/refresh')) return json(401, {})
      return auth === 'Bearer A9' ? json(200, { saved: true }) : json(401, {})
    })
    render(<SessionExpiredDialog />)
    const saving = apiRequest('/save', { method: 'POST', auth: true, body })

    expect(await screen.findByText('Phiên đăng nhập đã hết hạn')).toBeTruthy()
    expect(getAccessToken()).toBeNull()
    const button = screen.getByRole('button', { name: 'Đăng nhập lại' }) as HTMLButtonElement
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.vn' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } })
    expect(button.disabled).toBe(false)

    // Giả lập đăng nhập lại thành công (ghi token mới) → request dở được gửi lại.
    updateTokens('A9', 'R9')
    finishReLogin(true)
    await expect(saving).resolves.toEqual({ saved: true })
    const saveCalls = fetch.mock.calls.filter(([url]) => String(url).endsWith('/save'))
    expect(saveCalls).toHaveLength(2)
    expect(saveCalls[1]?.[1]?.body).toBe(JSON.stringify(body))
    await waitFor(() => expect(screen.queryByText('Phiên đăng nhập đã hết hạn')).toBeNull())
  })
})
