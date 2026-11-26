import { describe, expect, it } from 'vitest'
import { closeNote } from './packing-materials'

describe('closeNote — lời bước gập nắp theo vật tư của kiện (AOFP-349)', () => {
  it('kiện không có vật tư chèn thì không bảo chèn', () => {
    const note = closeNote([{ name: 'Góc xốp bảo vệ hộp giày', code: 'FOAM-CORNER', quantity: 4 }], true)
    expect(note).toBe('Gập 2 nắp ngắn rồi 2 nắp dài, dán băng keo.')
  })

  it('kiện có gối hơi + tem dễ vỡ thì nói đúng số gối và dán tem', () => {
    const note = closeNote(
      [
        { name: 'Gối hơi lấp trống', code: 'AIR-PILLOW', quantity: 4 },
        { name: 'Tem cảnh báo hàng dễ vỡ', code: 'FRAGILE-TAPE', quantity: 1 },
      ],
      true,
    )
    expect(note).toBe('Chèn 4 gối hơi vào khoảng trống, gập 2 nắp ngắn rồi 2 nắp dài, dán băng keo, dán tem cảnh báo dễ vỡ lên nắp.')
  })
})
