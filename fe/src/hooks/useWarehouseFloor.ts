import { useMemo, useState } from 'react'
import { warehousePickLines } from '../data/warehouse-mock'
import type { WarehousePickLine } from '../types/warehouse'

export type WarehouseFilter = 'all' | 'queued' | 'picking' | 'picked' | 'short'

export type ScanConfirmResult = {
  ok: boolean
  message: string
}

function matchesCode(line: WarehousePickLine, raw: string): boolean {
  const code = raw.trim().toUpperCase()
  if (!code) return false
  return (
    line.barcode.toUpperCase() === code ||
    line.sku.toUpperCase() === code ||
    line.packageId.toUpperCase() === code ||
    line.orderCodes.some((o) => o.toUpperCase() === code) ||
    (line.customerName ? line.customerName.toUpperCase().includes(code) : false)
  )
}

export function useWarehouseFloor(initialLines?: WarehousePickLine[]) {
  const [lines, setLines] = useState<WarehousePickLine[]>(() =>
    (initialLines && initialLines.length > 0 ? initialLines : warehousePickLines).map((line) => ({ ...line })),
  )
  const [filter, setFilter] = useState<WarehouseFilter>('all')
  const [busyId, setBusyId] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const visible = useMemo(() => {
    if (filter === 'all') return lines
    return lines.filter((line) => line.status === filter)
  }, [filter, lines])

  const stats = useMemo(() => {
    const queued = lines.filter((l) => l.status === 'queued').length
    const picking = lines.filter((l) => l.status === 'picking').length
    const picked = lines.filter((l) => l.status === 'picked').length
    const short = lines.filter((l) => l.status === 'short').length
    const unitsLeft = lines.reduce((sum, l) => {
      if (l.status === 'picked' || l.status === 'short') return sum
      return sum + Math.max(0, l.qty - l.qtyPicked)
    }, 0)
    return { queued, picking, picked, short, unitsLeft }
  }, [lines])

  function startPick(id: string): void {
    setBusyId(id)
    setLines((prev) =>
      prev.map((line) =>
        line.id === id && line.status === 'queued'
          ? { ...line, status: 'picking' }
          : line,
      ),
    )
    setNotice(undefined)
    window.setTimeout(() => setBusyId(undefined), 250)
  }

  function completePick(id: string): void {
    setBusyId(id)
    let msg = ''
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line
        msg = `Đã lấy đủ ${line.qty}/${line.qty} ${line.productName} · Kệ ${line.bin}`
        return {
          ...line,
          status: 'picked',
          qtyPicked: line.qty,
        }
      }),
    )
    setNotice(msg)
    window.setTimeout(() => setBusyId(undefined), 250)
  }

  function markShort(id: string): void {
    setBusyId(id)
    setLines((prev) =>
      prev.map((line) =>
        line.id === id && line.status !== 'picked'
          ? { ...line, status: 'short' }
          : line,
      ),
    )
    setNotice('Đã ghi nhận thiếu hàng. Tổ trưởng kho sẽ bổ sung.')
    window.setTimeout(() => setBusyId(undefined), 250)
  }

  function confirmScan(raw: string): ScanConfirmResult {
    const hit = lines.find((line) => matchesCode(line, raw))
    if (!hit) {
      return {
        ok: false,
        message: 'Không khớp dòng pick trong wave này. Kiểm tra SKU / PKG / barcode.',
      }
    }
    if (hit.status === 'picked') {
      return { ok: false, message: `${hit.sku} đã pick xong.` }
    }
    if (hit.status === 'short') {
      return { ok: false, message: `${hit.sku} đang thiếu hàng, không quét tiếp.` }
    }

    let message = ''
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== hit.id) return line
        const nextQty = Math.min(line.qty, line.qtyPicked + 1)
        const done = nextQty >= line.qty
        message = done
          ? `Đã lấy đủ ${line.sku} · ${line.bin} → chuyển packing.`
          : `Đã quét ${nextQty}/${line.qty} · ${line.sku}`
        return {
          ...line,
          status: done ? 'picked' : 'picking',
          qtyPicked: nextQty,
        }
      }),
    )
    setNotice(message)
    return { ok: true, message }
  }

  function resetLines(newLines: WarehousePickLine[]): void {
    setLines(newLines.map((line) => ({ ...line })))
    setFilter('all')
    setNotice(undefined)
  }

  return {
    lines: visible,
    rawLines: lines,
    filter,
    setFilter,
    busyId,
    notice,
    stats,
    startPick,
    completePick,
    markShort,
    confirmScan,
    resetLines,
  }
}
