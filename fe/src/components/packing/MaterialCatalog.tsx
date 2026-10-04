import { Fragment, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Boxes, Loader2, Pencil, Plus, X } from 'lucide-react'
import {
  createPackagingMaterial,
  getMaterialRules,
  listMaterialMovements,
  listPackagingMaterials,
  stockInPackagingMaterial,
  updatePackagingMaterial,
  type MaterialInput,
} from '../../api/packaging.api'
import { formatApiError } from '../../lib/api'
import {
  MATERIAL_TYPES,
  MATERIAL_TYPE_LABELS,
  type MaterialRules,
  type MaterialType,
  type PackagingMaterial,
} from '../../types/packaging'
import { StockPanel } from './StockPanel'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

const MATERIAL_NOUN = { vi: 'vật tư', en: 'material' }

type FormState = {
  code: string
  name: string
  type: MaterialType
  unit: string
  weightG: string
  price: string
  reorderLevel: string
  location: string
}

const emptyForm: FormState = {
  code: '',
  name: '',
  type: 'foam_corner',
  unit: 'cái',
  weightG: '',
  price: '',
  reorderLevel: '20',
  location: '',
}

function toInput(f: FormState): MaterialInput {
  return {
    code: f.code.trim(),
    name: f.name.trim(),
    type: f.type,
    unit: f.unit.trim(),
    weight_g_per_unit: Math.round(Number(f.weightG)),
    price_vnd_per_unit: Math.round(Number(f.price)),
    reorder_level: f.reorderLevel === '' ? 20 : Math.round(Number(f.reorderLevel)),
    storage_location: f.location.trim() === '' ? null : f.location.trim(),
  }
}

const SCOPE_LABELS: Record<string, { vi: string; en: string }> = {
  fragile: { vi: 'món dễ vỡ', en: 'fragile items' },
  shoes: { vi: 'giày (hộp)', en: 'shoes (boxed)' },
  fragile_or_shoes: { vi: 'giày hoặc món dễ vỡ', en: 'shoes or fragile items' },
  any: { vi: 'mọi món', en: 'any item' },
}

/** Diễn giải 1 luật thành câu ngắn cho người đọc. */
function describeRule(rule: MaterialRules['rules'][number], vi: boolean): string {
  const scope = SCOPE_LABELS[rule.appliesTo]?.[vi ? 'vi' : 'en'] ?? rule.appliesTo
  const min = rule.minUnits > 1 ? (vi ? `, từ ${String(rule.minUnits)} món` : `, from ${String(rule.minUnits)} items`) : ''
  switch (rule.basis) {
    case 'per_unit':
      return vi ? `${String(rule.quantity)} cho mỗi ${scope}${min}` : `${String(rule.quantity)} per ${scope}${min}`
    case 'per_extra_unit':
      return vi
        ? `${String(rule.quantity)} giữa mỗi 2 ${scope} (số món − 1)${min}`
        : `${String(rule.quantity)} between every 2 ${scope} (count − 1)${min}`
    case 'per_carton':
      return vi ? `${String(rule.quantity)} cho mỗi kiện có ${scope}${min}` : `${String(rule.quantity)} per parcel with ${scope}${min}`
    default:
      return rule.voidBands
        .map((b) =>
          vi
            ? `${String(b.quantity)} khi thùng trống ≥ ${String(Math.round(b.minVoidRatio * 100))}%`
            : `${String(b.quantity)} when box is ≥ ${String(Math.round(b.minVoidRatio * 100))}% empty`,
        )
        .join('; ')
  }
}

/**
 * Danh mục + tồn kho vật tư chèn (góc xốp, tấm ngăn, gối hơi...) và bộ luật
 * chọn vật tư (28/09/2026). Số lượng vật tư trên phương án là ƯỚC LƯỢNG theo
 * luật này, không phải lượng đệm tính từ hình học.
 */
