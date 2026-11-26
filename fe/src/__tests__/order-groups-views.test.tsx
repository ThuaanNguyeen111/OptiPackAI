import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/auth-provider'
import { PortalProvider } from '../context/portal-provider'
import { ThemeProvider } from '../hooks/theme-provider'
import { writeSession } from '../lib/auth-storage'
import { OrderGroupsPage, type OrderGroupsView } from '../pages/OrderGroupsPage'
import { UserRole } from '../types/auth'
import type { ListOrderGroupsParams, OrderGroup } from '../types/order-groups'

const list = vi.fn<(params: ListOrderGroupsParams) => Promise<OrderGroup[]>>()

vi.mock('../api/order-groups.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/order-groups.api')>()),
  listOrderGroups: (params: ListOrderGroupsParams) => list(params),
  getOrderGroupById: () => new Promise(() => {}),
}))
vi.mock('../pages/order-groups/GroupOpsPanel', () => ({ GroupOpsPanel: () => null }))

function group(id: string, over: Partial<OrderGroup> = {}): OrderGroup {
  return {
    id,
    platform: 'aurelle',
    shopId: 'shop',
    fulfillmentStatus: 'picking',
    orderPriority: 'normal',
    isOverdue: false,
    stockShortage: false,
    stockShortageItems: [],
    packagingDeadline: null,
    updatedAt: null,
    orderCount: 1,
    activeOrderCount: 1,
    canceledOrderCount: 0,
    recipientNames: [],
    recipientNamesDiffer: false,
    hasMaskedRecipientName: false,
    orders: [],
    ...over,
  } as unknown as OrderGroup
}

const SHORT = group('aaaaaaaaaaaaaaaaaaaa0001', {
  stockShortage: true,
  stockShortageItems: [{ sku: 'SKU-THIEU', needed: 2, reserved: 0, shortage: 2 }],
})
// Vừa thiếu tồn vừa chờ duyệt: hai lần gọi đều trả về, chỉ được hiện một dòng.
const REVIEW = group('aaaaaaaaaaaaaaaaaaaa0002', { stockShortage: true, fulfillmentStatus: 'partial_needs_review' })
const EXPRESS = group('aaaaaaaaaaaaaaaaaaaa0003', { orderPriority: 'express' })

function show(view: OrderGroupsView) {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <AuthProvider>
          <PortalProvider>
            <OrderGroupsPage view={view} />
          </PortalProvider>
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const rowCount = () => document.querySelectorAll('tbody tr').length

beforeEach(() => {
  writeSession({ accessToken: 'test', refreshToken: 'test', role: UserRole.ADMIN, mustChangePassword: false })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  list.mockImplementation((params) => {
    if (params.order_priority === 'express') return Promise.resolve([EXPRESS])
    if (params.stock_shortage) return Promise.resolve([SHORT, REVIEW])
    if (params.fulfillment_status) return Promise.resolve([REVIEW])
    return Promise.resolve([SHORT, REVIEW, EXPRESS])
  })
})

afterEach(() => {
  cleanup()
  list.mockReset()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('Ba trang nhóm đơn tách riêng', () => {
  it('Nhóm đơn: xem tất cả, đặt được Hỏa tốc, không còn bộ nút lọc', async () => {
    show('all')
    await waitFor(() => expect(rowCount()).toBe(3))
    expect(screen.getByRole('heading', { name: 'Nhóm đơn' })).toBeTruthy()
    expect(screen.queryByText('Chỉ nhóm thiếu hàng')).toBeNull()
    expect(screen.queryByText(/^Tất cả \(/)).toBeNull()
    expect(await screen.findByRole('button', { name: /Đặt Hỏa tốc/ })).toBeTruthy()
    expect(list).toHaveBeenCalledWith({})
  })

  it('Đơn hỏa tốc: chỉ gọi nhóm hỏa tốc, có cột hạn đóng gói', async () => {
    show('express')
    await waitFor(() => expect(rowCount()).toBe(1))
    expect(screen.getByRole('heading', { name: 'Đơn hỏa tốc' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Hạn đóng gói' })).toBeTruthy()
    expect(list.mock.calls.every(([p]) => p.order_priority === 'express')).toBe(true)
  })

  it('Thiếu hàng: gộp thiếu tồn với chờ duyệt, không trùng, không có nút Hỏa tốc', async () => {
    show('shortage')
    await waitFor(() => expect(rowCount()).toBe(2))
    expect(screen.getByRole('heading', { name: 'Thiếu hàng' })).toBeTruthy()
    expect(screen.getByText('SKU-THIEU × 2')).toBeTruthy()
    expect(screen.getByText('Chờ duyệt lấy thiếu')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Đặt Hỏa tốc/ })).toBeNull()
    expect(list).toHaveBeenCalledWith({ stock_shortage: true })
    expect(list).toHaveBeenCalledWith({ fulfillment_status: 'partial_needs_review' })
  })
})
