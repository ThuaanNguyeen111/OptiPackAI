import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PackingSessionPanel } from './PackingSessionPanel'
import type { PackingPlan, PackingPlanParcel } from '../../types/packing-plan'

const api = vi.hoisted(() => ({
  reportPackingIssue: vi.fn(),
  unpackParcel: vi.fn(),
  unsealParcel: vi.fn(),
}))

vi.mock('../../api/packing-plan.api', () => ({
  changeParcelBoxInSession: vi.fn(),
  finishPackingSession: vi.fn(),
  getPackingBoxSources: () => Promise.resolve({ parcels: [], stock: [] }),
  listReplacementWarehouses: () => Promise.resolve([{ id: 'w1', code: 'KHO-1', name: 'Kho chính' }]),
  reviewParcel: vi.fn(),
  scanParcelItem: vi.fn(),
  sealParcel: vi.fn(),
  startPackingSession: vi.fn(),
  unscanParcelItem: vi.fn(),
  ...api,
}))
// AOFP-331: panel đọc người đang đăng nhập.
vi.mock('../../context/use-auth', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('../../api/proof-photos.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  uploadProofPhotos: () => Promise.resolve([]),
}))

function parcel(over: Partial<PackingPlanParcel>): PackingPlanParcel {
  return {
    parcelNo: 1,
    box: { code: 'BOX-M', name: 'Thùng M', outerMm: { lengthMm: 300, widthMm: 200, heightMm: 150 } },
    estimatedWeightG: 500,
    actualWeightKg: null,
    materials: [],
    shippingCostVnd: null,
    status: 'pending',
    ...over,
  }
}

function plan(parcels: PackingPlanParcel[]): PackingPlan {
  return { id: 'p1', orderGroupId: 'g1', version: 3, status: 'packing', parcels, orders: [] } as unknown as PackingPlan
}

function renderPanel(p: PackingPlan): void {
  render(<PackingSessionPanel groupId="g1" plan={p} boxes={[]} vi onPlan={() => undefined} onError={() => undefined} />)
}

const placement = (itemKey: string, sku: string) => ({ itemKey, sku }) as never

afterEach(() => {
  cleanup()
  Object.values(api).forEach((fn) => fn.mockReset())
})

describe('PackingSessionPanel — AOFP-332', () => {
  it('AC1: kiện 3 món mới quét 1 → báo sự cố được món chưa quét', async () => {
    api.reportPackingIssue.mockResolvedValue(plan([]))
    renderPanel(
      plan([
        parcel({
          placements: [placement('A#1', 'SKU-A'), placement('B#1', 'SKU-B'), placement('C#1', 'SKU-C')],
          scans: [{ itemKey: 'A#1', sku: 'SKU-A' }],
        }),
      ]),
    )
    const select = screen.getByRole('combobox', { name: 'Món bị sự cố' })
    expect(select.querySelectorAll('option')).toHaveLength(3)
    fireEvent.change(select, { target: { value: 'C#1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Báo sự cố' }))
    await waitFor(() => expect(api.reportPackingIssue).toHaveBeenCalled())
    expect(api.reportPackingIssue).toHaveBeenCalledWith('g1', expect.objectContaining({ itemKey: 'C#1' }))
  })

  it('AC2: tháo kiện → chưa chọn tình trạng thùng thì không xác nhận được', async () => {
    api.unpackParcel.mockResolvedValue(plan([]))
    renderPanel(plan([parcel({ status: 'to_unpack' })]))
    fireEvent.click(screen.getByRole('button', { name: 'Tháo kiện đơn hủy' }))
    const confirm = screen.getByRole('button', { name: 'Tháo kiện' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Thùng hỏng'))
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(api.unpackParcel).toHaveBeenCalled())
    expect(api.unpackParcel).toHaveBeenCalledWith('g1', 1, expect.objectContaining({ boxCondition: 'damaged' }))
  })

  it('AC3: thùng đã cắt hạ → tháo kiện chỉ chọn được thùng hỏng', () => {
    renderPanel(
      plan([parcel({ status: 'to_unpack', box: { ...parcel({}).box, cutFromInnerHeightMm: 300 } })]),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tháo kiện đơn hủy' }))
    expect((screen.getByLabelText('Thùng hỏng') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Thùng còn dùng được') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Tháo kiện' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC4: hoàn tác niêm phong gửi lý do người dùng chọn', async () => {
    api.unsealParcel.mockResolvedValue(plan([]))
    renderPanel(plan([parcel({ status: 'sealed' })]))
    fireEvent.click(screen.getByRole('button', { name: 'Mở niêm phong' }))
    const dialog = screen.getByRole('dialog')
    const confirm = dialog.querySelectorAll('button')[2] as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox', { name: 'Lý do' }), { target: { value: 'ITEM_DAMAGED' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(api.unsealParcel).toHaveBeenCalled())
    expect(api.unsealParcel).toHaveBeenCalledWith('g1', 1, expect.objectContaining({ reason: 'ITEM_DAMAGED' }))
  })
})
