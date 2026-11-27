import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import {
  bulkAssignModel,
  createPrimitiveModel,
  getProductModel,
  listProductModels,
  replaceProductModelFile,
  setProductModelStatus,
  uploadProductModel,
  type BulkAssignResult,
  type CreditType,
  type ModelHistoryEntry,
  type PrimitiveParams,
  type ProductModelKind,
  type ProductModelRow,
} from '../../api/product-models.api'
import { ModelPreview } from '../../components/packing/ModelPicker'
import { PRODUCT_CATEGORY_KEYS, categoryLabel } from '../../components/packing/product-models'
import type { PrimitiveSpec } from '../../components/packing/scene/primitives'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../context/use-auth'
import { UserRole } from '../../types/auth'

/** Khớp PRIMITIVE_PARAM_RANGES ở BE (product-models/primitive-params.ts). */
const PARAM_RANGES: Record<PrimitiveSpec['shape'], { key: keyof PrimitiveParams; vi: string; min: number; max: number; def: number }[]> = {
  box: [{ key: 'corner_radius_pct', vi: 'Bo góc', min: 0, max: 20, def: 0 }],
  cylinder: [{ key: 'cap_height_pct', vi: 'Cao nắp', min: 0, max: 30, def: 0 }],
  bottle: [
    { key: 'shoulder_pct', vi: 'Cao vai', min: 5, max: 30, def: 15 },
    { key: 'neck_height_pct', vi: 'Cao cổ', min: 5, max: 40, def: 20 },
    { key: 'neck_diameter_pct', vi: 'Rộng cổ', min: 15, max: 80, def: 40 },
    { key: 'cap_height_pct', vi: 'Cao nắp', min: 0, max: 20, def: 8 },
  ],
  tube: [
    { key: 'cap_height_pct', vi: 'Cao nắp', min: 5, max: 25, def: 12 },
    { key: 'crimp_pct', vi: 'Mép dán', min: 5, max: 15, def: 8 },
  ],
}

