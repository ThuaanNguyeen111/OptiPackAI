import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, Plus, X } from 'lucide-react'
import { createPackagingBag, listPackagingBags, updatePackagingBag, type BagInput } from '../../api/packaging.api'
import { formatApiError } from '../../lib/api'
import type { PackagingBag } from '../../types/packaging'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

// Nhập cm cho dễ đo; API lưu mm (số nguyên).
type FormState = { code: string; name: string; widthCm: string; lengthCm: string; price: string }

const emptyForm: FormState = { code: '', name: '', widthCm: '', lengthCm: '', price: '' }
const cm = (mm: number) => String(mm / 10)

function toInput(f: FormState): BagInput {
  const mm = (v: string) => Math.round(Number(v) * 10)
  return {
    code: f.code.trim(),
    name: f.name.trim(),
    width_mm: mm(f.widthCm),
    length_mm: mm(f.lengthCm),
    price_vnd: f.price === '' ? null : Math.round(Number(f.price)),
  }
}

/**
 * Danh mục túi zip bọc từng món (áo, quần…) trước khi xếp vào thùng.
 * Hồ sơ SKU chọn túi từ đây; engine KHÔNG dùng kích thước túi — kho đo
 * gói sau khi đã cho vào túi (chốt 21/09/2026).
 */
export function ZipBagCatalog({ vi }: { vi: boolean }) {
  const [bags, setBags] = useState<PackagingBag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<PackagingBag | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setBags(await listPackagingBags(false))
      setError(null)
    } catch (err: unknown) {
      setError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listPackagingBags(false)
      .then((rows) => {
        if (!cancelled) setBags(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const valid =
    form.code.trim() !== '' && form.name.trim() !== '' && Number(form.widthCm) > 0 && Number(form.lengthCm) > 0

  const save = async () => {
    if (editing === null) return
    setSaving(true)
    setError(null)
    try {
      const input = toInput(form)
      if (editing === 'new') {
        await createPackagingBag(input)
      } else {
        // Mã túi không đổi được sau khi tạo (hồ sơ SKU tham chiếu theo mã).
        await updatePackagingBag(editing.id, {
          name: input.name,
          width_mm: input.width_mm,
          length_mm: input.length_mm,
          price_vnd: input.price_vnd,
        })
      }
      setEditing(null)
      await refresh()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (bag: PackagingBag) => {
    setError(null)
    try {
      await updatePackagingBag(bag.id, { is_active: !bag.isActive })
      await refresh()
    } catch (err: unknown) {
      setError(formatApiError(err))
    }
  }

  const field = (key: keyof FormState, label: string, disabled = false) => (
    <label className="space-y-1 text-xs">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <input
        value={form[key]}
        disabled={disabled}
        onChange={(e) => {
          const value = e.target.value
          setForm((prev) => ({ ...prev, [key]: value }))
        }}
        className={`${inputClass} disabled:opacity-60`}
      />
    </label>
  )

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {vi ? 'Danh mục túi zip' : 'Zip bag catalog'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {vi
              ? 'Túi bọc từng món (áo, quần…) trước khi xếp vào thùng. Kích thước đo khi túi trải phẳng.'
              : 'Bags that wrap each item before it goes into the box. Measured flat.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm)
            setEditing('new')
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]"
        >
          <Plus className="h-4 w-4" />
          {vi ? 'Thêm túi' : 'Add bag'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {editing !== null && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1">
          <div className="flex items-center">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {editing === 'new' ? (vi ? 'Thêm túi zip' : 'Add zip bag') : `${vi ? 'Sửa' : 'Edit'} ${editing.code}`}
            </h3>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
              }}
              className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={vi ? 'Đóng' : 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {field('code', vi ? 'Mã túi' : 'Code', editing !== 'new')}
            {field('name', vi ? 'Tên' : 'Name')}
            {field('widthCm', vi ? 'Rộng (cm)' : 'Width (cm)')}
            {field('lengthCm', vi ? 'Dài (cm)' : 'Length (cm)')}
            {field('price', vi ? 'Giá (đ)' : 'Price (VND)')}
          </div>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {vi ? 'Lưu' : 'Save'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi ? 'Đang tải…' : 'Loading…'}
          </div>
        ) : bags.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{vi ? 'Chưa có túi zip nào.' : 'No zip bags yet.'}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2">{vi ? 'Mã' : 'Code'}</th>
                <th className="px-4 py-2">{vi ? 'Kích thước (cm)' : 'Size (cm)'}</th>
                <th className="px-4 py-2">{vi ? 'Giá' : 'Price'}</th>
                <th className="px-4 py-2">{vi ? 'Trạng thái' : 'Status'}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {bags.map((b) => (
                <tr key={b.id} className={b.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs">{b.code}</span>
                    <span className="block text-xs text-slate-500">{b.name}</span>
                    {b.isSample && (
                      <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        {vi ? 'số giả lập' : 'sample'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {cm(b.widthMm)}×{cm(b.lengthMm)}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {b.priceVnd === null ? '—' : `${b.priceVnd.toLocaleString('vi-VN')} đ`}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => void toggleActive(b)}
                      className="rounded-full border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {b.isActive ? (vi ? 'Đang dùng' : 'Active') : vi ? 'Ngừng dùng' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          code: b.code,
                          name: b.name,
                          widthCm: cm(b.widthMm),
                          lengthCm: cm(b.lengthMm),
                          price: b.priceVnd === null ? '' : String(b.priceVnd),
                        })
                        setEditing(b)
                      }}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label={vi ? 'Sửa' : 'Edit'}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
