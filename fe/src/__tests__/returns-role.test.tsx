import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/auth-provider'
import { PortalProvider } from '../context/portal-provider'
import { ThemeProvider } from '../hooks/theme-provider'
import { writeSession } from '../lib/auth-storage'
import { ReturnsPage } from '../pages/ReturnsPage'
import { UserRole } from '../types/auth'

/** AOFP-336 AC1 — vai trò không được duyệt thấy dòng chỉ đọc, không thấy Duyệt / Từ chối. */
const slip = {
  id: 'r1',
  rmaCode: 'RMA-1',
  orderGroupId: 'g1',
  status: 'requested',
  type: 'return_refund',
  items: [{ sellerSku: 'AO-1', quantity: 1, reasonCode: 'damaged', reasonLabel: 'Hỏng' }],
  version: 0,
}

function renderAs(role: UserRole): void {
  writeSession({ accessToken: 't', refreshToken: 'r', role, mustChangePassword: false })
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(String(url).includes('/returns') ? { items: [slip], total: 1, page: 1, limit: 100 } : {}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ))
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  render(
    <ThemeProvider>
      <MemoryRouter>
        <AuthProvider>
          <PortalProvider>
            <ReturnsPage />
          </PortalProvider>
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ReturnsPage theo vai trò', () => {
  it('WAREHOUSE_STAFF: chỉ đọc', async () => {
    renderAs(UserRole.WAREHOUSE_STAFF)
    await screen.findByText(/Chờ chủ shop duyệt/)
    expect(screen.queryByRole('button', { name: /^Duyệt$|^Approve$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Từ chối$|^Reject$/ })).toBeNull()
  })

  it('STORE_OWNER: có Duyệt / Từ chối', async () => {
    renderAs(UserRole.STORE_OWNER)
    await screen.findByRole('button', { name: /Duyệt|Approve/ })
    expect(screen.queryByText(/Chờ chủ shop duyệt/)).toBeNull()
  })
})
