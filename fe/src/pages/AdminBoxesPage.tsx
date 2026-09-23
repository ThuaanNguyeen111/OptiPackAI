import { Fragment, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Boxes, Loader2, Pencil, Plus, X } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { ZipBagCatalog } from '../components/packing/ZipBagCatalog'
import { BoxStockPanel } from '../components/packing/BoxStockPanel'
import { usePortal } from '../context/use-portal'
import { createPackagingBox, listAllPackagingBoxes, updatePackagingBox, type BoxInput } from '../api/packaging.api'
import { formatApiError } from '../lib/api'
import type { PackagingBox } from '../types/packaging'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

// Form nhập theo cm / kg cho dễ đo; API lưu mm / g (số nguyên).
type FormState = {
  code: string
  name: string
  innerL: string
  innerW: string
  innerH: string
  outerL: string
  outerW: string
  outerH: string
  tareKg: string
  maxLoadKg: string
  price: string
  reorderLevel: string
  location: string
}

const emptyForm: FormState = {
  code: '',
  name: '',
  innerL: '',
  innerW: '',
  innerH: '',
  outerL: '',
  outerW: '',
  outerH: '',
  tareKg: '',
  maxLoadKg: '',
  price: '',
  reorderLevel: '10',
  location: '',
}

const cm = (mm: number) => String(mm / 10)
const kgFromG = (g: number) => String(g / 1000)

function fromBox(b: PackagingBox): FormState {
  return {
    code: b.code,
    name: b.name,
    innerL: cm(b.inner.lengthMm),
    innerW: cm(b.inner.widthMm),
    innerH: cm(b.inner.heightMm),
    outerL: cm(b.outer.lengthMm),
    outerW: cm(b.outer.widthMm),
    outerH: cm(b.outer.heightMm),
    tareKg: kgFromG(b.tareG),
    maxLoadKg: kgFromG(b.maxLoadG),
    price: b.priceVnd === null ? '' : String(b.priceVnd),
    reorderLevel: String(b.reorderLevel),
    location: b.storageLocation ?? '',
  }
}

/** Lòng thùng làm tròn XUỐNG, ngoài thùng làm tròn LÊN (an toàn khi xếp). */
function toInput(f: FormState): BoxInput {
  const mmDown = (v: string) => Math.floor(Math.round(Number(v) * 10 * 1000) / 1000)
  const mmUp = (v: string) => Math.ceil(Math.round(Number(v) * 10 * 1000) / 1000)
  return {
    code: f.code.trim(),
    name: f.name.trim(),
    inner: { length_mm: mmDown(f.innerL), width_mm: mmDown(f.innerW), height_mm: mmDown(f.innerH) },
    outer: { length_mm: mmUp(f.outerL), width_mm: mmUp(f.outerW), height_mm: mmUp(f.outerH) },
    tare_g: Math.round(Number(f.tareKg) * 1000),
    max_load_g: Math.round(Number(f.maxLoadKg) * 1000),
    price_vnd: f.price === '' ? null : Math.round(Number(f.price)),
    reorder_level: f.reorderLevel === '' ? 10 : Math.round(Number(f.reorderLevel)),
    storage_location: f.location.trim() === '' ? null : f.location.trim(),
  }
}

/**
 * /app/admin/boxes — danh mục thùng carton THẬT mà engine đóng gói dùng
 * (khác trang "Templates đóng gói" đang chạy dữ liệu giả).
 */
