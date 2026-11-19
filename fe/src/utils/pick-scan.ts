/**
 * AOFP-327 — mã quét khớp gì trên dòng lấy hàng: SKU, ô chính, hay 1 ô phụ.
 * Khớp ô phụ thì phải gửi id ô phụ lên BE để trừ tồn đúng ô đó (trước đây luôn gửi ô chính).
 */
export type PickScanLine = {
  sku: string
  master_sku: string | null
  bin_code: string
  bin_location_id: string | null
  other_bins: { bin_location_id: string; bin_code: string; quantity_on_hand: number }[]
}

export type PickScanMatch =
  | { kind: 'sku'; code: string; binLocationId: string | null }
  | { kind: 'bin'; code: string; binLocationId: string | null }
  | { kind: 'other_bin'; code: string; binLocationId: string; quantityOnHand: number }

const norm = (value: string): string => value.trim().toLowerCase()

export function matchPickScan(line: PickScanLine, scanned: string): PickScanMatch | null {
  const needle = norm(scanned)
  if (!needle) return null
  if (norm(line.sku) === needle) return { kind: 'sku', code: line.sku, binLocationId: line.bin_location_id }
  if (line.master_sku && norm(line.master_sku) === needle) {
    return { kind: 'sku', code: line.master_sku, binLocationId: line.bin_location_id }
  }
  if (line.bin_code && norm(line.bin_code) === needle) {
    return { kind: 'bin', code: line.bin_code, binLocationId: line.bin_location_id }
  }
  const other = line.other_bins.find((bin) => norm(bin.bin_code) === needle)
  if (other) {
    return { kind: 'other_bin', code: other.bin_code, binLocationId: other.bin_location_id, quantityOnHand: other.quantity_on_hand }
  }
  if (`${norm(line.bin_code)} ${norm(line.sku)}` === needle) {
    return { kind: 'bin', code: line.bin_code, binLocationId: line.bin_location_id }
  }
  return null
}

/** Nhãn "Đã khớp" ghi rõ khớp cái gì. */
export function pickScanLabel(match: PickScanMatch, vi: boolean): string {
  if (match.kind === 'sku') return vi ? `Khớp SKU ${match.code}` : `Matched SKU ${match.code}`
  if (match.kind === 'bin') return vi ? `Khớp ô ${match.code}` : `Matched bin ${match.code}`
  return vi ? `Khớp ô phụ ${match.code}` : `Matched other bin ${match.code}`
}

/**
 * Giữ nguyên `client_event_id` cho cùng (dòng, số lượng, ô) tới khi ghi thành công — bấm lại sau
 * khi mất phản hồi thì BE nhận ra lần cũ, không trừ tồn 2 lần.
 */
export function createPickEventIds(newId: () => string): {
  idFor: (key: string) => string
  done: (key: string) => void
} {
  const ids = new Map<string, string>()
  return {
    idFor: (key) => {
      const current = ids.get(key) ?? newId()
      ids.set(key, current)
      return current
    },
    done: (key) => {
      ids.delete(key)
    },
  }
}
