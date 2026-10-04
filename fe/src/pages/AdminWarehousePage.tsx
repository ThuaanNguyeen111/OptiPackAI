import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import {
  createCategory,
  deactivateCategory,
  getWarehousePickingList,
  listCategories,
  listStockMovements,
  reactivateCategory,
  updateCategory,
} from '../api/warehouse.api'
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
import { formatApiError, getApiErrorCode } from '../lib/api'
import { AdminToast } from '../modules/admin/components/AdminToast'
import type {
  BinLocationRecord,
  CategoryRecord,
  InventoryMovementRecord,
  StockAdjustReason,
  UnassignedSku,
  WarehousePickingListItem,
  WarehouseZoneRecord,
} from '../types/warehouse-admin'

const rowActionClass =
  'inline-flex h-7 cursor-pointer items-center rounded-md border border-hairline bg-surface-1 px-2 text-[11px] font-medium text-ink transition-colors hover:bg-surface-2'
const rowOffClass =
  'inline-flex h-7 cursor-pointer items-center rounded-md border border-hairline bg-surface-1 px-2 text-[11px] font-medium text-ink transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-200'

const fieldClass =
  'w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

type TabId = 'zones' | 'categories' | 'bins' | 'assign' | 'stock' | 'picking'

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
    { id: 'categories', labelVi: 'Danh mục', labelEn: 'Categories' },
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
                      {api.selectedWarehouse.isActive
                        ? ''
                        : vi
                          ? ' · Đang tắt'
                          : ' · Inactive'}
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
                        onNotice={showToast}
                        onCreated={() => {
                          showToast(vi ? 'Đã tạo khu.' : 'Zone created.')
                          setTab('bins')
                        }}
                      />
                    ) : null}
                    {tab === 'categories' ? (
                      <CategoriesTab
                        vi={vi}
                        onNotice={showToast}
                        onReadyForBins={() => setTab('bins')}
                      />
                    ) : null}
                    {tab === 'bins' ? (
                      <BinsTab
                        vi={vi}
                        api={api}
                        onNotice={showToast}
                        onOpenCategories={() => setTab('categories')}
                        onGenerated={(created) =>
                          showToast(
                            vi
                              ? `Đã sinh ${created} kệ mới.`
                              : `Created ${created} new bins.`,
                          )
                        }
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
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')

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

      <label className="flex items-center gap-2 border-b border-hairline px-3 py-2 text-[11px] text-ink-muted">
        <input
          type="checkbox"
          checked={api.showInactive}
          onChange={(e) => api.setShowInactive(e.target.checked)}
        />
        {vi ? 'Hiện kho/khu/kệ đã tắt' : 'Show inactive'}
      </label>

      {api.selectedWarehouse ? (
        <div className="space-y-2 border-b border-hairline p-3">
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                void api
                  .updateWarehouse({
                    warehouse_name: editName.trim(),
                    address: editAddress.trim(),
                  })
                  .then(() => setEditing(false))
              }}
            >
              <Input
                className={fieldClass}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Input
                className={fieldClass}
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
              <Button type="submit" className="h-8 w-full text-xs" disabled={api.mutating}>
                {vi ? 'Lưu' : 'Save'}
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="rounded-md border border-hairline px-2 py-1 text-[11px] text-ink"
                onClick={() => {
                  setEditName(api.selectedWarehouse?.warehouseName ?? '')
                  setEditAddress(api.selectedWarehouse?.address ?? '')
                  setEditing(true)
                }}
              >
                {vi ? 'Chỉnh sửa' : 'Edit'}
              </button>
              <button
                type="button"
                className="rounded-md border border-hairline px-2 py-1 text-[11px] text-ink"
                disabled={api.mutating}
                onClick={() => {
                  const active = api.selectedWarehouse?.isActive === true
                  const ok = window.confirm(
                    active
                      ? vi
                        ? 'Tắt kho sẽ tắt luôn khu và kệ. Còn hàng thì hệ thống từ chối.'
                        : 'Deactivating the warehouse also deactivates its zones and bins.'
                      : vi
                        ? 'Bật lại chỉ kho. Khu và kệ vẫn tắt — bật lại từng khu cần dùng.'
                        : 'Reactivating only turns the warehouse back on.',
                  )
                  if (!ok) return
                  void api.setWarehouseActive(!active)
                }}
              >
                {api.selectedWarehouse.isActive
                  ? vi
                    ? 'Tắt kho'
                    : 'Deactivate'
                  : vi
                    ? 'Bật kho'
                    : 'Reactivate'}
              </button>
            </div>
          )}
        </div>
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
                    {row.isActive ? '' : vi ? ' · tắt' : ' · off'}
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
  onNotice,
}: {
  vi: boolean
  api: Api
  onCreated: () => void
  onNotice: (message: string) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editId, setEditId] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [ghosts, setGhosts] = useState<
    Array<{ zone: WarehouseZoneRecord; index: number }>
  >([])

  const rows = useMemo(() => {
    const list = [...api.zones]
    const pending = [...ghosts].sort((a, b) => b.index - a.index)
    for (const ghost of pending) {
      if (list.some((zone) => zone.id === ghost.zone.id)) continue
      list.splice(Math.min(ghost.index, list.length), 0, ghost.zone)
    }
    return list
  }, [api.zones, ghosts])

  function rememberOff(zone: WarehouseZoneRecord, index: number) {
    if (api.showInactive) return
    setGhosts((prev) => [
      ...prev.filter((ghost) => ghost.zone.id !== zone.id),
      { zone: { ...zone, isActive: false }, index },
    ])
  }

  async function toggleZone(zone: WarehouseZoneRecord, index: number) {
    if (zone.isActive) {
      rememberOff(zone, index)
      try {
        await api.setZoneActive(zone.id, false)
        onNotice(
          vi
            ? `Đã tắt khu ${zone.zoneCode} · ${zone.zoneName}`
            : `Deactivated zone ${zone.zoneCode}`,
        )
        window.setTimeout(() => {
          setGhosts((prev) => prev.filter((ghost) => ghost.zone.id !== zone.id))
        }, 2800)
      } catch {
        setGhosts((prev) => prev.filter((ghost) => ghost.zone.id !== zone.id))
      }
      return
    }
    setGhosts((prev) => prev.filter((ghost) => ghost.zone.id !== zone.id))
    await api.setZoneActive(zone.id, true)
    onNotice(
      vi ? `Đã bật lại khu ${zone.zoneCode}` : `Reactivated zone ${zone.zoneCode}`,
    )
  }

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
          placeholder={vi ? 'Mã khu (KA)' : 'Zone code (KA)'}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
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

      {rows.length === 0 ? (
        <EmptyHint
          icon={<Layers className="h-5 w-5" />}
          title={vi ? 'Chưa có khu' : 'No zones'}
          body={
            vi
              ? 'Mỗi kho chia thành khu A, khu B,… Tạo khu trước khi sinh kệ. Bấm Tải lại nếu khu vừa tạo chưa hiện.'
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
              <TableHead>{vi ? 'Trạng thái' : 'Status'}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((zone, index) => {
              const justOff = ghosts.some((ghost) => ghost.zone.id === zone.id)
              return (
              <TableRow
                key={zone.id}
                className={cn(
                  'cursor-pointer',
                  justOff
                    ? 'bg-amber-50 dark:bg-amber-950/30'
                    : zone.id === api.selectedZoneId
                      ? 'bg-primary/10'
                      : '',
                )}
                onClick={() => api.selectZone(zone.id)}
              >
                <TableCell className="font-medium text-ink">{zone.zoneCode}</TableCell>
                <TableCell>
                  {editId === zone.id ? (
                    <Input
                      className="h-8"
                      value={editName}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  ) : (
                    zone.zoneName
                  )}
                </TableCell>
                <TableCell className="text-ink-muted">
                  {editId === zone.id ? (
                    <Input
                      className="h-8"
                      value={editDescription}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  ) : (
                    zone.description || '—'
                  )}
                </TableCell>
                <TableCell>
                  {justOff ? (
                    <Badge tone="warning">{vi ? 'Vừa tắt' : 'Just off'}</Badge>
                  ) : (
                    <Badge tone={zone.isActive ? 'success' : 'warning'}>
                      {zone.isActive ? (vi ? 'Đang dùng' : 'Active') : vi ? 'Tắt' : 'Off'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {editId === zone.id ? (
                      <button
                        type="button"
                        className={rowActionClass}
                        onClick={() => {
                          void api
                            .updateZone(zone.id, {
                              zone_name: editName.trim(),
                              description: editDescription.trim(),
                            })
                            .then(() => setEditId(''))
                        }}
                      >
                        {vi ? 'Lưu' : 'Save'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={rowActionClass}
                        onClick={() => {
                          setEditId(zone.id)
                          setEditName(zone.zoneName)
                          setEditDescription(zone.description)
                        }}
                      >
                        {vi ? 'Sửa' : 'Edit'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={zone.isActive ? rowOffClass : rowActionClass}
                      onClick={() => void toggleZone(zone, index)}
                    >
                      {zone.isActive ? (vi ? 'Tắt' : 'Off') : vi ? 'Bật lại' : 'Turn on'}
                    </button>
                  </div>
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function parseSizeScale(raw: string): string[] {
  return [
    ...new Set(
      raw
        .toUpperCase()
        .split(/[,;\s]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ),
  ]
}

function sizesLookValid(sizes: string[]): boolean {
  return sizes.length > 0 && sizes.every((size) => /^[A-Z0-9.]{1,6}$/.test(size))
}

function CategoriesTab({
  vi,
  onNotice,
  onReadyForBins,
}: {
  vi: boolean
  onNotice: (message: string) => void
  onReadyForBins: () => void
}) {
  const [tree, setTree] = useState<CategoryRecord[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupCode, setGroupCode] = useState('')
  const [groupName, setGroupName] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [typeName, setTypeName] = useState('')
  const [parentCode, setParentCode] = useState('')
  const [sizeText, setSizeText] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editSizes, setEditSizes] = useState('')

  async function loadTree(includeInactive: boolean) {
    setLoading(true)
    try {
      setTree(await listCategories(includeInactive))
      setError(null)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void listCategories(showInactive)
      .then((rows) => {
        if (!cancelled) {
          setTree(rows)
          setError(null)
        }
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
  }, [showInactive])

  const groups = tree.filter((row) => row.level === 1 && (showInactive || row.isActive))

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onNotice(done)
      await loadTree(showInactive)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <form
        className="grid gap-2 rounded-lg border border-dashed border-hairline p-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          const code = groupCode.trim().toUpperCase()
          const name = groupName.trim()
          if (!/^[A-Z0-9]{2,12}$/.test(code) || name.length < 2) return
          void run(async () => {
            await createCategory({ code, name })
            setGroupCode('')
            setGroupName('')
          }, vi ? `Đã tạo nhóm ${code}.` : `Created group ${code}.`)
        }}
      >
        <p className="text-xs font-medium text-ink sm:col-span-3">
          {vi ? 'Nhóm' : 'Group — level 1'}
        </p>
        <Input
          className={fieldClass}
          placeholder={vi ? 'Mã, VD AO' : 'Code, e.g. AO'}
          value={groupCode}
          onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
        />
        <Input
          className={fieldClass}
          placeholder={vi ? 'Tên, VD Áo' : 'Name'}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <Button
          type="submit"
          className="h-9 text-xs"
          disabled={busy || !/^[A-Z0-9]{2,12}$/.test(groupCode.trim()) || groupName.trim().length < 2}
        >
          {vi ? 'Tạo nhóm' : 'Create group'}
        </Button>
      </form>

      <form
        className="grid gap-2 rounded-lg border border-dashed border-hairline p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          const code = typeCode.trim().toUpperCase()
          const name = typeName.trim()
          const sizes = parseSizeScale(sizeText)
          if (!/^[A-Z0-9]{2,12}$/.test(code) || name.length < 2 || !parentCode || !sizesLookValid(sizes)) {
            return
          }
          void run(async () => {
            await createCategory({
              code,
              name,
              parent_code: parentCode,
              size_scale: sizes,
            })
            setTypeCode('')
            setTypeName('')
            setSizeText('')
          }, vi ? `Đã tạo loại ${code}.` : `Created type ${code}.`)
        }}
      >
        <p className="text-xs font-medium text-ink sm:col-span-2">
          {vi ? 'Loại' : 'Type — level 2, used when creating a rack'}
        </p>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Nhóm' : 'Parent group'}</span>
          <select
            className={fieldClass}
            value={parentCode}
            onChange={(e) => setParentCode(e.target.value)}
          >
            <option value="">{vi ? 'Chọn nhóm' : 'Choose group'}</option>
            {groups
              .filter((row) => row.isActive)
              .map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name}
                </option>
              ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Mã loại' : 'Type code'}</span>
          <Input
            className={fieldClass}
            placeholder="ATHUN"
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Tên' : 'Name'}</span>
          <Input
            className={fieldClass}
            placeholder={vi ? 'Áo thun' : 'T-shirt'}
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Size' : 'Sizes, comma-separated'}
          </span>
          <Input
            className={fieldClass}
            placeholder="S, M, L, XL"
            value={sizeText}
            onChange={(e) => setSizeText(e.target.value.toUpperCase())}
          />
        </label>
        <Button
          type="submit"
          className="h-9 text-xs sm:col-span-2 sm:justify-self-start"
          disabled={
            busy ||
            groups.filter((row) => row.isActive).length === 0 ||
            !parentCode ||
            !/^[A-Z0-9]{2,12}$/.test(typeCode.trim()) ||
            typeName.trim().length < 2 ||
            !sizesLookValid(parseSizeScale(sizeText))
          }
        >
          {vi ? 'Tạo loại' : 'Create type'}
        </Button>
      </form>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        {vi ? 'Hiện danh mục đã tắt' : 'Show inactive categories'}
      </label>

      {loading ? (
        <p className="text-xs text-ink-muted">{vi ? 'Đang tải danh mục…' : 'Loading categories…'}</p>
      ) : tree.length === 0 ? (
        <EmptyHint
          icon={<Layers className="h-5 w-5" />}
          title={vi ? 'Chưa có danh mục' : 'No categories'}
          body={
            vi
              ? 'Tạo nhóm và loại sản phẩm.'
              : 'Create a group, then a type with sizes, then open the bins tab.'
          }
        />
      ) : (
        <div className="space-y-3">
          {tree.map((group) => (
            <div key={group.code} className="rounded-lg border border-hairline">
              <CategoryRow
                vi={vi}
                row={group}
                busy={busy}
                editing={editCode === group.code}
                editName={editName}
                editSizes={editSizes}
                onEditName={setEditName}
                onEditSizes={setEditSizes}
                onStartEdit={() => {
                  setEditCode(group.code)
                  setEditName(group.name)
                  setEditSizes(group.sizeScale.join(', '))
                }}
                onCancel={() => setEditCode('')}
                onSave={() => {
                  const name = editName.trim()
                  if (name.length < 2) return
                  void run(async () => {
                    await updateCategory(group.code, { name })
                    setEditCode('')
                  }, vi ? `Đã sửa nhóm ${group.code}.` : `Updated ${group.code}.`)
                }}
                onToggle={() => {
                  void run(
                    async () => {
                      if (group.isActive) await deactivateCategory(group.code)
                      else await reactivateCategory(group.code)
                    },
                    group.isActive
                      ? vi
                        ? `Đã tắt nhóm ${group.code}.`
                        : `Deactivated ${group.code}.`
                      : vi
                        ? `Đã bật lại nhóm ${group.code}.`
                        : `Reactivated ${group.code}.`,
                  )
                }}
              />
              {(group.children ?? []).length > 0 ? (
                <div className="border-t border-hairline">
                  {(group.children ?? []).map((child) => (
                    <CategoryRow
                      key={child.code}
                      vi={vi}
                      row={child}
                      busy={busy}
                      nested
                      editing={editCode === child.code}
                      editName={editName}
                      editSizes={editSizes}
                      onEditName={setEditName}
                      onEditSizes={setEditSizes}
                      onStartEdit={() => {
                        setEditCode(child.code)
                        setEditName(child.name)
                        setEditSizes(child.sizeScale.join(', '))
                      }}
                      onCancel={() => setEditCode('')}
                      onSave={() => {
                        const name = editName.trim()
                        const sizes = parseSizeScale(editSizes)
                        if (name.length < 2 || !sizesLookValid(sizes)) return
                        void run(async () => {
                          await updateCategory(child.code, { name, size_scale: sizes })
                          setEditCode('')
                        }, vi ? `Đã sửa loại ${child.code}.` : `Updated ${child.code}.`)
                      }}
                      onToggle={() => {
                        void run(
                          async () => {
                            if (child.isActive) await deactivateCategory(child.code)
                            else await reactivateCategory(child.code)
                          },
                          child.isActive
                            ? vi
                              ? `Đã tắt loại ${child.code}.`
                              : `Deactivated ${child.code}.`
                            : vi
                              ? `Đã bật lại loại ${child.code}.`
                              : `Reactivated ${child.code}.`,
                        )
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={onReadyForBins}>
            {vi ? 'Sang tab Kệ' : 'Open bins'}
          </Button>
        </div>
      )}
    </div>
  )
}

function CategoryRow({
  vi,
  row,
  busy,
  nested = false,
  editing,
  editName,
  editSizes,
  onEditName,
  onEditSizes,
  onStartEdit,
  onCancel,
  onSave,
  onToggle,
}: {
  vi: boolean
  row: CategoryRecord
  busy: boolean
  nested?: boolean
  editing: boolean
  editName: string
  editSizes: string
  onEditName: (value: string) => void
  onEditSizes: (value: string) => void
  onStartEdit: () => void
  onCancel: () => void
  onSave: () => void
  onToggle: () => void
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 px-3 py-2', nested ? 'bg-surface-2/40 pl-6' : '')}>
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium text-ink">
          {row.code}
          <span className="ml-2 text-[11px] font-normal text-ink-muted">
            {row.level === 1 ? (vi ? 'Nhóm' : 'Group') : vi ? 'Loại' : 'Type'}
            {row.isActive ? '' : vi ? ' · Tắt' : ' · Off'}
          </span>
        </p>
        {editing ? (
          <div className="mt-1 flex flex-wrap gap-2">
            <Input className="h-8 w-40" value={editName} onChange={(e) => onEditName(e.target.value)} />
            {row.level === 2 ? (
              <Input
                className="h-8 w-56"
                value={editSizes}
                placeholder="S, M, L"
                onChange={(e) => onEditSizes(e.target.value.toUpperCase())}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            {row.name}
            {row.level === 2 ? ` · ${row.sizeScale.join(', ') || '—'}` : ''}
          </p>
        )}
      </div>
      {editing ? (
        <>
          <button type="button" className={rowActionClass} disabled={busy} onClick={onSave}>
            {vi ? 'Lưu' : 'Save'}
          </button>
          <button type="button" className={rowActionClass} onClick={onCancel}>
            {vi ? 'Huỷ' : 'Cancel'}
          </button>
        </>
      ) : (
        <button type="button" className={rowActionClass} disabled={busy} onClick={onStartEdit}>
          {vi ? 'Sửa' : 'Edit'}
        </button>
      )}
      <button
        type="button"
        className={row.isActive ? rowOffClass : rowActionClass}
        disabled={busy}
        onClick={onToggle}
      >
        {row.isActive ? (vi ? 'Tắt' : 'Off') : vi ? 'Bật lại' : 'Turn on'}
      </button>
    </div>
  )
}

function BinsTab({
  vi,
  api,
  onGenerated,
  onNotice,
  onOpenCategories,
}: {
  vi: boolean
  api: Api
  onGenerated: (created: number) => void
  onNotice: (message: string) => void
  onOpenCategories: () => void
}) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [rackAisle, setRackAisle] = useState('D1')
  const [rackSide, setRackSide] = useState<'T' | 'P'>('P')
  const [rackBay, setRackBay] = useState(1)
  const [rackCells, setRackCells] = useState(3)
  const [rackCapacity, setRackCapacity] = useState('')
  const [rackCategory, setRackCategory] = useState('')
  const [tierSizes, setTierSizes] = useState<string[]>([''])
  const [binGhosts, setBinGhosts] = useState<
    Array<{ bin: BinLocationRecord; index: number }>
  >([])

  useEffect(() => {
    let cancelled = false
    void listCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows)
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const level2Categories = useMemo(
    () =>
      categories.flatMap((root) =>
        (root.children ?? []).filter(
          (child) => child.isActive && child.level === 2 && child.sizeScale.length > 0,
        ),
      ),
    [categories],
  )
  const selectedCategory = level2Categories.find((row) => row.code === rackCategory)
  const sizeScale = selectedCategory?.sizeScale ?? []
  const tiersReady =
    Boolean(selectedCategory) &&
    tierSizes.length >= 1 &&
    tierSizes.length <= 9 &&
    tierSizes.every((size) => sizeScale.includes(size))

  /** Gộp assignment đã tải theo ô — 1 ô có thể chứa nhiều SKU. */
  const assignmentByBinId = useMemo(() => {
    const map = new Map<
      string,
      { sellerSku: string; quantityOnHand: number; extra: number }
    >()
    for (const row of api.assignments) {
      if (!row.binLocationId) continue
      const current = map.get(row.binLocationId)
      if (!current) {
        map.set(row.binLocationId, {
          sellerSku: row.sellerSku,
          quantityOnHand: row.quantityOnHand,
          extra: 0,
        })
      } else {
        current.quantityOnHand += row.quantityOnHand
        current.extra += 1
      }
    }
    return map
  }, [api.assignments])

  const binRows = useMemo(() => {
    const list = [...api.bins]
    const pending = [...binGhosts].sort((a, b) => b.index - a.index)
    for (const ghost of pending) {
      if (list.some((bin) => bin.id === ghost.bin.id)) continue
      list.splice(Math.min(ghost.index, list.length), 0, ghost.bin)
    }
    return list
  }, [api.bins, binGhosts])

  function rememberBinOff(bin: BinLocationRecord, index: number) {
    if (api.showInactive) return
    setBinGhosts((prev) => [
      ...prev.filter((ghost) => ghost.bin.id !== bin.id),
      { bin: { ...bin, isActive: false }, index },
    ])
  }

  async function toggleBin(bin: BinLocationRecord, index: number) {
    if (bin.isActive) {
      rememberBinOff(bin, index)
      try {
        await api.setBinActive(bin.id, false)
        onNotice(vi ? `Đã tắt kệ ${bin.binCode}` : `Deactivated bin ${bin.binCode}`)
        window.setTimeout(() => {
          setBinGhosts((prev) => prev.filter((ghost) => ghost.bin.id !== bin.id))
        }, 2800)
      } catch {
        setBinGhosts((prev) => prev.filter((ghost) => ghost.bin.id !== bin.id))
      }
      return
    }
    setBinGhosts((prev) => prev.filter((ghost) => ghost.bin.id !== bin.id))
    await api.setBinActive(bin.id, true)
    onNotice(vi ? `Đã bật lại kệ ${bin.binCode}` : `Reactivated bin ${bin.binCode}`)
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
            onClick={() => {
              setBinGhosts([])
              api.selectZone(zone.id)
            }}
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
        className="grid gap-2 rounded-lg border border-dashed border-hairline p-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          const cellCount = Math.trunc(rackCells)
          if (!selectedCategory || !tiersReady || cellCount < 1 || cellCount > 9) return
          const tiers = tierSizes.map((size, index) => ({ tier: index + 1, size }))
          void api
            .createRack({
              aisle: rackAisle.trim(),
              side: rackSide,
              bay: rackBay,
              category_code: selectedCategory.code,
              tiers,
              cells_per_tier: cellCount,
              ...(rackCapacity.trim()
                ? { capacity_per_cell: Number(rackCapacity) }
                : {}),
            })
            .then((created) => onGenerated(created))
        }}
      >
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Dãy' : 'Aisle'}</span>
          <Input
            className={fieldClass}
            placeholder="D1"
            value={rackAisle}
            onChange={(e) => setRackAisle(e.target.value.toUpperCase())}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Bên' : 'Side'}</span>
          <select
            className={fieldClass}
            value={rackSide}
            onChange={(e) => setRackSide(e.target.value === 'T' ? 'T' : 'P')}
          >
            <option value="T">{vi ? 'Trái (T)' : 'Left (T)'}</option>
            <option value="P">{vi ? 'Phải (P)' : 'Right (P)'}</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Số kệ trên dãy' : 'Bay on the aisle'}
          </span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            value={rackBay}
            onChange={(e) => setRackBay(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Loại hàng' : 'Product type (level-2 category)'}
          </span>
          {level2Categories.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-ink-muted">
                {vi
                  ? 'Chưa có loại hàng.'
                  : 'No product type yet. Create one on the Categories tab.'}
              </p>
              <button type="button" className={rowActionClass} onClick={onOpenCategories}>
                {vi ? 'Mở danh mục' : 'Open categories'}
              </button>
            </div>
          ) : (
            <select
              className={fieldClass}
              value={rackCategory}
              onChange={(e) => {
                setRackCategory(e.target.value)
                setTierSizes([''])
              }}
            >
              <option value="">{vi ? 'Chọn loại' : 'Choose type'}</option>
              {level2Categories.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name} ({row.sizeScale.join(', ')})
                </option>
              ))}
            </select>
          )}
        </label>
        {selectedCategory ? (
          <div className="space-y-2 sm:col-span-3">
            {tierSizes.map((size, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-16 text-xs text-ink">
                  {vi ? `Tầng ${index + 1}` : `Tier ${index + 1}`}
                </span>
                <select
                  className={fieldClass}
                  value={size}
                  onChange={(e) => {
                    const next = [...tierSizes]
                    next[index] = e.target.value
                    setTierSizes(next)
                  }}
                >
                  <option value="">{vi ? 'Chọn size' : 'Choose size'}</option>
                  {sizeScale.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {tierSizes.length > 1 ? (
                  <button
                    type="button"
                    className={rowActionClass}
                    onClick={() => setTierSizes(tierSizes.filter((_, item) => item !== index))}
                  >
                    {vi ? 'Bỏ' : 'Remove'}
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className={rowActionClass}
              disabled={tierSizes.length >= 9}
              onClick={() => setTierSizes([...tierSizes, ''])}
            >
              {vi ? 'Thêm tầng' : 'Add tier'}
            </button>
          </div>
        ) : null}
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Số ô mỗi tầng' : 'Cells per tier'}
          </span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            max={9}
            value={rackCells}
            onChange={(e) => setRackCells(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Sức chứa mỗi ô' : 'Capacity per cell'}
          </span>
          <Input
            className={fieldClass}
            type="number"
            min={1}
            placeholder={vi ? 'Không giới hạn' : 'No limit'}
            value={rackCapacity}
            onChange={(e) => setRackCapacity(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          className="h-9 self-end text-xs"
          disabled={
            api.mutating ||
            !/^D([1-9][0-9]?)$/.test(rackAisle) ||
            rackBay < 1 ||
            rackCells < 1 ||
            rackCells > 9 ||
            !tiersReady
          }
        >
          {vi ? 'Tạo kệ mới' : 'Create new rack'}
        </Button>
      </form>

      {binRows.length === 0 ? (
        <EmptyHint
          icon={<MapPin className="h-5 w-5" />}
          title={vi ? 'Khu này chưa có kệ' : 'This zone has no bins'}
          body={
            vi
              ? 'Chọn khu rồi điền thông tin và bấm Tạo kệ'
              : 'Select a zone, fill aisle / rack / level, then Generate. The list stays after reload.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{vi ? 'Mã kệ' : 'Bin code'}</TableHead>
              <TableHead>{vi ? 'Đăng ký' : 'Designation'}</TableHead>
              <TableHead>{vi ? 'Sức chứa' : 'Capacity'}</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>{vi ? 'Số lượng' : 'Qty'}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {binRows.map((bin, index) => {
              const stock = assignmentByBinId.get(bin.id)
              const justOff = binGhosts.some((ghost) => ghost.bin.id === bin.id)
              return (
                <TableRow
                  key={bin.id}
                  className={justOff ? 'bg-amber-50 dark:bg-amber-950/30' : undefined}
                >
                  <TableCell className="font-medium text-ink">
                    {bin.binCode}
                    {justOff ? (
                      <span className="ml-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                        {vi ? 'vừa tắt' : 'just off'}
                      </span>
                    ) : !bin.isActive ? (
                      <span className="ml-1 text-[11px] text-ink-muted">
                        {vi ? 'tắt' : 'off'}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-[11px] text-ink-muted">
                    {bin.layoutVersion === 2
                      ? `${bin.designated?.categoryCode ?? '—'} · ${bin.designated?.size ?? '—'} · ${bin.designated?.colorCode ?? '—'}`
                      : vi
                        ? 'Kệ cũ'
                        : 'Legacy'}
                  </TableCell>
                  <TableCell>{bin.capacity ?? '—'}</TableCell>
                  <TableCell>
                    {stock ? (
                      <span className="font-medium text-ink">
                        {stock.sellerSku}
                        {stock.extra > 0 ? ` +${stock.extra}` : ''}
                      </span>
                    ) : (
                      <span className="text-ink-muted">
                        {vi ? 'Chưa gán' : 'Unassigned'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {stock ? (
                      <Badge tone={stock.quantityOnHand > 0 ? 'success' : 'warning'}>
                        {stock.quantityOnHand}
                      </Badge>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className={bin.isActive ? rowOffClass : rowActionClass}
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleBin(bin, index)
                      }}
                    >
                      {bin.isActive ? (vi ? 'Tắt' : 'Off') : vi ? 'Bật lại' : 'Turn on'}
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}
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
    const grouped = api.zones.map((zone) => ({
      zone,
      bins: api.allBins.filter((bin) => bin.zoneId === zone.id),
    }))
    const knownZoneIds = new Set(api.zones.map((zone) => zone.id))
    const leftover = api.allBins.filter((bin) => !knownZoneIds.has(bin.zoneId))
    return { grouped, leftover }
  }, [api.zones, api.allBins])

  async function submit(force = false) {
    if (!sku || !binId) return
    try {
      await api.assignSku({
        platform: sku.platform,
        shop_id: sku.shop_id,
        seller_sku: sku.seller_sku,
        bin_location_id: binId,
        initial_quantity: qty > 0 ? qty : undefined,
        force,
      })
      setSku(null)
      setQty(0)
      onAssigned()
    } catch (err: unknown) {
      if (!force && getApiErrorCode(err) === 'WH_BIN_OVER_CAPACITY') {
        const ok = window.confirm(
          `${formatApiError(err)}\n\n${vi ? 'Vẫn xếp vào ô này?' : 'Assign anyway?'}`,
        )
        if (ok) await submit(true)
      }
    }
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
                ? `Sàn: ${sku.platform}`
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
              {binsByZone.grouped.map(({ zone, bins }) =>
                bins.length === 0 ? null : (
                  <optgroup key={zone.id} label={`${zone.zoneCode} · ${zone.zoneName}`}>
                    {bins.map((bin) => {
                      const stock = api.assignments.find(
                        (row) => row.binLocationId === bin.id,
                      )
                      const stockLabel = stock
                        ? ` · ${stock.sellerSku} × ${stock.quantityOnHand}`
                        : ''
                      return (
                        <option key={bin.id} value={bin.id}>
                          {bin.binCode}
                          {stockLabel}
                        </option>
                      )
                    })}
                  </optgroup>
                ),
              )}
              {binsByZone.leftover.length > 0 ? (
                <optgroup label={vi ? 'Kệ khác' : 'Other bins'}>
                  {binsByZone.leftover.map((bin) => {
                    const stock = api.assignments.find(
                      (row) => row.binLocationId === bin.id,
                    )
                    const stockLabel = stock
                      ? ` · ${stock.sellerSku} × ${stock.quantityOnHand}`
                      : ''
                    return (
                      <option key={bin.id} value={bin.id}>
                        {bin.binCode || bin.id}
                        {stockLabel}
                      </option>
                    )
                  })}
                </optgroup>
              ) : null}
            </select>
          ) : (
            <p className="rounded-md border border-dashed border-hairline px-3 py-2 text-xs text-ink-muted">
              {vi
                ? 'Chưa có kệ. Mở tab Kệ, chọn khu, bấm Sinh kệ — rồi chọn mã kệ trong danh sách này.'
                : 'No bins yet. Open the Bins tab, pick a zone, generate bins, then choose a bin_code here.'}
            </p>
          )}
          <Input
            className={fieldClass}
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            placeholder={vi ? 'Tồn ban đầu' : 'Initial qty (0 = restock later)'}
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
  const [countedById, setCountedById] = useState<Record<string, number>>({})
  const [reasonById, setReasonById] = useState<Record<string, StockAdjustReason>>({})
  const [noteById, setNoteById] = useState<Record<string, string>>({})
  const [transferBinById, setTransferBinById] = useState<Record<string, string>>({})
  const [transferQtyById, setTransferQtyById] = useState<Record<string, number>>({})
  const [ledgerId, setLedgerId] = useState('')
  const [movements, setMovements] = useState<InventoryMovementRecord[]>([])

  async function submit(assignmentId: string, force = false) {
    const qty = qtyById[assignmentId] ?? 0
    if (qty < 1) return
    try {
      await api.restock(assignmentId, qty, force)
      setQtyById((prev) => ({ ...prev, [assignmentId]: 1 }))
      onRestocked()
    } catch (err: unknown) {
      if (!force && getApiErrorCode(err) === 'WH_BIN_OVER_CAPACITY') {
        const ok = window.confirm(
          `${formatApiError(err)}\n\n${vi ? 'Vẫn nhập?' : 'Receive anyway?'}`,
        )
        if (ok) await submit(assignmentId, true)
      }
    }
  }

  async function openLedger(assignmentId: string) {
    if (!api.selectedWarehouse) return
    if (ledgerId === assignmentId) {
      setLedgerId('')
      return
    }
    setMovements(
      await listStockMovements(api.selectedWarehouse.id, assignmentId),
    )
    setLedgerId(assignmentId)
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
          <TableHead>{vi ? 'Nhập/kiểm kê/chuyển' : 'Receive / count / move'}</TableHead>
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
              {row.masterSku ? (
                <p className="text-[11px] font-medium text-primary-hover">
                  {vi ? 'Tồn chung' : 'Pooled'}: {row.masterSku}
                </p>
              ) : null}
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  className="h-8 w-16"
                  type="number"
                  min={0}
                  value={countedById[row.id] ?? row.quantityOnHand}
                  onChange={(e) =>
                    setCountedById((prev) => ({
                      ...prev,
                      [row.id]: Number(e.target.value),
                    }))
                  }
                />
                <select
                  className="h-8 rounded-md border border-hairline bg-surface-1 px-2 text-xs"
                  value={reasonById[row.id] ?? 'count_correction'}
                  onChange={(e) =>
                    setReasonById((prev) => ({
                      ...prev,
                      [row.id]: e.target.value as StockAdjustReason,
                    }))
                  }
                >
                  <option value="count_correction">{vi ? 'Đếm lại' : 'Recount'}</option>
                  <option value="damaged">{vi ? 'Hư' : 'Damaged'}</option>
                  <option value="lost">{vi ? 'Mất' : 'Lost'}</option>
                  <option value="found">{vi ? 'Tìm thấy' : 'Found'}</option>
                  <option value="other">{vi ? 'Khác' : 'Other'}</option>
                </select>
                <Input
                  className="h-8 w-28"
                  placeholder={vi ? 'Ghi chú' : 'Note'}
                  value={noteById[row.id] ?? ''}
                  onChange={(e) =>
                    setNoteById((prev) => ({ ...prev, [row.id]: e.target.value }))
                  }
                />
                <Button
                  variant="secondary"
                  className="h-8 px-2.5 text-xs"
                  disabled={api.mutating}
                  onClick={() =>
                    void api.adjustStock(row.id, {
                      counted_quantity: countedById[row.id] ?? row.quantityOnHand,
                      reason_code: reasonById[row.id] ?? 'count_correction',
                      note: noteById[row.id]?.trim() || undefined,
                    })
                  }
                >
                  {vi ? 'Kiểm kê' : 'Count'}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="h-8 max-w-[180px] rounded-md border border-hairline bg-surface-1 px-2 text-xs"
                  value={transferBinById[row.id] ?? ''}
                  onChange={(e) =>
                    setTransferBinById((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                >
                  <option value="">{vi ? 'Ô đích' : 'Destination bin'}</option>
                  {api.allBins
                    .filter((bin) => bin.id !== row.binLocationId && bin.isActive)
                    .map((bin) => (
                      <option key={bin.id} value={bin.id}>
                        {bin.binCode}
                      </option>
                    ))}
                </select>
                <Input
                  className="h-8 w-16"
                  type="number"
                  min={1}
                  value={transferQtyById[row.id] ?? 1}
                  onChange={(e) =>
                    setTransferQtyById((prev) => ({
                      ...prev,
                      [row.id]: Number(e.target.value),
                    }))
                  }
                />
                <Button
                  variant="secondary"
                  className="h-8 px-2.5 text-xs"
                  disabled={api.mutating || !transferBinById[row.id]}
                  onClick={() => {
                    const input = {
                      to_bin_location_id: transferBinById[row.id] ?? '',
                      quantity: transferQtyById[row.id] ?? 1,
                    }
                    void api.transferStock(row.id, input).catch((err: unknown) => {
                      if (getApiErrorCode(err) !== 'WH_BIN_OVER_CAPACITY') return
                      const ok = window.confirm(
                        `${formatApiError(err)}\n\n${vi ? 'Vẫn chuyển?' : 'Move anyway?'}`,
                      )
                      if (ok) void api.transferStock(row.id, { ...input, force: true })
                    })
                  }}
                >
                  {vi ? 'Chuyển ô' : 'Move'}
                </Button>
                <button
                  type="button"
                  className="text-[11px] text-primary-hover"
                  onClick={() => void openLedger(row.id)}
                >
                  {vi ? 'Sổ cái' : 'Ledger'}
                </button>
                {row.quantityOnHand === 0 ? (
                  <button
                    type="button"
                    className="text-[11px] text-ink-muted"
                    onClick={() => void api.unassignSku(row.id)}
                  >
                    {vi ? 'Bỏ gán' : 'Unassign'}
                  </button>
                ) : null}
              </div>
              {ledgerId === row.id ? (
                <ul className="mt-2 space-y-1 text-[11px] text-ink-muted">
                  {movements.length === 0 ? (
                    <li>{vi ? 'Chưa có dòng sổ.' : 'No movements yet.'}</li>
                  ) : (
                    movements.map((move) => (
                      <li key={move.id}>
                        {move.type}
                        {move.refType === 'sku_merge' || move.type === 'sku_merge'
                          ? vi
                            ? ' · Gộp tồn'
                            : ' · Stock merge'
                          : ''}
                        {move.masterSku ? ` · ${move.masterSku}` : ''} · {move.delta > 0 ? '+' : ''}
                        {move.delta} ({move.quantityBefore}→{move.quantityAfter})
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
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
              <TableHead>{vi ? 'Ô khác' : 'Other bins'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.sku}-${item.bin_code}`}>
                <TableCell className="font-medium text-ink">
                  {item.sku}
                  {item.master_sku ? (
                    <p className="text-[11px] text-primary-hover">{item.master_sku}</p>
                  ) : null}
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.zone_code}</TableCell>
                <TableCell>
                  {item.bin_code === 'CHƯA GÁN VỊ TRÍ' || item.bin_code === 'Chưa gán vị trí' ? (
                    <Badge tone="warning">{item.bin_code}</Badge>
                  ) : (
                    item.bin_code
                  )}
                </TableCell>
                <TableCell className="text-[11px] text-ink-muted">
                  {item.other_bins.length === 0
                    ? '—'
                    : item.other_bins
                        .map((bin) => `${bin.bin_code} (${bin.quantity_on_hand})`)
                        .join(', ')}
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
