import type { ReactNode } from 'react'
import { Badge } from '../ui/Badge'

/** Vật tư của một kiện (gối hơi, xốp hơi, tem…) dạng thẻ nhỏ. Dùng ở màn đóng gói và trang nhúng 3D của app mobile. */
export function MaterialTags({
  materials,
}: {
  materials: { name: string; quantity: number; code?: string | null }[]
}): ReactNode {
  if (materials.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {materials.map((row, index) => (
        <Badge
          key={`${row.code ?? row.name}-${String(index)}`}
          tone="primary"
          className="font-medium"
        >
          {row.name}
          {row.quantity > 1 ? ` ×${String(row.quantity)}` : ''}
        </Badge>
      ))}
    </div>
  )
}
