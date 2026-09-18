import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Layers,
  Loader2,
  MapPin,
  PackagePlus,
  Plus,
  RefreshCw,
  ScanLine,
} from 'lucide-react'
import { getWarehousePickingList } from '../api/warehouse.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { usePortal } from '../context/use-portal'
import { useAdminWarehouse } from '../hooks/useAdminWarehouse'
import { cn } from '../lib/cn'
import { formatApiError } from '../lib/api'
import { AdminToast } from '../modules/admin/components/AdminToast'
import type {
  UnassignedSku,
  WarehousePickingListItem,
} from '../types/warehouse-admin'

const fieldClass =
  'w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

type TabId = 'zones' | 'bins' | 'assign' | 'stock' | 'picking'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function AdminWarehousePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const api = useAdminWarehouse()
  const [tab, setTab] = useState<TabId>('zones')
  const [toast, setToast] = useState<string | null>(null)
  const [pickedBinId, setPickedBinId] = useState('')

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  const tabs: Array<{ id: TabId; labelVi: string; labelEn: string }> = [
    { id: 'zones', labelVi: 'Khu', labelEn: '2. Zones' },
    { id: 'bins', labelVi: 'Kệ', labelEn: '3. Bins' },
    { id: 'assign', labelVi: 'SKU', labelEn: '4. Assign SKU' },
    { id: 'stock', labelVi: 'Nhập tồn', labelEn: 'Restock' },
    { id: 'picking', labelVi: 'Danh sách lấy hàng', labelEn: 'Picking list' },
  ]

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Cấu hình kho' : 'Warehouse' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Cấu hình kho' : 'Warehouse configuration'}
              </h1>
            </div>
            <Button
              variant="secondary"
              className="h-9 gap-1.5 text-xs"
              disabled={api.loading || api.mutating}
              onClick={() => {
                void api.reload()
                void api.reloadUnassigned()
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {vi ? 'Tải lại' : 'Reload'}
            </Button>
          </div>

          {api.error ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">{api.error}</p>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => api.setError(null)}
              >
                {vi ? 'Đóng' : 'Dismiss'}
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <WarehouseListPanel
              vi={vi}
              api={api}
              onCreated={() => {
                showToast(vi ? 'Đã tạo kho.' : 'Warehouse created.')
                setTab('zones')
              }}
            />

            <section className="min-w-0 rounded-xl border border-hairline bg-surface-1">
              {!api.selectedWarehouse ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <Boxes className="h-8 w-8 text-ink-tertiary" />
                  <p className="text-sm font-medium text-ink">
                    {vi ? 'Chưa có kho nào' : 'No warehouse yet'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-hairline px-4 py-3">
                    <p className="text-sm font-semibold text-ink">
                      {api.selectedWarehouse.warehouseName}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {api.selectedWarehouse.warehouseCode} ·{' '}
                      {api.selectedWarehouse.address}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 border-b border-hairline p-2">
                    {tabs.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={cn(
                          'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          tab === item.id
                            ? 'bg-primary/15 text-primary-hover'
                            : 'text-ink-subtle hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {vi ? item.labelVi : item.labelEn}
                      </button>
                    ))}
                  </div>
                  <div className="p-4">
                    {tab === 'zones' ? (
                      <ZonesTab
                        vi={vi}
                        api={api}
                        onCreated={() => {
                          showToast(vi ? 'Đã tạo khu.' : 'Zone created.')
                          setTab('bins')
                        }}
                      />
                    ) : null}
                    {tab === 'bins' ? (
                      <BinsTab
                        vi={vi}
                        api={api}
                        onGenerated={(created) =>
                          showToast(
                            vi
                              ? `Đã sinh ${created} kệ mới.`
                              : `Created ${created} new bins.`,
                          )
                        }
                        onPickBin={(binId) => {
                          setPickedBinId(binId)
                          setTab('assign')
                        }}
                      />
                    ) : null}
                    {tab === 'assign' ? (
                      <AssignTab
                        vi={vi}
                        api={api}
                        binId={pickedBinId}
                        onBinIdChange={setPickedBinId}
                        onAssigned={() =>
                          showToast(
                            vi
                              ? 'Đã gán SKU vào kệ.'
                              : 'SKU assigned to bin.',
                          )
                        }
                      />
                    ) : null}
                    {tab === 'stock' ? (
                      <StockTab
                        vi={vi}
                        api={api}
                        onRestocked={() =>
                          showToast(vi ? 'Đã nhập thêm hàng.' : 'Stock added.')
                        }
                      />
                    ) : null}
                    {tab === 'picking' ? (
                      <PickingTab vi={vi} warehouseId={api.selectedWarehouse.id} />
                    ) : null}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
      {toast ? (
        <AdminToast message={toast} onClose={() => setToast(null)} />
      ) : null}
    </>
  )
}

type Api = ReturnType<typeof useAdminWarehouse>

function WarehouseListPanel({
  vi,
  api,
  onCreated,
}: {
  vi: boolean
  api: Api
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  async function submit() {
    if (!code.trim() || !name.trim() || !address.trim()) return
    await api.createWarehouse({
      warehouse_code: code.trim(),
      warehouse_name: name.trim(),
      address: address.trim(),
    })
    setCode('')
    setName('')
    setAddress('')
    setOpen(false)
    onCreated()
  }

  return (
    <aside className="rounded-xl border border-hairline bg-surface-1">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {vi ? 'Kho' : '1. Warehouses'}
        </p>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-hover hover:bg-primary/10"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          {vi ? 'Tạo' : 'New'}
        </button>
      </div>

      {open ? (
        <form
          className="space-y-2 border-b border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            className={fieldClass}
            placeholder={vi ? 'Mã kho (WH-HCM-01)' : 'Code (WH-HCM-01)'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            className={fieldClass}
            placeholder={vi ? 'Tên kho' : 'Warehouse name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            className={fieldClass}
            placeholder={vi ? 'Địa chỉ' : 'Address'}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button
            type="submit"
            className="h-9 w-full text-xs"
            disabled={api.mutating || !code.trim() || !name.trim() || !address.trim()}
          >
            {api.mutating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {vi ? 'Lưu kho' : 'Save warehouse'}
          </Button>
        </form>
      ) : null}

      {api.loading && api.warehouses.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-6 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </div>
      ) : api.warehouses.length === 0 ? (
        <p className="px-3 py-6 text-xs text-ink-muted">
          {vi ? 'Chưa có kho. Bấm tạo để bắt đầu.' : 'No warehouses. Click New to start.'}
        </p>
      ) : (
        <ul className="max-h-[70vh] overflow-y-auto p-2">
          {api.warehouses.map((row) => {
            const active = row.id === api.selectedWarehouseId
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => api.selectWarehouse(row.id)}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                    active
                      ? 'bg-primary/15 text-primary-hover'
                      : 'hover:bg-surface-2',
                  )}
                >
                  <p className="truncate text-sm font-medium text-ink">
                    {row.warehouseName}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {row.warehouseCode}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function ZonesTab({
  vi,
  api,
  onCreated,
}: {
  vi: boolean
  api: Api
  onCreated: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function submit() {
    if (!code.trim() || !name.trim()) return
    await api.createZone({
      zone_code: code.trim(),
      zone_name: name.trim(),
      description: description.trim() || undefined,
    })
    setCode('')
    setName('')
    setDescription('')
    onCreated()
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          className={fieldClass}
          placeholder={vi ? 'Mã khu (A)' : 'Zone code (A)'}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Input
          className={fieldClass}
          placeholder={vi ? 'Tên khu' : 'Zone name'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          className={fieldClass}
          placeholder={vi ? 'Mô tả (tuỳ chọn)' : 'Description (optional)'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button
          type="submit"
          className="h-9 text-xs"
          disabled={api.mutating || !code.trim() || !name.trim()}
        >
          {vi ? 'Tạo khu' : 'Create zone'}
        </Button>
      </form>

      {api.zones.length === 0 ? (
        <EmptyHint
          icon={<Layers className="h-5 w-5" />}
          title={vi ? 'Chưa có khu' : 'No zones'}
          body={
            vi
              ? 'Mỗi kho chia thành khu A, khu B,…'
              : 'Split the warehouse into zones (A, B…). Create a zone before generating bins.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{vi ? 'Mã' : 'Code'}</TableHead>
              <TableHead>{vi ? 'Tên' : 'Name'}</TableHead>
              <TableHead>{vi ? 'Mô tả' : 'Description'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {api.zones.map((zone) => (
              <TableRow
                key={zone.id}
                className={cn(
                  'cursor-pointer',
                  zone.id === api.selectedZoneId ? 'bg-primary/10' : '',
                )}
                onClick={() => api.selectZone(zone.id)}
              >
                <TableCell className="font-medium text-ink">{zone.zoneCode}</TableCell>
                <TableCell>{zone.zoneName}</TableCell>
                <TableCell className="text-ink-muted">
                  {zone.description || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function BinsTab({
  vi,
  api,
  onGenerated,
  onPickBin,
}: {
  vi: boolean
  api: Api
  onGenerated: (created: number) => void
  onPickBin: (binId: string) => void
}) {
  const [aisle, setAisle] = useState('01')
  const [rackFrom, setRackFrom] = useState(1)
  const [rackTo, setRackTo] = useState(5)
  const [levelFrom, setLevelFrom] = useState(1)
  const [levelTo, setLevelTo] = useState(2)

  const previewCount = useMemo(() => {
    if (rackFrom > rackTo || levelFrom > levelTo) return 0
    return (rackTo - rackFrom + 1) * (levelTo - levelFrom + 1)
  }, [rackFrom, rackTo, levelFrom, levelTo])

  const exampleCode = api.selectedZone
    ? `${api.selectedZone.zoneCode}-${aisle || '01'}-${pad2(rackFrom)}-${pad2(levelFrom)}`
    : '—'

  async function submit() {
    const result = await api.generateBins({
      aisle: aisle.trim(),
      rack_from: rackFrom,
      rack_to: rackTo,
      level_from: levelFrom,
      level_to: levelTo,
    })
    onGenerated(result.created)
  }

  if (api.zones.length === 0 && api.allBins.length === 0) {
    return (
      <EmptyHint
        icon={<Boxes className="h-5 w-5" />}
        title={vi ? 'Cần tạo khu trước' : 'Create a zone first'}
        body={
          vi
            ? 'Sinh kệ theo dãy phải gắn vào 1 khu cụ thể'
            : 'Bulk bin generation is always scoped to one zone.'
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">{vi ? 'Khu đang chọn' : 'Selected zone'}</span>
        {api.zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => api.selectZone(zone.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              zone.id === api.selectedZoneId
                ? 'border-primary/40 bg-primary/15 text-primary-hover'
                : 'border-hairline text-ink-subtle hover:bg-surface-2',
            )}
          >
            {zone.zoneCode} · {zone.zoneName}
          </button>
        ))}
      </div>

      <form
        className="grid gap-2 sm:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Dãy (aisle)' : 'Aisle'}</span>
          <Input
            className={fieldClass}
            placeholder="03"
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Giá từ' : 'Rack from'}</span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            value={rackFrom}
            onChange={(e) => setRackFrom(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Giá đến' : 'Rack to'}</span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            value={rackTo}
            onChange={(e) => setRackTo(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Tầng từ' : 'Level from'}</span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            value={levelFrom}
            onChange={(e) => setLevelFrom(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Tầng đến' : 'Level to'}</span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            value={levelTo}
            onChange={(e) => setLevelTo(Number(e.target.value))}
          />
        </label>
        <Button
          type="submit"
          className="h-9 self-end text-xs"
          disabled={api.mutating || !aisle.trim() || previewCount <= 0}
        >
          {vi ? 'Sinh kệ' : 'Generate'}
        </Button>
      </form>
      <p className="text-[11px] leading-relaxed text-ink-muted">
        {vi
          ? `Giống siêu thị: 1 dãy (aisle) + khoảng giá đỡ × khoảng tầng. Ví dụ khu ${api.selectedZone?.zoneCode ?? 'A'}, dãy 03, giá 1→2, tầng 1→2 sẽ tạo 4 kệ: ${api.selectedZone?.zoneCode ?? 'A'}-03-01-01 … ${api.selectedZone?.zoneCode ?? 'A'}-03-02-02. Lần này sẽ tạo ${previewCount} kệ, mã đầu ${exampleCode}. Bấm lại cùng khoảng không tạo trùng.`
          : `Like a supermarket aisle: one aisle × rack range × level range. Example zone ${api.selectedZone?.zoneCode ?? 'A'}, aisle 03, racks 1–2, levels 1–2 → 4 bins. This run creates ${previewCount} bins, first code ${exampleCode}. Same range is idempotent.`}
      </p>

      {api.bins.length === 0 ? (
        <EmptyHint
          icon={<MapPin className="h-5 w-5" />}
          title={vi ? 'Khu này chưa có kệ' : 'This zone has no bins'}
          body={
            vi
              ? 'Sinh kệ bằng form phía trên. Nếu sau khi sinh bảng vẫn trống: BE main chưa có API GET danh sách kệ — sang tab Gán SKU và dán ObjectId kệ từ Mongo.'
              : 'Generate bins with the form above. If the table stays empty, main BE has no list-bins GET — use Assign SKU and paste the bin ObjectId.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>bin_code</TableHead>
              <TableHead>Aisle</TableHead>
              <TableHead>Rack</TableHead>
              <TableHead>Level</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {api.bins.map((bin) => (
              <TableRow
                key={bin.id}
                className="cursor-pointer"
                onClick={() => onPickBin(bin.id)}
              >
                <TableCell className="font-medium text-ink">{bin.binCode}</TableCell>
                <TableCell>{bin.aisle}</TableCell>
                <TableCell>{bin.rack}</TableCell>
                <TableCell>{bin.level}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function AssignTab({
  vi,
  api,
  binId,
  onBinIdChange,
  onAssigned,
}: {
  vi: boolean
  api: Api
  binId: string
  onBinIdChange: (id: string) => void
  onAssigned: () => void
}) {
  const [sku, setSku] = useState<UnassignedSku | null>(null)
  const [qty, setQty] = useState(0)

  const binsByZone = useMemo(() => {
    return api.zones.map((zone) => ({
      zone,
      bins: api.allBins.filter((bin) => bin.zoneId === zone.id),
    }))
  }, [api.zones, api.allBins])

  async function submit() {
    if (!sku || !binId) return
    await api.assignSku({
      platform: sku.platform,
      shop_id: sku.shop_id,
      seller_sku: sku.seller_sku,
      bin_location_id: binId,
      initial_quantity: qty > 0 ? qty : undefined,
    })
    setSku(null)
    setQty(0)
    onAssigned()
  }

  return (
    <div className="space-y-4">
      {api.unassigned.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {vi
            ? `${api.unassigned.length} SKU đã có trong catalog nhưng chưa gán kệ.`
            : `${api.unassigned.length} SKUs exist in catalog but have no bin.`}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-bg px-3 py-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {vi ? 'Mọi SKU trong catalog đã được gán kệ.' : 'Every catalog SKU has a bin.'}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="max-h-72 overflow-auto rounded-lg border border-hairline">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead>{vi ? 'Sàn' : 'Platform'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {api.unassigned.map((row) => {
                const key = `${row.platform}|${row.shop_id}|${row.seller_sku}`
                const selected =
                  sku?.seller_sku === row.seller_sku &&
                  sku.shop_id === row.shop_id &&
                  sku.platform === row.platform
                return (
                  <TableRow
                    key={key}
                    className={cn('cursor-pointer', selected ? 'bg-primary/10' : '')}
                    onClick={() => setSku(row)}
                  >
                    <TableCell className="font-medium text-ink">
                      {row.seller_sku}
                    </TableCell>
                    <TableCell className="text-ink-muted">{row.shop_id}</TableCell>
                    <TableCell>{row.platform}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {api.unassigned.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-ink-muted">
              {vi ? 'Không còn SKU chưa gán.' : 'No unassigned SKUs.'}
            </p>
          ) : null}
        </div>

        <form
          className="space-y-2 rounded-lg border border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <p className="text-xs font-medium text-ink">
            {sku
              ? sku.seller_sku
              : vi
                ? 'Chọn 1 SKU bên trái'
                : 'Select a SKU on the left'}
          </p>
          {sku ? (
            <p className="text-xs text-ink-muted">
              {vi
                ? `Sàn: ${sku.platform} (lấy từ catalog, không chọn tay)`
                : `Marketplace: ${sku.platform} (from catalog, not a picker)`}
            </p>
          ) : null}
          {api.allBins.length > 0 ? (
            <select
              className={fieldClass}
              value={binId}
              onChange={(e) => onBinIdChange(e.target.value)}
            >
              <option value="">
                {vi ? 'Chọn kệ…' : 'Choose bin…'}
              </option>
              {binsByZone.map(({ zone, bins }) => (
                <optgroup key={zone.id} label={`${zone.zoneCode} · ${zone.zoneName}`}>
                  {bins.map((bin) => (
                    <option key={bin.id} value={bin.id}>
                      {bin.binCode}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-ink-muted">
                {vi
                  ? 'BE hiện không trả danh sách kệ. Dán ObjectId kệ (Mongo) để gán — hoặc nhờ backend thêm GET /warehouse/zones/:zoneId/bin-locations.'
                  : 'Backend does not list bins yet. Paste a bin ObjectId, or ask backend for GET /warehouse/zones/:zoneId/bin-locations.'}
              </p>
              <Input
                className={fieldClass}
                value={binId}
                onChange={(e) => onBinIdChange(e.target.value.trim())}
                placeholder={vi ? 'ObjectId kệ' : 'Bin ObjectId'}
              />
            </>
          )}
          <Input
            className={fieldClass}
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            placeholder={vi ? 'Tồn ban đầu (0 = nhập sau)' : 'Initial qty (0 = restock later)'}
          />
          <Button
            type="submit"
            className="h-9 w-full text-xs"
            disabled={api.mutating || !sku || !binId}
          >
            <PackagePlus className="h-3.5 w-3.5" />
            {vi ? 'Gán vào kệ' : 'Assign to bin'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function StockTab({
  vi,
  api,
  onRestocked,
}: {
  vi: boolean
  api: Api
  onRestocked: () => void
}) {
  const [qtyById, setQtyById] = useState<Record<string, number>>({})

  async function submit(assignmentId: string) {
    const qty = qtyById[assignmentId] ?? 0
    if (qty < 1) return
    await api.restock(assignmentId, qty)
    setQtyById((prev) => ({ ...prev, [assignmentId]: 1 }))
    onRestocked()
  }

  if (api.assignments.length === 0) {
    return (
      <EmptyHint
        icon={<PackagePlus className="h-5 w-5" />}
        title={vi ? 'Chưa gán SKU nào' : 'No SKU assignments'}
        body={
          vi
            ? 'Gán SKU vào kệ trước, rồi mới nhập tồn'
            : 'Assign SKUs in step 4 first, then restock (adds quantity, never overwrites).'
        }
      />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>{vi ? 'Kệ' : 'Bin'}</TableHead>
          <TableHead>{vi ? 'Tồn hiện tại' : 'On hand'}</TableHead>
          <TableHead>{vi ? 'Nhập thêm' : 'Add qty'}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {api.assignments.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <p className="font-medium text-ink">{row.sellerSku}</p>
              <p className="text-[11px] text-ink-muted">
                {row.platform} · {row.shopId}
              </p>
            </TableCell>
            <TableCell>{row.binCode || row.binLocationId.slice(-8)}</TableCell>
            <TableCell>
              <Badge tone={row.quantityOnHand > 0 ? 'success' : 'warning'}>
                {row.quantityOnHand}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 w-20"
                  type="number"
                  min={1}
                  value={qtyById[row.id] ?? 1}
                  onChange={(e) =>
                    setQtyById((prev) => ({
                      ...prev,
                      [row.id]: Number(e.target.value),
                    }))
                  }
                />
                <Button
                  className="h-8 px-2.5 text-xs"
                  disabled={api.mutating}
                  onClick={() => void submit(row.id)}
                >
                  {vi ? 'Nhập' : 'Add'}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PickingTab({
  vi,
  warehouseId,
}: {
  vi: boolean
  warehouseId: string
}) {
  const [groupId, setGroupId] = useState('')
  const [items, setItems] = useState<WarehousePickingListItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!groupId.trim()) return
    setLoading(true)
    setError(null)
    try {
      setItems(await getWarehousePickingList(warehouseId, groupId.trim()))
    } catch (err: unknown) {
      setItems(null)
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        {vi
          ? 'Dùng để kiểm tra SKU, nếu chưa gán sẽ hiện “Chưa gán vị trí”.'
          : 'Preview the bin-sorted picking list (zone → bin_code). Unassigned SKUs show as “CHƯA GÁN VỊ TRÍ”.'}
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <Input
          className={cn(fieldClass, 'max-w-sm')}
          placeholder={vi ? 'Order group ID' : 'Order group ID'}
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        />
        <Button type="submit" className="h-9 text-xs" disabled={loading || !groupId.trim()}>
          <ScanLine className="h-3.5 w-3.5" />
          {vi ? 'Xem lộ trình' : 'Load route'}
        </Button>
      </form>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </div>
      ) : null}
      {items && items.length === 0 ? (
        <p className="text-xs text-ink-muted">
          {vi ? 'Nhóm đơn không còn hàng cần lấy.' : 'No packable items in this group.'}
        </p>
      ) : null}
      {items && items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Bin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.sku}-${item.bin_code}`}>
                <TableCell className="font-medium text-ink">{item.sku}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.zone_code}</TableCell>
                <TableCell>
                  {item.bin_code === 'Chưa gán vị trí' ? (
                    <Badge tone="warning">{item.bin_code}</Badge>
                  ) : (
                    item.bin_code
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  )
}

function EmptyHint({
  icon,
  title,
  body,
}: {
  icon: ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-hairline px-4 py-8 text-center">
      <div className="text-ink-tertiary">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-md text-xs text-ink-muted">{body}</p>
    </div>
  )
}
