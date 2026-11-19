import { act, cleanup, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/auth-provider'
import { PortalProvider } from '../context/portal-provider'
import { ThemeProvider } from '../hooks/theme-provider'
import { writeSession } from '../lib/auth-storage'
import { DashboardPage } from '../pages/DashboardPage'
import { OrderGroupsPage } from '../pages/OrderGroupsPage'
import { PackingPage } from '../pages/PackingPage'
import { ShippingPage } from '../pages/ShippingPage'
import { WarehousePage } from '../pages/WarehousePage'
import { UserRole } from '../types/auth'

/**
 * AOFP-317 — smoke test: mỗi màn chính render được với phiên Admin, kể cả khi API lỗi
 * (fetch luôn hỏng mạng), không ném lỗi và không trắng màn hình.
 * shortcut: chưa giả lập dữ liệu thật từng API; muốn kiểm luồng có dữ liệu thì thêm MSW + fixture.
 */
const PAGES: [string, string, ComponentType][] = [
  ['PackingPage', '/app/packing', PackingPage],
  ['WarehousePage', '/app/warehouse', WarehousePage],
  ['ShippingPage', '/app/shipping', ShippingPage],
  ['OrderGroupsPage', '/app/order-groups', OrderGroupsPage],
  ['DashboardPage', '/app', DashboardPage],
]

beforeEach(() => {
  writeSession({ accessToken: 'test', refreshToken: 'test', role: UserRole.ADMIN, mustChangePassword: false })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  // jsdom không có matchMedia / ResizeObserver (giao diện sáng-tối, khung 3D cần).
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('smoke: các màn chính render được', () => {
  it.each(PAGES)('%s', async (_name, path, Page) => {
    const errors: unknown[] = []
    const onError = (e: ErrorEvent): void => {
      errors.push(e.error)
    }
    window.addEventListener('error', onError)
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <PortalProvider>
              <Page />
            </PortalProvider>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>,
    )
    // Chờ các request (đều lỗi) xử lý xong và màn hình vẽ lại trạng thái lỗi / rỗng.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(container.textContent?.trim()).not.toBe('')
  })
})