export function MaterialCatalog({ vi }: { vi: boolean }) {
  const [materials, setMaterials] = useState<PackagingMaterial[]>([])
  const [rules, setRules] = useState<MaterialRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<PackagingMaterial | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [stockOpenId, setStockOpenId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMaterials(await listPackagingMaterials(false))
      setError(null)
    } catch (err: unknown) {
      setError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([listPackagingMaterials(false), getMaterialRules()])
      .then(([rows, activeRules]) => {
        if (cancelled) return
        setMaterials(rows)
        setRules(activeRules)
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
    form.code.trim() !== '' &&
    form.name.trim() !== '' &&
    form.unit.trim() !== '' &&
    form.weightG !== '' &&
    Number(form.weightG) >= 0 &&
    form.price !== '' &&
    Number(form.price) >= 0 &&
    (form.reorderLevel === '' || (Number.isInteger(Number(form.reorderLevel)) && Number(form.reorderLevel) >= 0))

  const save = async () => {
    if (editing === null) return
    setSaving(true)
    setError(null)
    try {
      const input = toInput(form)
      if (editing === 'new') {
        await createPackagingMaterial(input)
      } else {
        // Mã và loại vật tư không đổi được sau khi tạo (luật + phương án cũ tham chiếu theo đó).
        await updatePackagingMaterial(editing.id, {
          name: input.name,
          unit: input.unit,
          weight_g_per_unit: input.weight_g_per_unit,
          price_vnd_per_unit: input.price_vnd_per_unit,
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

  const toggleActive = async (m: PackagingMaterial) => {
    setError(null)
    try {
      await updatePackagingMaterial(m.id, { is_active: !m.isActive })
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
            {vi ? 'Vật tư chèn' : 'Cushioning materials'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {vi
              ? 'Góc xốp, tấm ngăn, gối hơi, xốp hơi, tem cảnh báo. Số lượng trên mỗi phương án là ước lượng theo luật bên dưới; tồn chỉ đổi qua Nhập kho hoặc lúc đóng gói xong. Thiếu vật tư không chặn đóng gói.'
              : 'Foam corners, dividers, air pillows, bubble wrap, fragile labels. Quantities are rule-based estimates; stock changes only via stock-in or packing. Shortage does not block packing.'}
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
          {vi ? 'Thêm vật tư' : 'Add material'}
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
              {editing === 'new' ? (vi ? 'Thêm vật tư' : 'Add material') : `${vi ? 'Sửa' : 'Edit'} ${editing.code}`}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {field('code', vi ? 'Mã vật tư' : 'Code', editing !== 'new')}
            {field('name', vi ? 'Tên' : 'Name')}
            <label className="space-y-1 text-xs">
              <span className="text-slate-600 dark:text-slate-300">{vi ? 'Loại' : 'Type'}</span>
              <select
                value={form.type}
                disabled={editing !== 'new'}
                onChange={(e) => {
                  const type = e.target.value as MaterialType
                  setForm((prev) => ({ ...prev, type }))
                }}
                className={`${inputClass} disabled:opacity-60`}
              >
                {MATERIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MATERIAL_TYPE_LABELS[t][vi ? 'vi' : 'en']}
                  </option>
                ))}
              </select>
            </label>
            {field('unit', vi ? 'Đơn vị đếm' : 'Unit')}
            {field('weightG', vi ? 'Khối lượng 1 đơn vị (g)' : 'Weight per unit (g)')}
            {field('price', vi ? 'Giá 1 đơn vị (đ)' : 'Price per unit (VND)')}
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
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi ? 'Đang tải…' : 'Loading…'}
          </div>
        ) : materials.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {vi
              ? 'Chưa có vật tư nào — engine sẽ đóng gói mà không tính vật tư chèn. Chạy scripts/seed-packaging-materials.ts để có dữ liệu mẫu.'
              : 'No materials yet — the engine plans without cushioning. Run scripts/seed-packaging-materials.ts for sample data.'}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2">{vi ? 'Mã' : 'Code'}</th>
                <th className="px-4 py-2">{vi ? 'Loại' : 'Type'}</th>
                <th className="px-4 py-2">{vi ? 'Khối lượng / giá' : 'Weight / price'}</th>
                <th className="px-4 py-2">{vi ? 'Tồn kho' : 'Stock'}</th>
                <th className="px-4 py-2">{vi ? 'Trạng thái' : 'Status'}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {materials.map((m) => (
                <Fragment key={m.id}>
                  <tr className={m.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs">{m.code}</span>
                      <span className="block text-xs text-slate-500">{m.name}</span>
                      {m.isSample && (
                        <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          {vi ? 'số giả lập' : 'sample'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">{MATERIAL_TYPE_LABELS[m.type][vi ? 'vi' : 'en']}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {m.weightGPerUnit} g / {m.priceVndPerUnit.toLocaleString('vi-VN')} đ
                      <span className="block text-xs text-slate-500">/ {m.unit}</span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{m.quantityOnHand}</span>
                      <span className="text-xs text-slate-500"> {m.unit}</span>
                      {m.stockStatus !== 'in_stock' && (
                        <span
                          className={`mt-0.5 block w-fit rounded px-1.5 text-xs ${
                            m.stockStatus === 'out_of_stock'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {m.stockStatus === 'out_of_stock' ? (vi ? 'Hết hàng' : 'Out of stock') : vi ? 'Sắp hết' : 'Low stock'}
                        </span>
                      )}
                      {m.storageLocation && <span className="block text-xs text-slate-400">{m.storageLocation}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => void toggleActive(m)}
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        {m.isActive ? (vi ? 'Đang dùng' : 'Active') : vi ? 'Ngừng dùng' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setStockOpenId(stockOpenId === m.id ? null : m.id)
                        }}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        aria-label={vi ? 'Nhập vật tư / lịch sử' : 'Stock in / history'}
                        title={vi ? 'Nhập vật tư / lịch sử' : 'Stock in / history'}
                      >
                        <Boxes className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForm({
                            code: m.code,
                            name: m.name,
                            type: m.type,
                            unit: m.unit,
                            weightG: String(m.weightGPerUnit),
                            price: String(m.priceVndPerUnit),
                            reorderLevel: String(m.reorderLevel),
                            location: m.storageLocation ?? '',
                          })
                          setEditing(m)
                        }}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        aria-label={vi ? 'Sửa' : 'Edit'}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  {stockOpenId === m.id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <StockPanel
                          id={m.id}
                          vi={vi}
                          noun={MATERIAL_NOUN}
                          loadMovements={listMaterialMovements}
                          stockIn={stockInPackagingMaterial}
                          onChanged={() => void refresh()}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rules && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xs dark:border-slate-800 dark:bg-surface-1">
          <p className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
            {vi ? 'Luật chọn vật tư' : 'Material rules'} ·{' '}
            {rules.isDefault
              ? vi
                ? 'mặc định (chưa lưu bộ luật riêng)'
                : 'default (no custom set saved)'
              : `version ${String(rules.version)}`}
          </p>
          <ul className="space-y-1 text-slate-600 dark:text-slate-300">
            {rules.rules.map((r, i) => (
              <li key={`${r.materialType}-${String(i)}`}>
                <b>{MATERIAL_TYPE_LABELS[r.materialType as MaterialType]?.[vi ? 'vi' : 'en'] ?? r.materialType}</b>:{' '}
                {describeRule(r, vi)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
