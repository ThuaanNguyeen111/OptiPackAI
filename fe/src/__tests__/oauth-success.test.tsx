import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/auth-provider'
import { OAuthSuccessPage } from '../pages/OAuthSuccessPage'

/** AOFP-333 — URL chỉ có login_code; đổi đúng 1 lần qua POST; tài khoản bật MFA phải nhập mã. */
function json(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('OAuthSuccessPage', () => {
  it('đổi login_code 1 lần, hỏi mã MFA rồi mới vào', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/google/exchange')) return json({ mfa_required: true, mfa_challenge: 'ch1' })
      if (url.endsWith('/auth/google/mfa')) {
        expect(JSON.parse(String(init?.body))).toEqual({ mfa_challenge: 'ch1', mfa_token: '123456' })
        return json({ access_token: 'a', refresh_token: 'r', role: 4, must_change_password: false })
      }
      return Promise.reject(new TypeError('unexpected ' + url))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/oauth-success?login_code=abc']}>
          <AuthProvider>
            <OAuthSuccessPage />
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    await screen.findByText('Xác thực 2 lớp')
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/google/exchange'))).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Xác nhận MFA'))
    await screen.findByText('Đăng nhập Google thành công')
  })
})
