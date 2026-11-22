import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RejectedPlanPanel } from '../components/packing/RejectedPlanPanel'
import { initialManualDraft, manualDraftProblem, unitsOfPlan } from '../components/packing/manual-pack-draft'
import type { PackingPlan } from '../types/packing-plan'

const recompute = vi.fn()
vi.mock('../api/packing-plan.api', () => ({
  recomputePackingPlan: (...args: unknown[]) => recompute(...args) as unknown,
  backToPicking: vi.fn(),
  manualPackPlan: vi.fn(),
}))
vi.mock('../api/packaging-materials.api', () => ({ listPackagingMaterials: () => Promise.resolve([]) }))

const placement = (itemKey: string, sku: string, orderId: string) => ({
  itemKey, sku, orderId, step: 1, x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, orientation: 'LWH' as const, folded: false,
})

const plan = {
  id: 'p1',
  orderGroupId: 'g1',
  version: 4,
  status: 'rejected',
  failureReason: null,
  orders: [{ overParcelLimit: false, orderId: 'o1' }, { overParcelLimit: false, orderId: 'o2' }],
  parcels: [
    { parcelNo: 1, box: { code: 'BOX-M', name: 'M', outerMm: { lengthMm: 1, widthMm: 1, heightMm: 1 } }, estimatedWeightG: 1, actualWeightKg: null, materials: [], shippingCostVnd: null, status: 'planned', placements: [placement('TEE#1', 'TEE', 'o1'), placement('TEE#2', 'TEE', 'o1')] },
    { parcelNo: 2, box: { code: 'BOX-S', name: 'S', outerMm: { lengthMm: 1, widthMm: 1, heightMm: 1 } }, estimatedWeightG: 1, actualWeightKg: null, materials: [], shippingCostVnd: null, status: 'planned', placements: [placement('CAP#1', 'CAP', 'o2')] },
  ],
  totals: { parcels: 2, packagingCostVnd: 0, estimatedWeightG: 2 },
  rejectedAt: '2026-11-19T03:00:00.000Z',
  rejectionReason: 'BOX_TOO_TIGHT: chật quá',
  rejection: { reasonCode: 'BOX_TOO_TIGHT', rejectedByName: 'Nhân viên A', dueAt: null, overdue: false },
} as PackingPlan

afterEach(cleanup)

describe('manual pack draft (AOFP-322)', () => {
  const units = unitsOfPlan(plan)

  it('mặc định giữ kiện của kế hoạch cũ và hợp lệ khi có ghi chú', () => {
    const { parcels, assign } = initialManualDraft(plan, units)
    expect(parcels).toEqual([{ id: 1, orderId: 'o1', boxCode: 'BOX-M' }, { id: 2, orderId: 'o2', boxCode: 'BOX-S' }])
    expect(manualDraftProblem(units, parcels, assign, 'đóng tay', true)).toBeNull()
    expect(manualDraftProblem(units, parcels, assign, '', true)).toMatch(/ghi lý do/i)
  })

  it('chặn món nằm trong kiện của đơn khác, kiện rỗng, kiện chưa chọn thùng', () => {
    const { parcels, assign } = initialManualDraft(plan, units)
    expect(manualDraftProblem(units, parcels, { ...assign, 'CAP#1': 1 }, 'note', true)).toMatch(/1 món/)
    const extra = [...parcels, { id: 3, orderId: 'o1', boxCode: 'BOX-M' }]
    expect(manualDraftProblem(units, extra, assign, 'note', true)).toMatch(/#3 chưa có món/)
    const noBox = parcels.map((p) => (p.id === 2 ? { ...p, boxCode: '' } : p))
    expect(manualDraftProblem(units, noBox, assign, 'note', true)).toMatch(/#2 chưa chọn thùng/)
  })
})

describe('RejectedPlanPanel (AOFP-322)', () => {
  it('hiện lý do + người từ chối, khoá 3 nút khi đang tính lại', async () => {
    let resolve: (p: PackingPlan) => void = () => undefined
    recompute.mockReturnValue(new Promise<PackingPlan>((r) => { resolve = r }))
    const onDone = vi.fn()
    render(<RejectedPlanPanel groupId="g1" plan={plan} vi canAct onPlan={vi.fn()} onDone={onDone} />)
    expect(screen.getByText(/Thùng quá chật — chật quá/)).toBeTruthy()
    expect(screen.getByText(/Nhân viên A/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Tính lại kế hoạch/ }))
    expect(screen.getByText('Đang tính kế hoạch mới…')).toBeTruthy()
    for (const name of [/Tính lại kế hoạch/, /Đóng gói thủ công/, /Trả về lấy hàng/]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(recompute).toHaveBeenCalledWith('g1', 4)

    resolve({ ...plan, status: 'ready', version: 5 })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('tính lại lỗi (failed) thì báo lý do, không rời tab', async () => {
    recompute.mockResolvedValue({ ...plan, status: 'failed', failureReason: 'SKU chưa đo' })
    const onDone = vi.fn()
    render(<RejectedPlanPanel groupId="g1" plan={plan} vi canAct onPlan={vi.fn()} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /Tính lại kế hoạch/ }))
    await waitFor(() => expect(screen.getByText(/Không tính được: SKU chưa đo/)).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
  })
})