export function AdminBoxesPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [boxes, setBoxes] = useState<PackagingBox[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<PackagingBox | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [stockOpenId, setStockOpenId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setBoxes(await listAllPackagingBoxes())
      setError(null)
    } catch (err: unknown) {
      setError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listAllPackagingBoxes()
      .then((rows) => {
        if (!cancelled) setBoxes(rows)
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

  const numericFields: (keyof FormState)[] = ['innerL', 'innerW', 'innerH', 'outerL', 'outerW', 'outerH', 'maxLoadKg']
  const valid =
    form.code.trim() !== '' &&
    form.name.trim() !== '' &&
    numericFields.every((k) => Number(form[k]) > 0) &&
    Number(form.tareKg) >= 0 &&
    form.tareKg !== '' &&
    (form.reorderLevel === '' || (Number.isInteger(Number(form.reorderLevel)) && Number(form.reorderLevel) >= 0))

  const save = async () => {
    if (editing === null) return
    setSaving(true)
    setError(null)
    try {
      const input = toInput(form)
      if (editing === 'new') {
        await createPackagingBox(input)
      } else {
        // Mã thùng không đổi được sau khi tạo (lịch sử phương án tham chiếu theo mã).
        await updatePackagingBox(editing.id, {
          name: input.name,
          inner: input.inner,
          outer: input.outer,
          tare_g: input.tare_g,
          max_load_g: input.max_load_g,
          price_vnd: input.price_vnd,
          reorder_level: input.reorder_level,
          storage_location: input.storage_location,
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

  const toggleActive = async (box: PackagingBox) => {
    setError(null)
    try {
      await updatePackagingBox(box.id, { is_active: !box.isActive })
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
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'Admin', to: '/app/admin' },
          { label: vi ? 'Danh mục thùng' : 'Box catalog' },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {vi
                ? 'Thùng engine đóng gói được phép chọn — engine chỉ chọn thùng còn trống (tồn − đang giữ chỗ). Lòng thùng = phần xếp hàng được; ngoài thùng dùng tính cân quy đổi. Tồn chỉ đổi qua nút Nhập thùng hoặc lúc đóng gói xong.'
                : 'Boxes the packing engine may choose. Inner = usable space; outer is used for volumetric weight.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm)
                setEditing('new')
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]"
            >
              <Plus className="h-4 w-4" />
              {vi ? 'Thêm thùng' : 'Add box'}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {editing !== null && (
            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1">
              <div className="flex items-center">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {editing === 'new' ? (vi ? 'Thêm thùng' : 'Add box') : `${vi ? 'Sửa' : 'Edit'} ${editing.code}`}
                </h2>
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {field('code', vi ? 'Mã thùng' : 'Code', editing !== 'new')}
                {field('name', vi ? 'Tên' : 'Name')}
                {field('tareKg', vi ? 'Cân bì (kg)' : 'Tare (kg)')}
                {field('maxLoadKg', vi ? 'Tải hàng tối đa (kg)' : 'Max load (kg)')}
                {field('innerL', vi ? 'Lòng — dài (cm)' : 'Inner L (cm)')}
                {field('innerW', vi ? 'Lòng — rộng (cm)' : 'Inner W (cm)')}
                {field('innerH', vi ? 'Lòng — cao (cm)' : 'Inner H (cm)')}
                {field('price', vi ? 'Giá (đ)' : 'Price (VND)')}
                {field('outerL', vi ? 'Ngoài — dài (cm)' : 'Outer L (cm)')}
                {field('outerW', vi ? 'Ngoài — rộng (cm)' : 'Outer W (cm)')}
                {field('outerH', vi ? 'Ngoài — cao (cm)' : 'Outer H (cm)')}
                {field('reorderLevel', vi ? 'Báo sắp hết khi còn ≤' : 'Low-stock alert at ≤')}
                {field('location', vi ? 'Vị trí kệ' : 'Storage location')}
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
            </section>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2">{vi ? 'Mã' : 'Code'}</th>
                    <th className="px-4 py-2">{vi ? 'Lòng (cm)' : 'Inner (cm)'}</th>
                    <th className="px-4 py-2">{vi ? 'Ngoài (cm)' : 'Outer (cm)'}</th>
                    <th className="px-4 py-2">{vi ? 'Bì / tải' : 'Tare / load'}</th>
                    <th className="px-4 py-2">{vi ? 'Giá' : 'Price'}</th>
                    <th className="px-4 py-2">{vi ? 'Tồn kho' : 'Stock'}</th>
                    <th className="px-4 py-2">{vi ? 'Trạng thái' : 'Status'}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {boxes.map((b) => (
                    <Fragment key={b.id}>
                    <tr className={b.isActive ? '' : 'opacity-50'}>
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
                        {cm(b.inner.lengthMm)}×{cm(b.inner.widthMm)}×{cm(b.inner.heightMm)}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {cm(b.outer.lengthMm)}×{cm(b.outer.widthMm)}×{cm(b.outer.heightMm)}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {kgFromG(b.tareG)} / {kgFromG(b.maxLoadG)} kg
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {b.priceVnd === null ? '—' : `${b.priceVnd.toLocaleString('vi-VN')} đ`}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{b.available}</span>
                        <span className="text-xs text-slate-500">
                          {' '}
                          {vi ? 'trống' : 'free'} / {b.quantityOnHand} {vi ? 'tồn' : 'on hand'}
                          {b.reserved > 0 ? ` · ${String(b.reserved)} ${vi ? 'giữ chỗ' : 'reserved'}` : ''}
                        </span>
                        {b.stockStatus !== 'in_stock' && (
                          <span
                            className={`mt-0.5 block w-fit rounded px-1.5 text-xs ${
                              b.stockStatus === 'out_of_stock'
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                          >
                            {b.stockStatus === 'out_of_stock' ? (vi ? 'Hết hàng' : 'Out of stock') : vi ? 'Sắp hết' : 'Low stock'}
                          </span>
                        )}
                        {b.storageLocation && <span className="block text-xs text-slate-400">{b.storageLocation}</span>}
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
                            setStockOpenId(stockOpenId === b.id ? null : b.id)
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label={vi ? 'Nhập thùng / lịch sử' : 'Stock in / history'}
                          title={vi ? 'Nhập thùng / lịch sử' : 'Stock in / history'}
                        >
                          <Boxes className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForm(fromBox(b))
                            setEditing(b)
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label={vi ? 'Sửa' : 'Edit'}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {stockOpenId === b.id && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <BoxStockPanel box={b} vi={vi} onChanged={() => void refresh()} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <ZipBagCatalog vi={vi} />
        </div>
      </main>
    </>
  )
}
