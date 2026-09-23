import { useEffect, useState } from 'react'
import { Loader2, PackagePlus } from 'lucide-react'
import { listBoxMovements, stockInPackagingBox } from '../../api/packaging.api'
import { formatApiError } from '../../lib/api'
import type { BoxStockMovement, PackagingBox } from '../../types/packaging'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

/**
 * Nhập thêm thùng + lịch sử xuất/nhập của 1 loại thùng (22/09/2026). Tồn
 * chỉ đổi qua đây (stock-in) hoặc lúc đóng gói xong (pack), mỗi lần 1 dòng sổ.
 */
export function BoxStockPanel({ box, vi, onChanged }: { box: PackagingBox; vi: boolean; onChanged: () => void }) {
  const [movements, setMovements] = useState<BoxStockMovement[] | null>(null)
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listBoxMovements(box.id)
      .then((rows) => {
        if (!cancelled) setMovements(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [box.id, reloadKey])

  const qty = Number(quantity)
  const valid = Number.isInteger(qty) && qty > 0

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await stockInPackagingBox(box.id, qty, note.trim() || undefined)
      setQuantity('')
      setNote('')
      setReloadKey((k) => k + 1)
      onChanged()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 bg-slate-50 p-4 text-xs dark:bg-slate-900/60 md:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <p className="font-semibold text-slate-800 dark:text-slate-100">{vi ? 'Nhập thêm thùng' : 'Stock in'}</p>
        <label className="block space-y-1">
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Số lượng' : 'Quantity'}</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value)
            }}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Ghi chú (mã phiếu nhập…)' : 'Note'}</span>
          <input
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
            }}
            className={inputClass}
          />
        </label>
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-1.5 font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
          {vi ? 'Nhập kho' : 'Add stock'}
        </button>
      </div>

      <div className="min-w-0">
        <p className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
          {vi ? 'Lịch sử xuất/nhập gần nhất' : 'Recent movements'}
        </p>
        {movements === null ? (
          <p className="text-slate-500">{vi ? 'Đang tải…' : 'Loading…'}</p>
        ) : movements.length === 0 ? (
          <p className="text-slate-500">{vi ? 'Chưa có dòng nào.' : 'No movements yet.'}</p>
        ) : (
          <table className="w-full text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3">{vi ? 'Thời gian' : 'Time'}</th>
                <th className="py-1 pr-3">{vi ? 'Loại' : 'Type'}</th>
                <th className="py-1 pr-3 text-right">{vi ? 'Thay đổi' : 'Change'}</th>
                <th className="py-1 pr-3 text-right">{vi ? 'Còn' : 'Balance'}</th>
                <th className="py-1">{vi ? 'Ghi chú' : 'Note'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {movements.map((m, i) => (
                <tr key={`${m.createdAt ?? ''}-${String(i)}`}>
                  <td className="py-1 pr-3 tabular-nums">
                    {m.createdAt ? new Date(m.createdAt).toLocaleString(vi ? 'vi-VN' : 'en-US') : '—'}
                  </td>
                  <td className="py-1 pr-3">
                    {m.reason === 'stock_in' ? (vi ? 'Nhập kho' : 'Stock in') : vi ? 'Đóng gói' : 'Packed'}
                  </td>
                  <td
                    className={`py-1 pr-3 text-right tabular-nums ${m.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}
                  >
                    {m.delta > 0 ? `+${String(m.delta)}` : String(m.delta)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{m.balanceAfter}</td>
                  <td className="py-1 text-slate-500">{m.note ?? (m.orderGroupId ? `Group ${m.orderGroupId.slice(-6)}` : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
