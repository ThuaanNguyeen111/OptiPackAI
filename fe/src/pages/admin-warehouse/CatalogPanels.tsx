import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  createColor,
  createMasterSku,
  createSkuMapping,
  deleteSkuMapping,
  listColors,
  listMasterSkus,
  listProductMaster,
  listSkuMappings,
  listUnmappedSellerSkus,
  listUnpooledStock,
  lookupStockAvailability,
  previewMasterSku,
  replaceMasterSku,
  setColorActive,
  setMasterSkuActive,
  syncPooledStock,
  syncProductCatalog,
  updateColor,
  type ColorRecord,
  type MasterSkuRecord,
  type ProductMasterRow,
  type SkuMappingRecord,
  type StockAvailability,
  type UnmappedSellerSku,
  type UnpooledStockRow,
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
          vi={vi}
          code={selected}
          isActive={selectedRow?.isActive === true}
          colors={activeColors}
          onNotice={onNotice}
          onChanged={() => void reload()}
        />
      ) : null}
    </div>
  )
}

function MasterSkuDetail({
  vi,
  code,
  isActive,
  colors,
  onNotice,
  onChanged,
}: {
  vi: boolean
  code: string
  isActive: boolean
  colors: ColorRecord[]
  onNotice: (message: string) => void
  onChanged: () => void
}) {
  const [mappings, setMappings] = useState<SkuMappingRecord[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedSellerSku[]>([])
  const [linkKey, setLinkKey] = useState('')
  const [color, setColor] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const [links, pending] = await Promise.all([listSkuMappings(code), listUnmappedSellerSkus()])
    setMappings(links)
    setUnmapped(pending)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([listSkuMappings(code), listUnmappedSellerSkus()])
      .then(([links, pending]) => {
        if (cancelled) return
        setMappings(links)
        setUnmapped(pending)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <div className="space-y-3 rounded-lg border border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm font-semibold text-ink">{code}</p>
        {isActive ? <CopySkuButton code={code} vi={vi} /> : null}
      </div>
      <PanelError message={error} />
      <p className="text-[11px] text-ink-muted">{vi ? 'SKU sàn đã nối' : 'Mapped seller SKUs'}</p>
      {mappings.length === 0 ? (
        <p className="text-xs text-ink-muted">{vi ? 'Chưa nối SKU sàn nào.' : 'No seller SKU mapped yet.'}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {mappings.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <span>
                {row.platform} · {row.shopId} · {row.sellerSku}
              </span>
              <button
                type="button"
                className={rowActionClass}
                onClick={() => {
                  void deleteSkuMapping(row.id)
                    .then(async () => {
                      await reload()
                      onNotice(vi ? 'Đã bỏ nối.' : 'Mapping removed.')
                    })
                    .catch((err: unknown) => setError(formatApiError(err)))
                }}
              >
                {vi ? 'Bỏ nối' : 'Unmap'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <select className={fieldClass} value={linkKey} onChange={(e) => setLinkKey(e.target.value)}>
          <option value="">{vi ? 'Nối thêm từ SKU chưa nối' : 'Map an unmapped seller SKU'}</option>
          {unmapped.map((row) => {
            const key = `${row.platform}|${row.shop_id}|${row.seller_sku}`
            return (
              <option key={key} value={key}>
                {row.seller_sku} · {row.shop_id}
              </option>
            )
          })}
        </select>
        <Button
          className="h-9 text-xs"
          disabled={!linkKey}
          onClick={() => {
            const [platform, shopId, sellerSku] = linkKey.split('|')
            if (!platform || !shopId || !sellerSku) return
            void createSkuMapping(code, { platform, shop_id: shopId, seller_sku: sellerSku })
              .then(async () => {
                setLinkKey('')
                await reload()
                onChanged()
                onNotice(vi ? 'Đã nối SKU sàn.' : 'Seller SKU mapped.')
              })
              .catch((err: unknown) => setError(formatApiError(err)))
          }}
        >
          {vi ? 'Nối' : 'Map'}
        </Button>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!color || reason.trim().length < 3) return
          void replaceMasterSku(code, { color_code: color, reason: reason.trim() })
            .then((result) => {
              onNotice(
                vi
                  ? `Đã thay bằng ${result.newSku}, chuyển ${result.movedMappings} liên kết.`
                  : `Replaced by ${result.newSku}.`,
              )
              onChanged()
            })
            .catch((err: unknown) => setError(formatApiError(err)))
        }}
      >
        <select className={fieldClass} value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">{vi ? 'Đổi màu (thay thế SKU)' : 'New color'}</option>
          {colors.map((row) => (
            <option key={row.code} value={row.code}>
              {row.code} · {row.name}
            </option>
          ))}
        </select>
        <Input
          className={fieldClass}
          placeholder={vi ? 'Lý do, ví dụ đặt nhầm màu' : 'Reason'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" variant="secondary" className="h-9 text-xs" disabled={!color || reason.trim().length < 3}>
          {vi ? 'Thay thế SKU' : 'Replace SKU'}
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
    </div>
  )
}

export function LinkSkuTab({
  vi,
  onNotice,
}: {
  vi: boolean
  onNotice: (message: string) => void
}) {
  const [shopId, setShopId] = useState('')
  const [full, setFull] = useState(false)
  const [pending, setPending] = useState<UnmappedSellerSku[]>([])
  const [masters, setMasters] = useState<MasterSkuRecord[]>([])
  const [targetByKey, setTargetByKey] = useState<Record<string, string>>({})
  const [products, setProducts] = useState<ProductMasterRow[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return pending
    return pending.filter((row) =>
      `${row.seller_sku} ${row.shop_id} ${row.platform}`.toLowerCase().includes(needle),
    )
  }, [pending, query])

  async function reload() {
    const [unmapped, skuPage, catalog] = await Promise.all([
      listUnmappedSellerSkus(),
      listMasterSkus({ limit: 100 }),
      listProductMaster({ shopId: shopId.trim() || undefined, search: query.trim() || undefined }),
    ])
    setPending(unmapped)
    setMasters(skuPage.items.filter((row) => row.isActive))
    setProducts(catalog.items)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      listUnmappedSellerSkus(),
      listMasterSkus({ limit: 100 }),
      listProductMaster({}),
    ])
      .then(([unmapped, skuPage, catalog]) => {
        if (cancelled) return
        setPending(unmapped)
        setMasters(skuPage.items.filter((row) => row.isActive))
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
      {pending.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {vi
            ? `${pending.length} SKU sàn chưa nối SKU nội bộ.`
            : `${pending.length} seller SKUs are not mapped to an internal SKU.`}
        </div>
      ) : null}
      <Input
        className={fieldClass}
        placeholder={vi ? 'Lọc SKU chưa nối' : 'Filter unmapped SKUs'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU sàn</TableHead>
            <TableHead>Shop</TableHead>
            <TableHead>{vi ? 'Nối vào' : 'Map to'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row) => {
            const key = `${row.platform}|${row.shop_id}|${row.seller_sku}`
            return (
              <TableRow key={key}>
                <TableCell className="font-medium text-ink">{row.seller_sku}</TableCell>
                <TableCell className="text-xs text-ink-muted">
                  {row.platform} · {row.shop_id}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <select
                      className={fieldClass}
                      value={targetByKey[key] ?? ''}
                      onChange={(e) =>
                        setTargetByKey((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    >
                      <option value="">{vi ? 'Chọn SKU nội bộ' : 'Internal SKU'}</option>
                      {masters.map((sku) => (
                        <option key={sku.masterSku} value={sku.masterSku}>
                          {sku.masterSku}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="h-9 text-xs"
                      disabled={!targetByKey[key]}
                      onClick={() => {
                        const target = targetByKey[key]
                        if (!target) return
                        void createSkuMapping(target, {
                          platform: row.platform,
                          shop_id: row.shop_id,
                          seller_sku: row.seller_sku,
                        })
                          .then(async () => {
                            await reload()
                            onNotice(vi ? `Đã nối ${row.seller_sku}.` : `Mapped ${row.seller_sku}.`)
                          })
                          .catch((err: unknown) => setError(formatApiError(err)))
                      }}
                    >
                      {vi ? 'Nối' : 'Map'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <p className="text-[11px] text-ink-muted">
        {vi ? 'Sản phẩm đã đồng bộ (kích thước dùng cho đóng gói)' : 'Synced products'}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>cm</TableHead>
            <TableHead>kg</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-ink">
                {row.sellerSku}
                {row.manualOverride ? (
                  <Badge tone="primary" className="ml-1">
                    {vi ? 'Đã sửa tay' : 'Manual'}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-xs">
                {row.lengthCm == null
                  ? vi
                    ? 'Chưa có kích thước'
                    : 'No size'
                  : `${row.lengthCm}×${row.widthCm}×${row.heightCm}`}
              </TableCell>
              <TableCell>{row.weightKg ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ReconcileTab({
  vi,
  onNotice,
}: {
  vi: boolean
  onNotice: (message: string) => void
}) {
  const [notMapped, setNotMapped] = useState<UnpooledStockRow[]>([])
  const [mappedNotSynced, setMappedNotSynced] = useState<UnpooledStockRow[]>([])
  const [shopId, setShopId] = useState('')
  const [sellerSku, setSellerSku] = useState('')
  const [availability, setAvailability] = useState<StockAvailability | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const report = await listUnpooledStock()
    setNotMapped(report.notMapped)
    setMappedNotSynced(report.mappedNotSynced)
  }

  useEffect(() => {
    let cancelled = false
    void listUnpooledStock()
      .then((report) => {
        if (cancelled) return
        setNotMapped(report.notMapped)
        setMappedNotSynced(report.mappedNotSynced)
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9 text-xs"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            void syncPooledStock()
              .then(async (result) => {
                await reload()
                onNotice(
                  vi
                    ? `Gộp tồn: ${result.mappings} liên kết, gắn nhãn ${result.tagged}, gộp ${result.merged}.`
                    : `Stock sync: tagged ${result.tagged}, merged ${result.merged}.`,
                )
              })
              .catch((err: unknown) => setError(formatApiError(err)))
              .finally(() => setBusy(false))
          }}
        >
          {vi ? 'Đồng bộ tồn' : 'Sync stock'}
        </Button>
        <span className="text-xs text-ink-muted">
          {vi
            ? 'Gắn nhãn và gộp các liên kết đã nối. Bấm lại nhiều lần vẫn an toàn.'
            : 'Tags and merges mapped stock. Safe to run again.'}
        </span>
      </div>
      <PanelError message={error} />
      <StockTable vi={vi} title={vi ? 'Chưa nối' : 'Not mapped'} rows={notMapped} />
      <StockTable
        vi={vi}
        title={vi ? 'Đã nối, chưa đồng bộ tồn' : 'Mapped, stock not synced'}
        rows={mappedNotSynced}
      />
      <form
        className="grid gap-2 rounded-lg border border-hairline bg-surface-2/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          void lookupStockAvailability({
            platform: 'lazada',
            shop_id: shopId.trim(),
            seller_sku: sellerSku.trim(),
          })
            .then(setAvailability)
            .catch((err: unknown) => setError(formatApiError(err)))
        }}
      >
        <p className="text-xs font-medium text-ink sm:col-span-3">
          {vi ? 'Tra tồn khả dụng' : 'Available stock'}
        </p>
        <Input className={fieldClass} placeholder="shop_id" value={shopId} onChange={(e) => setShopId(e.target.value)} />
        <Input className={fieldClass} placeholder="seller SKU" value={sellerSku} onChange={(e) => setSellerSku(e.target.value)} />
        <Button type="submit" variant="secondary" className="h-9 text-xs" disabled={!shopId.trim() || !sellerSku.trim()}>
          {vi ? 'Tra' : 'Look up'}
        </Button>
        {availability ? (
          <p className="text-sm text-ink sm:col-span-3">
            {vi ? 'Tồn thực' : 'On hand'} {availability.onHand} · {vi ? 'Đã giữ' : 'Reserved'}{' '}
            {availability.reserved} · {vi ? 'Khả dụng' : 'Available'} {availability.available}
            {availability.masterSku ? ` · ${availability.masterSku}` : ''}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function StockTable({
  vi,
  title,
  rows,
}: {
  vi: boolean
  title: string
  rows: UnpooledStockRow[]
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-ink">
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-muted">{vi ? 'Không có dòng nào.' : 'None.'}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>{vi ? 'Tồn' : 'Qty'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.assignmentId || `${row.sellerSku}-${row.binLocationId}`}>
                <TableCell className="font-medium text-ink">{row.sellerSku}</TableCell>
                <TableCell className="text-xs">{row.shopId}</TableCell>
                <TableCell>{row.quantityOnHand}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