const SHAPE_LABEL: Record<PrimitiveSpec['shape'], string> = { box: 'Hộp', cylinder: 'Hũ / lon (trụ)', bottle: 'Chai', tube: 'Tuýp' }
const PREVIEW_DIMS: Record<PrimitiveSpec['shape'], [number, number, number]> = {
  box: [20, 15, 8],
  cylinder: [8, 8, 10],
  bottle: [6, 6, 20],
  tube: [5, 3, 18],
}
const field = 'h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink'

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function PrimitiveForm({ vi, onCreated }: { vi: boolean; onCreated: (m: ProductModelRow) => void }): ReactNode {
  const [name, setName] = useState('')
  const [shape, setShape] = useState<PrimitiveSpec['shape']>('bottle')
  const [params, setParams] = useState<PrimitiveParams>({})
  const [body, setBody] = useState('#e2e8f0')
  const [cap, setCap] = useState('#334155')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ranges = PARAM_RANGES[shape]
  const value = (k: keyof PrimitiveParams, def: number): number => params[k] ?? def
  const preview = useMemo<ProductModelRow>(() => {
    const spec: PrimitiveSpec = {
      shape,
      corner_radius_pct: null,
      cap_height_pct: null,
      shoulder_pct: null,
      neck_height_pct: null,
      neck_diameter_pct: null,
      crimp_pct: null,
      body_color: body,
      cap_color: cap,
    }
    for (const r of ranges) spec[r.key] = params[r.key] ?? r.def
    return {
      id: `draft-${JSON.stringify(spec)}`,
      name,
      source: 'primitive',
      sourceLabel: '',
      kind: 'rigid',
      categoryKey: null,
      version: 1,
      status: 'active',
      hasFoldRig: false,
      bboxM: null,
      credit: null,
      usageCount: 0,
      snapshot: { id: 'draft', version: 1, source: 'primitive', kind: 'rigid', url: null, primitive: spec },
    }
  }, [shape, params, body, cap, ranges, name])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (name.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      const picked: PrimitiveParams = {}
      for (const r of ranges) picked[r.key] = value(r.key, r.def)
      onCreated(await createPrimitiveModel({ name: name.trim(), shape, params: picked, body_color: body, cap_color: cap }))
      setName('')
    } catch (e: unknown) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => void submit(e)}>
      <div className="space-y-2">
        <label className="block space-y-1 text-[11px] text-ink-muted">
          {vi ? 'Tên mô hình' : 'Name'}
          <Input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Chai serum cổ hẹp" />
        </label>
        <label className="block space-y-1 text-[11px] text-ink-muted">
          {vi ? 'Dáng' : 'Shape'}
          <select
            className={field}
            value={shape}
            onChange={(e) => {
              setShape(e.target.value as PrimitiveSpec['shape'])
              setParams({})
            }}
          >
            {(Object.keys(SHAPE_LABEL) as PrimitiveSpec['shape'][]).map((s) => (
              <option key={s} value={s}>
                {SHAPE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {ranges.map((r) => (
          <label key={r.key} className="block space-y-1 text-[11px] text-ink-muted">
            {r.vi}: {value(r.key, r.def)}% ({r.min}–{r.max})
            <input
              type="range"
              className="w-full"
              min={r.min}
              max={r.max}
              value={value(r.key, r.def)}
              onChange={(e) => setParams((p) => ({ ...p, [r.key]: Number(e.target.value) }))}
            />
          </label>
        ))}
        <div className="flex gap-3">
          <label className="space-y-1 text-[11px] text-ink-muted">
            {vi ? 'Màu thân' : 'Body'}
            <Input type="color" className="h-9 w-14 p-1" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          {shape !== 'box' ? (
            <label className="space-y-1 text-[11px] text-ink-muted">
              {vi ? 'Màu nắp' : 'Cap'}
              <Input type="color" className="h-9 w-14 p-1" value={cap} onChange={(e) => setCap(e.target.value)} />
            </label>
          ) : null}
        </div>
        <Button type="submit" className="h-9 text-xs" disabled={busy || name.trim().length < 2}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {vi ? 'Tạo mô hình' : 'Create model'}
        </Button>
        {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
      </div>
      <div className="space-y-1">
        <ModelPreview model={preview} dimsCm={PREVIEW_DIMS[shape]} />
        <p className="text-[11px] text-ink-muted">
          {vi ? 'Xem trước với số đo mẫu — khi gắn cho SKU, hình giãn theo số đo của SKU.' : 'Sample size — stretched to each SKU’s size.'}
        </p>
      </div>
    </form>
  )
}

function UploadForm({ vi, onCreated }: { vi: boolean; onCreated: (m: ProductModelRow) => void }): ReactNode {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProductModelKind>('rigid')
  const [creditType, setCreditType] = useState<CreditType>('self_made')
  const [creditUrl, setCreditUrl] = useState('')
  const [license, setLicense] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsSource = creditType === 'external'

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!file || name.trim().length < 2 || (needsSource && (!creditUrl.trim() || !license.trim()))) return
    setBusy(true)
    setError(null)
    try {
      onCreated(
        await uploadProductModel({
          file,
          name: name.trim(),
          kind,
          credit: { type: creditType, url: creditUrl.trim() || null, license: license.trim() || null },
        }),
      )
      setFile(null)
      setName('')
    } catch (e: unknown) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => void submit(e)}>
      <label className="space-y-1 text-[11px] text-ink-muted sm:col-span-3">
        {vi ? 'File GLB (glTF 2.0, ≤ 10 MB, đơn vị mét)' : 'GLB file (glTF 2.0, ≤ 10 MB, meters)'}
        <input type="file" accept=".glb,model/gltf-binary" className="block text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Tên mô hình' : 'Name'}
        <Input className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Loại' : 'Kind'}
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value === 'garment' ? 'garment' : 'rigid')}>
          <option value="rigid">{vi ? 'Hàng cứng' : 'Rigid'}</option>
          <option value="garment">{vi ? 'Quần áo (có xương gập, hoặc trải phẳng để tự tạo bước gập)' : 'Garment (fold rig, or laid flat for auto fold)'}</option>
        </select>
      </label>
      <label className="space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Nguồn' : 'Source'}
        <select className={field} value={creditType} onChange={(e) => setCreditType(e.target.value as CreditType)}>
          <option value="self_made">{vi ? 'Tự dựng' : 'Self-made'}</option>
          <option value="supplier">{vi ? 'Nhà cung cấp gửi' : 'Supplier'}</option>
          <option value="external">{vi ? 'Tải từ nguồn ngoài' : 'External'}</option>
        </select>
      </label>
      {needsSource ? (
        <>
          <label className="space-y-1 text-[11px] text-ink-muted sm:col-span-2">
            {vi ? 'Link nguồn' : 'Source URL'}
            <Input className={field} value={creditUrl} onChange={(e) => setCreditUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="space-y-1 text-[11px] text-ink-muted">
            {vi ? 'Giấy phép' : 'License'}
            <Input className={field} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="CC-BY-4.0" />
          </label>
        </>
      ) : null}
      <div className="sm:col-span-3">
        <Button type="submit" className="h-9 text-xs" disabled={busy || !file || name.trim().length < 2}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {vi ? 'Tải lên' : 'Upload'}
        </Button>
        {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
      </div>
    </form>
  )
}

