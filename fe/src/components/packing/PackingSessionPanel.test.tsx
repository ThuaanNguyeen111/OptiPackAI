import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PackingSessionPanel } from './PackingSessionPanel'
import { ApiError, isUncertainWrite, RequestCanceledError } from '../../lib/api'
import type { PackingPlan, PackingPlanParcel } from '../../types/packing-plan'

const api = vi.hoisted(() => ({
  scanParcelItem: vi.fn(),
  sealParcel: vi.fn(),
  getPackingBoxSources: vi.fn(),
}))
vi.mock('../../api/packing-plan.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...api,
}))

/**
 * AOFP-323 — phiên đóng gói: ô cân riêng từng kiện (xoá sau niêm phong), ô quét nhận Enter và
 * giữ focus, "Hoàn tất" bỏ qua kiện đã tháo, lỗi mạng sau khi ghi thì báo + tải lại.
 */
function parcel(no: number, status: string, scanned: number, items: number): PackingPlanParcel {
  return {
    parcelNo: no,
    box: { code: `BOX-${String(no)}`, name: 'Thùng', outerMm: { length: 300, width: 200, height: 100 } },
    estimatedWeightG: 500,
    actualWeightKg: null,
    materials: [],
    shippingCostVnd: null,
    status,
    scannedCount: scanned,
    itemCount: items,
    scans: [],
  } as unknown as PackingPlanParcel
}

function planOf(parcels: PackingPlanParcel[], version = 1): PackingPlan {
  return {
    id: 'plan-1',
    orderGroupId: 'g1',
    version,
    status: 'packing',
    failureReason: null,
    orders: [],
    parcels,
    totals: { parcels: parcels.length, packagingCostVnd: 0, estimatedWeightG: 0 },
  } as unknown as PackingPlan
}

function Harness({ initial, onError = () => {} }: { initial: PackingPlan; onError?: (e: unknown) => void }): ReactElement {
  const [plan, setPlan] = useState(initial)
  return <PackingSessionPanel groupId="g1" plan={plan} boxes={[]} vi onPlan={setPlan} onError={onError} />
}

const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  api.getPackingBoxSources.mockRejectedValue(new Error('no sources'))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PackingSessionPanel', () => {
  it('AC1 — niêm phong kiện 1 xong, kiện 2 có ô cân trống và nút "Niêm phong kiện 2" bị khoá', async () => {
    api.sealParcel.mockResolvedValue(planOf([parcel(1, 'sealed', 2, 2), parcel(2, 'pending', 1, 1)], 2))
    render(<Harness initial={planOf([parcel(1, 'pending', 2, 2), parcel(2, 'pending', 1, 1)])} />)

    fireEvent.change(screen.getByLabelText(/Cân kiện 1/), { target: { value: '1.2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Niêm phong kiện 1' }))
    await flush()

    expect(api.sealParcel).toHaveBeenCalledWith('g1', 1, 1, 1.2, undefined, [])
    expect((screen.getByLabelText(/Cân kiện 2/) as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('button', { name: 'Niêm phong kiện 2' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Cân kiện 2/), { target: { value: '0.8' } })
    expect((screen.getByRole('button', { name: 'Niêm phong kiện 2' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC2 — súng quét gửi mã + Enter → ghi nhận món, báo số món còn lại, ô quét giữ focus', async () => {
    api.scanParcelItem.mockResolvedValue({
      plan: planOf([parcel(1, 'pending', 1, 3)], 2),
      scan: { parcelNo: 1, sku: 'AO-M-01', itemKeys: ['k1'], remainingInParcel: 2, duplicate: false },
    })
    render(<Harness initial={planOf([parcel(1, 'pending', 0, 3)])} />)

    const input = screen.getByPlaceholderText(/SKU sàn hoặc SKU nội bộ/) as HTMLInputElement
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'AO-M-01' } })
    const form = input.closest('form')
    expect(form).not.toBeNull()
    if (form) fireEvent.submit(form)
    await flush()

    expect(api.scanParcelItem).toHaveBeenCalledWith('g1', 1, expect.objectContaining({ code: 'AO-M-01', quantity: 1 }))
    expect(screen.getByText('Đã quét AO-M-01 · kiện 1 còn 2 món')).toBeTruthy()
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('quét món của kiện khác → báo "Món này thuộc kiện 3", không coi là lỗi hệ thống', async () => {
    const onError = vi.fn()
    api.scanParcelItem.mockRejectedValue(
      new ApiError(409, ['x'], 'PACKING_SCAN_WRONG_PARCEL', { parcelNo: 1, sku: 'Q-1', belongsToParcels: [3] }),
    )
    render(<Harness initial={planOf([parcel(1, 'pending', 0, 1), parcel(3, 'pending', 0, 1)])} onError={onError} />)
    const input = screen.getByPlaceholderText(/SKU sàn hoặc SKU nội bộ/)
    fireEvent.change(input, { target: { value: 'Q-1' } })
    const form = input.closest('form')
    if (form) fireEvent.submit(form)
    await flush()

    expect(screen.getByText('Món này thuộc kiện 3')).toBeTruthy()
    expect(onError).not.toHaveBeenCalled()
  })

  it('AC3 — kiện đã tháo + các kiện còn lại đã niêm phong → hiện "Hoàn tất đóng gói"', () => {
    render(<Harness initial={planOf([parcel(1, 'voided', 0, 1), parcel(2, 'sealed', 1, 1)])} />)
    expect(screen.getByRole('button', { name: 'Hoàn tất đóng gói' })).toBeTruthy()
    expect(screen.getByText('Đã tháo')).toBeTruthy()
    expect(screen.getByText('Đã niêm phong')).toBeTruthy()
  })

  it('chỉ kiện đang làm được mở; thanh tiến độ "Kiện 1/2 · đã quét 0/2 món"', () => {
    render(<Harness initial={planOf([parcel(1, 'pending', 0, 2), parcel(2, 'pending', 0, 1)])} />)
    expect(screen.getByText('Kiện 1/2 · đã quét 0/2 món')).toBeTruthy()
    expect(screen.getAllByPlaceholderText(/SKU sàn hoặc SKU nội bộ/)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Làm kiện 2' }))
    expect(screen.getByText('Kiện 2/2 · đã quét 0/1 món')).toBeTruthy()
  })

  it('AC4 — lỗi mạng / hết giờ là "chưa chắc đã lưu"; lỗi nghiệp vụ và huỷ thì không', () => {
    expect(isUncertainWrite(new TypeError('Failed to fetch'))).toBe(true)
    expect(isUncertainWrite(new ApiError(0, ['timeout']))).toBe(true)
    expect(isUncertainWrite(new ApiError(504, ['gateway']))).toBe(true)
    expect(isUncertainWrite(new ApiError(409, ['conflict']))).toBe(false)
    expect(isUncertainWrite(new ApiError(400, ['bad']))).toBe(false)
    expect(isUncertainWrite(new RequestCanceledError())).toBe(false)
  })
})
