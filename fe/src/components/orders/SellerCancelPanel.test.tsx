import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SellerCancelPanel } from './SellerCancelPanel'
import type { MarketplaceOrderDetail } from '../../types/marketplace-orders'
import { UserRole } from '../../types/auth'

const cancel = vi.fn<(id: string, reason: string) => Promise<void>>(() => Promise.resolve())
vi.mock('../../api/order-groups.api', () => ({ sellerCancelOrder: (id: string, reason: string) => cancel(id, reason) }))
vi.mock('../../context/use-auth', () => ({ useAuth: () => ({ session: { role: UserRole.STORE_OWNER } }) }))

const order = { id: 'o1', platform: 'aurelle', status: 'pending', origin: 'marketplace', sellerCanceled: false } as unknown as MarketplaceOrderDetail

afterEach(() => {
  cleanup()
  cancel.mockClear()
})

// AOFP-330 AC5 — hủy đơn phải qua hộp xác nhận; chưa có lý do thì nút đỏ bị khoá.
describe('SellerCancelPanel', () => {
  it('chưa chọn lý do → nút "Hủy đơn và báo khách" bị khoá, không gọi API', () => {
    render(<SellerCancelPanel order={order} vi onDone={() => Promise.resolve()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hủy đơn' }))
    expect(screen.getByText(/Không hoàn tác được\./)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Hủy đơn và báo khách' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(confirm)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('chọn lý do rồi xác nhận → gọi API với lý do', async () => {
    const onDone = vi.fn(() => Promise.resolve())
    render(<SellerCancelPanel order={order} vi onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hủy đơn' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sản phẩm đã hết hàng' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hủy đơn và báo khách' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(cancel).toHaveBeenCalledWith('o1', 'Sản phẩm đã hết hàng')
  })
})