/** Đợt 2 — lịch sử phiên bản: bấm một bản cũ để xem lại hình (file cũ không bị xoá khi thay). */
function HistoryList({
  vi,
  history,
  viewing,
  onView,
}: {
  vi: boolean
  history: ModelHistoryEntry[]
  viewing: number | null
  onView: (version: number | null) => void
}): ReactNode {
  if (history.length === 0) return <p className="text-[11px] text-ink-muted">{vi ? 'Chưa có bản cũ.' : 'No earlier versions.'}</p>
  return (
    <ul className="space-y-1 text-[11px]">
      {history.map((h) => (
        <li key={h.version}>
          <button
            type="button"
            className={`w-full rounded px-2 py-1 text-left hover:bg-surface-2 ${viewing === h.version ? 'bg-surface-2 text-ink' : 'text-ink-muted'}`}
            onClick={() => onView(viewing === h.version ? null : h.version)}
          >
            v{h.version} · {vi ? 'thay lúc' : 'replaced'} {new Date(h.replacedAt).toLocaleString(vi ? 'vi-VN' : 'en-US')}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Đợt 2 — Admin gắn mô hình đang chọn cho mọi SKU khớp bộ lọc. Luôn đếm thử trước, rồi mới ghi.
 * SKU khác loại với mô hình bị bỏ qua (cùng luật với gắn lẻ).
 */
function BulkAssignForm({
  vi,
  model,
  models,
  onDone,
}: {
  vi: boolean
  model: ProductModelRow
  models: ProductModelRow[]
  onDone: (message: string) => void
}): ReactNode {
  const [category, setCategory] = useState('')
  const [fromModel, setFromModel] = useState('')
  const [sku, setSku] = useState('')
  const [preview, setPreview] = useState<BulkAssignResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filter = { product_category: category || undefined, from_model_id: fromModel || undefined, q: sku.trim() || undefined }
  const hasFilter = Boolean(filter.product_category || filter.from_model_id || filter.q)

  async function run(dryRun: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const r = await bulkAssignModel(model.id, { ...filter, dry_run: dryRun })
      if (dryRun) {
        setPreview(r)
      } else {
        setPreview(null)
        onDone(vi ? `Đã gắn "${model.name}" cho ${String(r.assigned)} SKU.` : `Assigned to ${String(r.assigned)} SKUs.`)
      }
    } catch (e: unknown) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-hairline p-2">
      <p className="text-[11px] font-medium text-ink">{vi ? 'Gắn hàng loạt cho SKU' : 'Bulk assign to SKUs'}</p>
      <label className="block space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Loại sản phẩm' : 'Category'}
        <select
          className={field}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPreview(null)
          }}
        >
          <option value="">{vi ? 'Mọi loại' : 'Any'}</option>
          {PRODUCT_CATEGORY_KEYS.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c, vi)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Đang dùng mô hình' : 'Currently using'}
        <select
          className={field}
          value={fromModel}
          onChange={(e) => {
            setFromModel(e.target.value)
            setPreview(null)
          }}
        >
          <option value="">{vi ? 'Bất kỳ' : 'Any'}</option>
          {models
            .filter((m) => m.id !== model.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      <label className="block space-y-1 text-[11px] text-ink-muted">
        {vi ? 'Mã SKU chứa' : 'SKU contains'}
        <Input
          className={field}
          value={sku}
          onChange={(e) => {
            setSku(e.target.value)
            setPreview(null)
          }}
        />
      </label>
      {preview ? (
        <div className="space-y-1 text-[11px] text-ink">
          <p>
            {vi
              ? `Khớp ${String(preview.matched)} SKU: sẽ gắn ${String(preview.assigned)}, đã dùng sẵn ${String(preview.alreadyUsing)}.`
              : `${String(preview.matched)} matched: ${String(preview.assigned)} to assign, ${String(preview.alreadyUsing)} already using.`}
          </p>
          {preview.skipped.map((s) => (
            <p key={s.productCategory ?? 'none'} className="text-amber-700">
              {vi ? 'Bỏ qua' : 'Skipped'} {s.count} · {categoryLabel(s.productCategory, vi)}: {s.reason}
            </p>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="h-8 text-xs" disabled={busy || !hasFilter} onClick={() => void run(true)}>
          {vi ? 'Đếm thử' : 'Preview'}
        </Button>
        <Button
          type="button"
          className="h-8 text-xs"
          disabled={busy || !preview || preview.assigned === 0}
          onClick={() => {
            const msg = vi
              ? `Gắn "${model.name}" cho ${String(preview?.assigned ?? 0)} SKU? Kế hoạch đã lưu giữ hình cũ.`
              : `Assign to ${String(preview?.assigned ?? 0)} SKUs?`
            if (window.confirm(msg)) void run(false)
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {vi ? 'Gắn' : 'Assign'}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  )
}

/** AOFP-352 — tab "Mô hình 3D": thư viện dùng chung. Thay file / ngừng dùng chỉ Admin. */
export function ProductModelsTab({ vi, onNotice }: { vi: boolean; onNotice: (message: string) => void }): ReactNode {
  const { session } = useAuth()
  const isAdmin = session?.role === UserRole.ADMIN
  const [rows, setRows] = useState<ProductModelRow[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'active' | 'retired' | 'all'>('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'primitive' | 'upload' | null>(null)
  const [history, setHistory] = useState<{ id: string; version: number; items: ModelHistoryEntry[] } | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    listProductModels({ q: q.trim() || undefined, status })
      .then((r) => {
        setRows(r.items)
        setError(null)
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setLoading(false))
  }, [q, status])

  useEffect(() => {
    const t = window.setTimeout(load, 250)
    return () => window.clearTimeout(t)
  }, [load])

  const selected = rows.find((r) => r.id === selectedId) ?? null
  const selectedVersion = selected?.version

  useEffect(() => {
    if (!selectedId || selectedVersion === undefined) return
    let alive = true
    getProductModel(selectedId)
      .then((d) => {
        if (alive) setHistory({ id: selectedId, version: selectedVersion, items: d.history })
      })
      .catch(() => {
        if (alive) setHistory({ id: selectedId, version: selectedVersion, items: [] })
      })
    return () => {
      alive = false
    }
  }, [selectedId, selectedVersion])

  const historyItems = history && history.id === selectedId && history.version === selectedVersion ? history.items : null
  const viewed = historyItems?.find((h) => h.version === viewing) ?? null
  const shown: ProductModelRow | null = selected && viewed ? { ...selected, version: viewed.version, snapshot: viewed.snapshot } : selected

  function created(m: ProductModelRow): void {
    onNotice(vi ? `Đã thêm mô hình "${m.name}".` : `Added "${m.name}".`)
    setMode(null)
    setSelectedId(m.id)
    load()
  }

  async function act(fn: () => Promise<ProductModelRow>, done: string): Promise<void> {
    try {
      await fn()
      onNotice(done)
      load()
    } catch (e: unknown) {
      setError(message(e))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        {vi
          ? 'Mô hình chỉ là dáng hiển thị trong hướng dẫn đóng gói — kích thước luôn lấy theo số đo của từng SKU, không ảnh hưởng chọn thùng.'
          : 'Models are display shapes only — size always comes from each SKU’s measurements.'}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 space-y-1 text-[11px] text-ink-muted">
          {vi ? 'Tìm theo tên' : 'Search'}
          <Input className={field} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="space-y-1 text-[11px] text-ink-muted">
          {vi ? 'Trạng thái' : 'Status'}
          <select className={field} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">{vi ? 'Đang dùng' : 'Active'}</option>
            <option value="retired">{vi ? 'Đã ngừng dùng' : 'Retired'}</option>
            <option value="all">{vi ? 'Tất cả' : 'All'}</option>
          </select>
        </label>
        <Button type="button" variant="secondary" className="h-9 text-xs" onClick={() => setMode(mode === 'primitive' ? null : 'primitive')}>
          {vi ? 'Dựng hình cơ bản' : 'Basic shape'}
        </Button>
        <Button type="button" variant="secondary" className="h-9 text-xs" onClick={() => setMode(mode === 'upload' ? null : 'upload')}>
          {vi ? 'Tải file GLB' : 'Upload GLB'}
        </Button>
      </div>
      {mode ? (
        <div className="rounded-lg border border-hairline bg-surface-2/40 p-3">
          {mode === 'primitive' ? <PrimitiveForm vi={vi} onCreated={created} /> : <UploadForm vi={vi} onCreated={created} />}
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-3 py-2">{vi ? 'Tên' : 'Name'}</th>
                <th className="px-3 py-2">{vi ? 'Nguồn' : 'Source'}</th>
                <th className="px-3 py-2">{vi ? 'Bản' : 'Ver.'}</th>
                <th className="px-3 py-2 text-right">{vi ? 'SKU dùng' : 'SKUs'}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : null}
              {rows.map((m) => (
                <tr
                  key={m.id}
                  className={`cursor-pointer border-t border-hairline ${m.id === selectedId ? 'bg-surface-2' : 'hover:bg-surface-2/50'}`}
                  onClick={() => {
                    setSelectedId(m.id)
                    setViewing(null)
                  }}
                >
                  <td className="px-3 py-2 text-ink">
                    {m.name}
                    {m.kind === 'garment' ? <span className="ml-1 text-ink-muted">· {vi ? 'quần áo' : 'garment'}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge>{m.sourceLabel}</Badge>
                    {m.status === 'retired' ? <Badge className="ml-1">{vi ? 'Ngừng dùng' : 'Retired'}</Badge> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">v{m.version}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.usageCount ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin ? (
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {m.source !== 'primitive' ? (
                          <label className="cursor-pointer rounded px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2">
                            {vi ? 'Thay file' : 'Replace'}
                            <input
                              type="file"
                              accept=".glb,model/gltf-binary"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                e.target.value = ''
                                if (!f) return
                                const msg = vi
                                  ? `Thay file cho "${m.name}"? ${String(m.usageCount ?? 0)} SKU đang dùng sẽ đổi hình; kế hoạch đã lưu giữ hình cũ.`
                                  : `Replace file for "${m.name}"?`
                                if (window.confirm(msg)) void act(() => replaceProductModelFile(m.id, f), vi ? 'Đã thay file.' : 'Replaced.')
                              }}
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2"
                          onClick={() =>
                            void act(
                              () => setProductModelStatus(m.id, m.status === 'active'),
                              m.status === 'active' ? (vi ? 'Đã ngừng dùng.' : 'Retired.') : vi ? 'Đã dùng lại.' : 'Restored.',
                            )
                          }
                        >
                          {m.status === 'active' ? (vi ? 'Ngừng dùng' : 'Retire') : vi ? 'Dùng lại' : 'Restore'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                    {vi ? 'Chưa có mô hình. Chạy migrate-product-models hoặc tạo mới.' : 'No models yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="space-y-2">
          {selected && shown ? (
            <>
              <ModelPreview model={shown} dimsCm={shown.snapshot.primitive ? PREVIEW_DIMS[shown.snapshot.primitive.shape] : [0, 0, 0]} />
              <p className="text-xs text-ink">
                {selected.name}
                {viewed ? (
                  <span className="ml-1 text-amber-700">{vi ? `· đang xem bản cũ v${String(viewed.version)}` : `· viewing v${String(viewed.version)}`}</span>
                ) : null}
              </p>
              {selected.credit ? (
                <p className="text-[11px] text-ink-muted">
                  {vi ? 'Nguồn: ' : 'Credit: '}
                  {selected.credit.type === 'external' && selected.credit.url ? (
                    <a className="underline" href={selected.credit.url} target="_blank" rel="noreferrer">
                      {selected.credit.license ?? selected.credit.url}
                    </a>
                  ) : selected.credit.type === 'supplier' ? (
                    vi ? 'nhà cung cấp' : 'supplier'
                  ) : vi ? (
                    'tự dựng'
                  ) : (
                    'self-made'
                  )}
                </p>
              ) : null}
              <p className="pt-1 text-[11px] font-medium text-ink">
                {vi ? `Lịch sử phiên bản (hiện tại v${String(selected.version)})` : `Versions (current v${String(selected.version)})`}
              </p>
              {historyItems ? (
                <HistoryList vi={vi} history={historyItems} viewing={viewing} onView={setViewing} />
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />
              )}
              {isAdmin && selected.status === 'active' ? (
                <BulkAssignForm
                  key={selected.id}
                  vi={vi}
                  model={selected}
                  models={rows}
                  onDone={(msg) => {
                    onNotice(msg)
                    load()
                  }}
                />
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-ink-muted">{vi ? 'Chọn một mô hình để xem trước.' : 'Pick a model to preview.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
