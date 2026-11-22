import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/auth-provider'
import { PortalProvider } from '../context/portal-provider'
import { ThemeProvider } from '../hooks/theme-provider'
import { writeSession } from '../lib/auth-storage'
import { UserManagementTable } from '../modules/admin/components/UserManagementTable'
import { LoginType, Role, type AdminUser } from '../types/admin'
import { UserRole } from '../types/auth'

/** AOFP-335 — vô hiệu hóa phải gõ đúng email; dòng của chính mình bị khoá. */
const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const token = `x.${btoa(JSON.stringify({ sub: ME }))}.y`

function user(id: string, email: string): AdminUser {
  return {
    id,
    name: email.split('@')[0] ?? email,
    email,
    role: Role.WAREHOUSE_STAFF,
    mfaEnabled: false,
    active: true,
    loginType: LoginType.LOCAL,
    mustChangePassword: false,
    createdAt: '2026-11-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  writeSession({ accessToken: token, refreshToken: 'r', role: UserRole.ADMIN, mustChangePassword: false })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('UserManagementTable — xác nhận thao tác', () => {
  it('khoá nút trên dòng của mình; vô hiệu hóa người khác cần gõ đúng email', async () => {
    const onDeactivate = vi.fn(() => Promise.resolve())
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthProvider>
            <PortalProvider>
              <UserManagementTable
                users={[user(ME, 'me@x.vn'), user('bbbbbbbbbbbbbbbbbbbbbbbb', 'kho@x.vn')]}
                roleFilter="all"
                onRoleFilterChange={() => {}}
                page={1}
                total={2}
                limit={20}
                onPageChange={() => {}}
                onUpdateUser={() => Promise.resolve()}
                onResetPassword={() => Promise.resolve()}
                onDeactivate={onDeactivate}
                onReactivate={() => Promise.resolve()}
                onDisableMfa={() => Promise.resolve()}
              />
            </PortalProvider>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>,
    )
    const deactivateButtons = await screen.findAllByRole('button', { name: /Vô hiệu$|Deactivate$/ })
    expect(deactivateButtons).toHaveLength(2)
    const [mine, other] = deactivateButtons as [HTMLButtonElement, HTMLButtonElement]
    expect(mine.disabled).toBe(true)
    expect(other.disabled).toBe(false)

    fireEvent.click(other)
    const dialog = await screen.findByRole('dialog')
    const confirmBtn = Array.from(dialog.querySelectorAll('button')).at(-1) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
    fireEvent.change(dialog.querySelector('input') as HTMLInputElement, { target: { value: 'KHO@x.vn' } })
    expect(confirmBtn.disabled).toBe(false)
    fireEvent.click(confirmBtn)
    expect(onDeactivate).toHaveBeenCalledWith('bbbbbbbbbbbbbbbbbbbbbbbb')
  })
})
