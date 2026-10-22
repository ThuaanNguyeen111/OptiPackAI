import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  confirmPackagingProfile,
  createColor,
  createMasterSku,
  listColors,
  listMasterSkus,
  listProductMaster,
  previewMasterSku,
  purgeMasterSku,
  updateMasterSku,
  setColorActive,
  setMasterSkuActive,
  syncProductCatalog,
  updateColor,
  type ColorRecord,
  type ConfirmPackagingProfileInput,
  type MasterSkuRecord,
  type ProductMasterRow,
} from '../../api/catalog.api'
import { listCategories } from '../../api/warehouse.api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { formatApiError } from '../../lib/api'
import type { CategoryRecord } from '../../types/warehouse-admin'

const fieldClass =
  'w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

const rowActionClass =
  'inline-flex h-7 cursor-pointer items-center rounded-md border border-hairline bg-surface-1 px-2 text-[11px] font-medium text-ink transition-colors hover:bg-surface-2'

function PanelError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="text-xs text-red-600">{message}</p>
}

function CopySkuButton({ code, vi }: { code: string; vi: boolean }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  let label = vi ? 'Sao chép mã' : 'Copy code'
  if (copied) label = vi ? 'Đã sao chép' : 'Copied'
  if (failed) label = vi ? 'Không sao chép được' : 'Copy failed'

  return (
    <button
      type="button"
      className={rowActionClass}
      onClick={() => {
        void navigator.clipboard
          .writeText(code)
          .then(() => {
            setFailed(false)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {
            setCopied(false)
            setFailed(true)
          })
      }}
    >
      {label}
    </button>
  )
}

function level2Categories(rows: CategoryRecord[]): CategoryRecord[] {
  return rows.flatMap((root) =>
    (root.children ?? []).filter((child) => child.isActive && child.level === 2),
  )
}

export function ColorsTab({
  vi,
  onNotice,
}: {
  vi: boolean
  onNotice: (message: string) => void
}) {
  const [rows, setRows] = useState<ColorRecord[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#000000')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    setRows(await listColors(true))
  }

  useEffect(() => {
    let cancelled = false
    void listColors(true)
      .then((next) => {
        if (!cancelled) setRows(next)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 rounded-lg border border-hairline bg-surface-2/40 p-3 sm:grid-cols-[110px_minmax(0,1fr)_64px_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          void createColor({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            ...(hex ? { hex } : {}),
          })
            .then(async () => {
              setCode('')
              setName('')
              await reload()
              onNotice(vi ? 'Đã thêm màu.' : 'Color added.')
            })
            .catch((err: unknown) => setError(formatApiError(err)))
            .finally(() => setBusy(false))
        }}
      >
        <Input
          className={fieldClass}
          placeholder="DEN"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Input
          className={fieldClass}
          placeholder={vi ? 'Đen' : 'Black'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          className={fieldClass}
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#000000'}
          onChange={(e) => setHex(e.target.value)}
        />
        <Button type="submit" className="h-9 text-xs" disabled={busy || code.length < 2 || !name.trim()}>
          {vi ? 'Thêm màu' : 'Add color'}
        </Button>
      </form>
      <PanelError message={error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{vi ? 'Mã' : 'Code'}</TableHead>
            <TableHead>{vi ? 'Tên' : 'Name'}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ColorRow
              key={row.code}
              row={row}
              vi={vi}
              onSaved={async (message) => {
                await reload()
                onNotice(message)
              }}
              onError={(message) => setError(message)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ColorRow({
  row,
  vi,
  onSaved,
  onError,
}: {
  row: ColorRecord
  vi: boolean
  onSaved: (message: string) => Promise<void>
  onError: (message: string) => void
}) {
  const [name, setName] = useState(row.name)
  const [hex, setHex] = useState(row.hex || '#000000')
  return (
    <TableRow>
      <TableCell className="font-medium text-ink">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-hairline" style={{ background: hex }} />
          {row.code}
          {!row.isActive ? <Badge tone="warning">{vi ? 'tắt' : 'off'}</Badge> : null}
        </span>
      </TableCell>
      <TableCell>
        <Input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Input
            className="h-7 w-10 p-0.5"
            type="color"
            value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#000000'}
            onChange={(e) => setHex(e.target.value)}
          />
          <button
            type="button"
            className={rowActionClass}
            onClick={() => {
              void updateColor(row.code, { name: name.trim(), hex })
                .then(() => onSaved(vi ? 'Đã sửa màu.' : 'Color updated.'))
                .catch((err: unknown) => onError(formatApiError(err)))
            }}
          >
            {vi ? 'Lưu' : 'Save'}
          </button>
          <button
            type="button"
            className={rowActionClass}
            onClick={() => {
              void setColorActive(row.code, !row.isActive)
                .then(() => onSaved(row.isActive ? (vi ? 'Đã tắt màu.' : 'Color off.') : vi ? 'Đã bật màu.' : 'Color on.'))
                .catch((err: unknown) => onError(formatApiError(err)))
            }}
          >
            {row.isActive ? (vi ? 'Tắt' : 'Off') : vi ? 'Bật' : 'On'}
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function MasterSkuTab({
  vi,
  onNotice,
}: {
  vi: boolean
  onNotice: (message: string) => void
}) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [colors, setColors] = useState<ColorRecord[]>([])
  const [items, setItems] = useState<MasterSkuRecord[]>([])
  const [category, setCategory] = useState('')
  const [modelNo, setModelNo] = useState(1)
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'nam' | 'nu' | 'unisex'>('unisex')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const types = useMemo(() => level2Categories(categories), [categories])
  const chosen = types.find((row) => row.code === category)
  const activeColors = colors.filter((row) => row.isActive)
  const preview = previewMasterSku(category, modelNo, color, size)
  const createdRow = items.find((row) => row.masterSku === createdCode)
  const selectedRow = items.find((row) => row.masterSku === selected)
  const canCopyCreated = createdRow === undefined || createdRow.isActive

  async function reload(query = search) {
    const [nextCategories, nextColors, nextSkus] = await Promise.all([
      listCategories(),
      listColors(true),
      listMasterSkus({ search: query.trim() || undefined, includeInactive: true, limit: 50 }),
    ])
    setCategories(nextCategories)
    setColors(nextColors)
    setItems(nextSkus.items)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      listCategories(),
      listColors(true),
      listMasterSkus({ includeInactive: true, limit: 50 }),
    ])
      .then(([nextCategories, nextColors, nextSkus]) => {
        if (cancelled) return
        setCategories(nextCategories)
        setColors(nextColors)
        setItems(nextSkus.items)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 rounded-lg border border-hairline bg-surface-2/40 p-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!preview) return
          setBusy(true)
          setError(null)
          void createMasterSku({
            category_code: category,
            model_no: modelNo,
            color_code: color,
            size,
            name: name.trim(),
            gender,
          })
            .then(async (created) => {
              setName('')
              setCreatedCode(created.masterSku)
              setSelected(created.masterSku)
              await reload()
              onNotice(
                vi
                  ? `Đã tạo ${created.masterSku}. Đặt mã này trên Seller Center.`
                  : `Created ${created.masterSku}. Use it on Seller Center.`,
              )
            })
            .catch((err: unknown) => setError(formatApiError(err)))
            .finally(() => setBusy(false))
        }}
      >
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Danh mục cấp 2' : 'Level-2 category'}</span>
          <select
            className={fieldClass}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setSize('')
            }}
          >
            <option value="">{vi ? 'Chọn loại' : 'Choose'}</option>
            {types.map((row) => (
              <option key={row.code} value={row.code}>
                {row.code} · {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Số mẫu (1–999)' : 'Model number'}</span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            max={999}
            value={modelNo}
            onChange={(e) => setModelNo(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Màu' : 'Color'}</span>
          <select className={fieldClass} value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">{vi ? 'Chọn màu' : 'Choose color'}</option>
            {activeColors.map((row) => (
              <option key={row.code} value={row.code}>
                {row.code} · {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">Size</span>
          <select className={fieldClass} value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">{vi ? 'Chọn size' : 'Choose size'}</option>
            {(chosen?.sizeScale ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-[11px] text-ink-muted">{vi ? 'Tên sản phẩm' : 'Product name'}</span>
          <Input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Giới tính' : 'Gender'}</span>
          <select
            className={fieldClass}
            value={gender}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'nam' || value === 'nu' || value === 'unisex') setGender(value)
            }}
          >
            <option value="unisex">Unisex</option>
            <option value="nam">{vi ? 'Nam' : 'Men'}</option>
            <option value="nu">{vi ? 'Nữ' : 'Women'}</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 sm:col-span-4">
          <p className="text-[11px] text-ink-muted">
            {vi ? 'Mã sẽ tạo: ' : 'Code: '}
            <span className="font-mono text-sm font-semibold text-ink">{preview || '—'}</span>
          </p>
          <Button
            type="submit"
            className="h-9 text-xs"
            disabled={busy || !preview || name.trim().length < 2}
          >
            {vi ? 'Tạo SKU nội bộ' : 'Create internal SKU'}
          </Button>
        </div>
      </form>
      {createdCode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
          <span className="text-xs text-ink-muted">{vi ? 'Mã vừa tạo' : 'Just created'}</span>
          <span className="font-mono text-sm font-semibold text-ink">{createdCode}</span>
          {canCopyCreated ? <CopySkuButton code={createdCode} vi={vi} /> : null}
        </div>
      ) : null}
      <PanelError message={error} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void reload().catch((err: unknown) => setError(formatApiError(err)))
        }}
      >
        <Input
          className={fieldClass}
          placeholder={vi ? 'Tìm mã hoặc tên' : 'Search code or name'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary" className="h-9 text-xs">
          {vi ? 'Tìm' : 'Search'}
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>{vi ? 'Tên' : 'Name'}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.masterSku}>
              <TableCell className="font-medium text-ink">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {row.masterSku}
                  {row.isActive ? <CopySkuButton code={row.masterSku} vi={vi} /> : null}
                </span>
                {!row.isActive ? (
                  <span className="ml-1 text-[11px] text-ink-muted">
                    {row.replacedBy
                      ? `${vi ? 'thay bằng' : 'replaced by'} ${row.replacedBy}`
                      : vi
                        ? 'tắt'
                        : 'off'}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>
                <button type="button" className={rowActionClass} onClick={() => setSelected(row.masterSku)}>
                  {vi ? 'Chi tiết' : 'Details'}
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selected ? (
        <MasterSkuDetail
          key={selected}
          vi={vi}
          code={selected}
          sku={selectedRow ?? null}
          isActive={selectedRow?.isActive === true}
          onNotice={onNotice}
          onChanged={() => void reload()}
          onDeleted={() => setSelected('')}
        />
      ) : null}
    </div>
  )
}

function MasterSkuDetail({
  vi,
  code,
  sku,
  isActive,
  onNotice,
  onChanged,
  onDeleted,
}: {
  vi: boolean
  code: string
  sku: MasterSkuRecord | null
  isActive: boolean
  onNotice: (message: string) => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const [editName, setEditName] = useState(sku?.name ?? '')
  const [editGender, setEditGender] = useState<'nam' | 'nu' | 'unisex'>(
    sku?.gender === 'nam' || sku?.gender === 'nu' ? sku.gender : 'unisex',
  )
  const [editFragile, setEditFragile] = useState(sku?.isFragile === true)
  const [editWeight, setEditWeight] = useState(
    sku?.weightKg == null ? '' : String(sku.weightKg),
  )
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3 rounded-lg border border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm font-semibold text-ink">{code}</p>
        {isActive ? <CopySkuButton code={code} vi={vi} /> : null}
      </div>
      <PanelError message={error} />
      <form
        className="grid gap-2 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          const weight = editWeight.trim()
          void updateMasterSku(code, {
            name: editName.trim(),
            gender: editGender,
            is_fragile: editFragile,
            ...(weight === '' ? {} : { weight_kg: Number(weight) }),
          })
            .then(async () => {
              onNotice(vi ? 'Đã sửa tên, giới tính và cờ dễ vỡ. Mã SKU không đổi.' : 'Saved name, gender, and fragile flag. The SKU code stays.')
              onChanged()
            })
            .catch((err: unknown) => setError(formatApiError(err)))
        }}
      >
        <Input
          className={fieldClass}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder={vi ? 'Tên' : 'Name'}
        />
        <select
          className={fieldClass}
          value={editGender}
          onChange={(e) => {
            const value = e.target.value
            if (value === 'nam' || value === 'nu' || value === 'unisex') setEditGender(value)
          }}
        >
          <option value="unisex">Unisex</option>
          <option value="nam">{vi ? 'Nam' : 'Men'}</option>
          <option value="nu">{vi ? 'Nữ' : 'Women'}</option>
        </select>
        <Input
          className={fieldClass}
          type="number"
          min={0}
          step="0.01"
          value={editWeight}
          onChange={(e) => setEditWeight(e.target.value)}
          placeholder="kg"
        />
        <label className="flex items-center gap-2 text-xs text-ink">
          <input
            type="checkbox"
            checked={editFragile}
            onChange={(e) => setEditFragile(e.target.checked)}
          />
          {vi ? 'Dễ vỡ' : 'Fragile'}
        </label>
        <Button type="submit" className="h-9 text-xs sm:col-span-4" disabled={editName.trim().length < 2}>
          {vi ? 'Lưu thông tin SKU' : 'Save SKU details'}
        </Button>
      </form>
      <button
        type="button"
        className={rowActionClass}
        onClick={() => {
          void setMasterSkuActive(code, false)
            .then(() => {
              onNotice(vi ? 'Đã tắt SKU nội bộ.' : 'Internal SKU deactivated.')
              onChanged()
            })
            .catch((err: unknown) => setError(formatApiError(err)))
        }}
      >
        {vi ? 'Tắt SKU này' : 'Deactivate'}
      </button>
      <button
        type="button"
        className={rowActionClass}
        onClick={() => {
          const ok = window.confirm(
            vi
              ? `Xoá hẳn SKU ${code}? Không hoàn tác. Chỉ khi chưa nằm trên ô và chưa có nhập–xuất. Đã dùng thì chỉ tắt.`
              : `Permanently delete SKU ${code}? This cannot be undone.`,
          )
          if (!ok) return
          void purgeMasterSku(code)
            .then(() => {
              onNotice(vi ? `Đã xoá hẳn SKU ${code}.` : `Permanently deleted SKU ${code}.`)
              onChanged()
              onDeleted()
            })
            .catch((err: unknown) => setError(formatApiError(err)))
        }}
      >
        {vi ? 'Xoá hẳn' : 'Delete permanently'}
      </button>
    </div>
  )
}

const PRODUCT_CATEGORIES: Array<[string, string]> = [
  ['t_shirt', 'Áo thun'],
  ['shirt', 'Áo sơ mi'],
  ['jacket', 'Áo khoác'],
  ['shorts', 'Quần đùi'],
  ['trousers', 'Quần dài'],
  ['dress', 'Váy/đầm'],
  ['shoes', 'Giày (hộp)'],
  ['sandals', 'Dép/sandal'],
  ['accessory', 'Phụ kiện'],
  ['other', 'Khác'],
]

function PackagingProfileForm({
  vi,
  row,
  busy,
  onSave,
}: {
  vi: boolean
  row: ProductMasterRow | null
  busy: boolean
  onSave: (input: ConfirmPackagingProfileInput) => Promise<void>
}) {
  const [lengthCm, setLengthCm] = useState(row?.lengthCm != null ? String(row.lengthCm) : '')
  const [widthCm, setWidthCm] = useState(row?.widthCm != null ? String(row.widthCm) : '')
  const [heightCm, setHeightCm] = useState(row?.heightCm != null ? String(row.heightCm) : '')
  const [weightKg, setWeightKg] = useState(row?.weightKg != null ? String(row.weightKg) : '')
  const [fragile, setFragile] = useState(row?.isFragile ?? false)
  const [orientation, setOrientation] = useState<'any' | 'upright_only'>(row?.orientationRule ?? 'any')
  const [category, setCategory] = useState(row?.productCategory ?? 't_shirt')
  const [stack, setStack] = useState(row?.maxStackLoadKg != null ? String(row.maxStackLoadKg) : '')
  const [zipBag, setZipBag] = useState(row?.zipBagCode ?? '')
  const [zipFolded, setZipFolded] = useState(row?.zipBagFolded ?? false)
  const [fold, setFold] = useState(row?.canFoldInHalf ?? false)
  const shoes = category === 'shoes'

  if (!row) return null

  return (
    <form
      className="grid gap-2 rounded-lg border border-hairline bg-surface-2/40 p-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault()
        const length = Number(lengthCm)
        const width = Number(widthCm)
        const height = Number(heightCm)
        const weight = Number(weightKg)
        if (![length, width, height, weight].every((value) => Number.isFinite(value) && value > 0)) {
          return
        }
        void onSave({
          length_cm: length,
          width_cm: width,
          height_cm: height,
          weight_kg: weight,
          is_fragile: fragile,
          orientation_rule: orientation,
          product_category: category,
          max_stack_load_kg: stack.trim() === '' ? null : Number(stack),
          zip_bag_code: zipBag.trim() === '' ? null : zipBag.trim(),
          zip_bag_folded: zipBag.trim() !== '' && zipFolded,
          can_fold_in_half: shoes ? false : fold,
        })
      }}
    >
      <p className="sm:col-span-4 text-xs text-ink">
        {vi ? `Số đo sau gấp/bọc của ${row.sellerSku}` : `Folded size of ${row.sellerSku}`}
      </p>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Dài (cm)' : 'Length (cm)'}
        <Input className={fieldClass} value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} inputMode="decimal" />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Rộng (cm)' : 'Width (cm)'}
        <Input className={fieldClass} value={widthCm} onChange={(e) => setWidthCm(e.target.value)} inputMode="decimal" />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Cao (cm)' : 'Height (cm)'}
        <Input className={fieldClass} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} inputMode="decimal" />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Nặng (kg)' : 'Weight (kg)'}
        <Input className={fieldClass} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} inputMode="decimal" />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted sm:col-span-2">
        {vi ? 'Loại hàng' : 'Category'}
        <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {PRODUCT_CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted sm:col-span-2">
        {vi ? 'Hướng xếp' : 'Orientation'}
        <select
          className={fieldClass}
          value={orientation}
          onChange={(e) => setOrientation(e.target.value === 'upright_only' ? 'upright_only' : 'any')}
        >
          <option value="any">{vi ? 'Xoay tự do' : 'Any'}</option>
          <option value="upright_only">{vi ? 'Chỉ đứng' : 'Upright only'}</option>
        </select>
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted sm:col-span-2">
        {vi ? 'Tải chồng tối đa (kg, trống = không chồng)' : 'Max stack (kg, blank = none)'}
        <Input className={fieldClass} value={stack} onChange={(e) => setStack(e.target.value)} inputMode="decimal" />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted sm:col-span-2">
        {vi ? 'Mã túi zip' : 'Zip bag code'}
        <Input className={fieldClass} value={zipBag} onChange={(e) => setZipBag(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} />
        {vi ? 'Dễ vỡ' : 'Fragile'}
      </label>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" checked={zipFolded} onChange={(e) => setZipFolded(e.target.checked)} />
        {vi ? 'Gập đôi túi' : 'Fold bag'}
      </label>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={shoes ? false : fold}
          disabled={shoes}
          onChange={(e) => setFold(e.target.checked)}
        />
        {vi ? 'Có thể gập đôi hàng' : 'Can fold item'}
      </label>
      <Button type="submit" className="h-9 text-xs" disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {vi ? 'Lưu hồ sơ' : 'Save profile'}
      </Button>
    </form>
  )
}

export function ProductCatalogTab({
  vi,
  onNotice,
}: {
  vi: boolean
  onNotice: (message: string) => void
}) {
  const [shopId, setShopId] = useState('')
  const [full, setFull] = useState(false)
  const [products, setProducts] = useState<ProductMasterRow[]>([])
  const [measuringId, setMeasuringId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [profileStatus, setProfileStatus] = useState<'' | 'needs_measurement' | 'ready'>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const catalog = await listProductMaster({
      shopId: shopId.trim() || undefined,
      search: query.trim() || undefined,
      status: profileStatus || undefined,
    })
    setProducts(catalog.items)
  }

  useEffect(() => {
    let cancelled = false
    void listProductMaster({})
      .then((catalog) => {
        if (cancelled) return
        setProducts(catalog.items)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          void syncProductCatalog({ shopId: shopId.trim() || undefined, full })
            .then(async (results) => {
              const failed = results.find((row) => !row.ok)
              if (failed) {
                setError(failed.error || (vi ? 'Đồng bộ shop thất bại.' : 'Shop sync failed.'))
              } else {
                const synced = results.reduce((sum, row) => sum + row.synced, 0)
                onNotice(vi ? `Đã đồng bộ ${synced} SKU.` : `Synced ${synced} SKUs.`)
              }
              await reload()
            })
            .catch((err: unknown) => setError(formatApiError(err)))
            .finally(() => setBusy(false))
        }}
      >
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Shop ID (trống = mọi shop)' : 'Shop ID (blank = all shops)'}
          </span>
          <Input className={fieldClass} value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="201171264532" />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
          {vi ? 'Toàn bộ catalog' : 'Full catalog'}
        </label>
        <Button type="submit" className="h-9 text-xs" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {vi ? 'Đồng bộ sản phẩm từ Lazada' : 'Sync products from Lazada'}
        </Button>
      </form>
      <PanelError message={error} />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          void reload()
            .catch((err: unknown) => setError(formatApiError(err)))
            .finally(() => setBusy(false))
        }}
      >
        <Input
          className={fieldClass}
          placeholder={vi ? 'Tìm theo mã SKU' : 'Search by SKU'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={fieldClass}
          value={profileStatus}
          onChange={(e) => {
            const value = e.target.value
            setProfileStatus(
              value === 'needs_measurement' || value === 'ready' ? value : '',
            )
          }}
        >
          <option value="">{vi ? 'Mọi hồ sơ' : 'All profiles'}</option>
          <option value="needs_measurement">
            {vi ? 'Chưa đo' : 'Needs measurement'}
          </option>
          <option value="ready">{vi ? 'Đã xác nhận' : 'Ready'}</option>
        </select>
        <Button type="submit" variant="secondary" className="h-9 text-xs" disabled={busy}>
          {vi ? 'Lọc catalog' : 'Filter catalog'}
        </Button>
      </form>
      <p className="text-[11px] text-ink-muted">
        {vi
          ? 'Hồ sơ đóng gói. Số đo kho xác nhận mới dùng được khi đóng gói. Số sàn chỉ để tham khảo.'
          : 'Packaging profiles. Only warehouse-confirmed sizes are used when packing.'}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>{vi ? 'Hồ sơ' : 'Profile'}</TableHead>
            <TableHead>cm</TableHead>
            <TableHead>kg</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-ink">{row.sellerSku}</TableCell>
              <TableCell>
                <Badge tone={row.packagingProfileStatus === 'ready' ? 'primary' : 'warning'}>
                  {row.packagingProfileStatus === 'ready'
                    ? vi
                      ? 'Đã đo'
                      : 'Ready'
                    : vi
                      ? 'Chưa đo'
                      : 'Needs measure'}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">
                {row.lengthCm == null
                  ? vi
                    ? 'Chưa có kích thước'
                    : 'No size'
                  : `${row.lengthCm}×${row.widthCm}×${row.heightCm}`}
              </TableCell>
              <TableCell>{row.weightKg ?? '—'}</TableCell>
              <TableCell>
                <button
                  type="button"
                  className="text-xs font-medium text-primary"
                  onClick={() => setMeasuringId((current) => (current === row.id ? null : row.id))}
                >
                  {vi ? 'Xác nhận số đo' : 'Confirm size'}
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {measuringId ? (
        <PackagingProfileForm
          key={measuringId}
          vi={vi}
          row={products.find((row) => row.id === measuringId) ?? null}
          busy={busy}
          onSave={async (input) => {
            setBusy(true)
            setError(null)
            try {
              const saved = await confirmPackagingProfile(measuringId, input)
              setProducts((current) => current.map((row) => (row.id === saved.id ? saved : row)))
              const hint = saved.suggestedZipBagCode
                ? vi
                  ? ` Túi vừa nhất: ${saved.suggestedZipBagCode}.`
                  : ` Smallest bag: ${saved.suggestedZipBagCode}.`
                : ''
              onNotice(
                (vi ? `Đã xác nhận hồ sơ ${saved.sellerSku}.` : `Confirmed ${saved.sellerSku}.`) + hint,
              )
              setMeasuringId(null)
            } catch (err: unknown) {
              setError(formatApiError(err))
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}
