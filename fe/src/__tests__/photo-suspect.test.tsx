import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mapIntakeEvidence } from '../api/receipt-evidence.api'
import { PhotoSuspectBadge } from '../components/warehouse/OcrStatusBadge'

/** AOFP-311 — cờ "nghi dùng lại ảnh phiếu" từ BE phải đọc được và hiện đúng. */
describe('photoSuspect', () => {
  afterEach(cleanup)

  it('đọc photoSuspect từ dòng sổ nhập vật tư (camelCase hoặc snake_case)', () => {
    expect(mapIntakeEvidence({ photoSuspect: true }).photoSuspect).toBe(true)
    expect(mapIntakeEvidence({ photo_suspect: true }).photoSuspect).toBe(true)
    expect(mapIntakeEvidence({}).photoSuspect).toBe(false)
    expect(mapIntakeEvidence({ photoSuspect: 'true' }).photoSuspect).toBe(false)
  })

  it('chỉ hiện nhãn khi bị gắn cờ', () => {
    const on = render(<PhotoSuspectBadge suspect vi />)
    expect(on.container.textContent).toContain('Nghi dùng lại ảnh')
    on.unmount()
    const off = render(<PhotoSuspectBadge suspect={false} vi />)
    expect(off.container.textContent).toBe('')
  })
})
