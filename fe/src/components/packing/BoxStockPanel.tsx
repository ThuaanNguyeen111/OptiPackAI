import { listBoxMovements, stockInPackagingBox } from '../../api/packaging.api'
import type { PackagingBox } from '../../types/packaging'
import { StockPanel } from './StockPanel'

const BOX_NOUN = { vi: 'thùng', en: 'boxes' }

/** Nhập thêm thùng + lịch sử xuất/nhập của 1 loại thùng (22/09/2026). */
export function BoxStockPanel({ box, vi, onChanged }: { box: PackagingBox; vi: boolean; onChanged: () => void }) {
  return (
    <StockPanel
      id={box.id}
      vi={vi}
      noun={BOX_NOUN}
      loadMovements={listBoxMovements}
      stockIn={stockInPackagingBox}
      onChanged={onChanged}
    />
  )
}
