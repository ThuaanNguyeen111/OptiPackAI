import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  ReportMissingDialog,
  type MissingCandidate,
} from '../components/warehouse/ReportMissingDialog'

const rows: MissingCandidate[] = [
  { key: 'g|A', groupId: 'g', sku: 'QUAN-M', binCode: 'KB-1', ordered: 6, picked: 2 },
  { key: 'g|B', groupId: 'g', sku: 'AO-L', binCode: null, ordered: 1, picked: 0 },
]

function open(onSubmit = vi.fn()) {
  render(
    <ReportMissingDialog
      vi
      candidates={rows}
      initialKey="g|A"
      busy={false}
      canSubmit
      error={null}
      onClose={() => undefined}
      onSubmit={onSubmit}
    />,
  )
  return onSubmit
}

describe('ReportMissingDialog', () => {
  it('mặc định thiếu phần còn cần, không cho vượt quá (đúng luật BE)', () => {
    const onSubmit = open()
    const input = screen.getByLabelText('Số lượng không lấy được') as HTMLInputElement
    expect(input.value).toBe('4')
    fireEvent.change(input, { target: { value: '99' } })
    expect(input.value).toBe('4')
    fireEvent.change(input, { target: { value: '0' } })
    expect(input.value).toBe('1')
    fireEvent.click(screen.getByText('Kệ trống'))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo thiếu 1 sản phẩm' }))
    expect(onSubmit).toHaveBeenCalledWith(rows[0], 1, 'Kệ trống')
  })

  it('đổi SKU thì số thiếu đặt lại theo SKU mới', () => {
    const onSubmit = open()
    fireEvent.click(screen.getByRole('radio', { name: /AO-L/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo thiếu 1 sản phẩm' }))
    expect(onSubmit).toHaveBeenCalledWith(rows[1], 1, '')
  })
})
