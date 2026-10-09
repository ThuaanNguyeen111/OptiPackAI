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
  Search,
  X,
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
import { listColors, type ColorRecord } from '../api/catalog.api'
import { useAdminWarehouse } from '../hooks/useAdminWarehouse'
import {
  ColorsTab,
  LinkSkuTab,
  MasterSkuTab,
  ReconcileTab,
} from './admin-warehouse/CatalogPanels'
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

const stockActionLabelClass = 'w-16 shrink-0 text-[11px] text-ink-muted'

const formCardClass = 'rounded-lg border border-hairline bg-surface-2/40 p-3'

const fieldClass =
  'w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

type AreaId = 'catalog' | 'warehouse'
type CatalogTabId = 'categories' | 'master' | 'link'
type WarehouseTabId = 'layout' | 'assign' | 'stock' | 'picking'

export function AdminWarehousePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const api = useAdminWarehouse()
  const [area, setArea] = useState<AreaId>('catalog')
  const [catalogTab, setCatalogTab] = useState<CatalogTabId>('categories')
  const [warehouseTab, setWarehouseTab] = useState<WarehouseTabId>('layout')
  const [toast, setToast] = useState<string | null>(null)
  const [pickedBinId, setPickedBinId] = useState('')

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  function openCatalog(next: CatalogTabId) {
    setArea('catalog')
    setCatalogTab(next)
  }

  function openWarehouse(next: WarehouseTabId) {
    setArea('warehouse')
    setWarehouseTab(next)
  }

  const catalogTabs: Array<{ id: CatalogTabId; labelVi: string; labelEn: string }> = [
    { id: 'categories', labelVi: 'Danh mục & màu', labelEn: 'Categories & colors' },
    { id: 'master', labelVi: 'SKU nội bộ', labelEn: 'Internal SKUs' },
    { id: 'link', labelVi: 'Nối SKU Lazada', labelEn: 'Map Lazada SKUs' },
  ]

  const warehouseTabs: Array<{ id: WarehouseTabId; labelVi: string; labelEn: string }> = [
    { id: 'layout', labelVi: 'Khu & kệ', labelEn: 'Zones & racks' },
    { id: 'assign', labelVi: 'Gán SKU vào ô', labelEn: 'Assign to bin' },
    { id: 'stock', labelVi: 'Tồn kho', labelEn: 'Stock' },
    { id: 'picking', labelVi: 'Lộ trình lấy', labelEn: 'Picking route' },
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Cấu hình kho' : 'Warehouse configuration'}
            </h1>
            <div className="inline-flex rounded-lg border border-hairline bg-surface-1 p-1">
              {(
                [
                  { id: 'catalog', labelVi: 'Sản phẩm', labelEn: 'Products' },
                  { id: 'warehouse', labelVi: 'Kho hàng', labelEn: 'Warehouses' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setArea(item.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    area === item.id
                      ? 'bg-primary/15 text-primary-hover'
                      : 'text-ink-subtle hover:text-ink',
                  )}
                >
                  {vi ? item.labelVi : item.labelEn}
                </button>
              ))}
            </div>
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

          {area === 'catalog' ? (
            <section className="rounded-xl border border-hairline bg-surface-1">
              <div className="border-b border-hairline px-4 py-3">
                <p className="text-sm font-semibold text-ink">
                  {vi ? 'Sản phẩm' : 'Products — shared by every warehouse'}
                </p>
              </div>
              <TabBar
                tabs={catalogTabs}
                active={catalogTab}
                vi={vi}
                onChange={setCatalogTab}
              />
              <div className="p-4">
                {catalogTab === 'categories' ? (
                  <div className="space-y-6">
                    <PanelSection title={vi ? 'Danh mục' : 'Categories'}>
                      <CategoriesTab
                        vi={vi}
                        onNotice={showToast}
                        onReadyForBins={() => openWarehouse('layout')}
                      />
                    </PanelSection>
                    <PanelSection title={vi ? 'Màu' : 'Colors'}>
                      <ColorsTab vi={vi} onNotice={showToast} />
                    </PanelSection>
                  </div>
                ) : null}
                {catalogTab === 'master' ? <MasterSkuTab vi={vi} onNotice={showToast} /> : null}
                {catalogTab === 'link' ? (
                  <div className="space-y-6">
                    <PanelSection title={vi ? 'Đồng bộ và nối SKU sàn' : 'Sync and map seller SKUs'}>
                      <LinkSkuTab vi={vi} onNotice={showToast} />
                    </PanelSection>
                    <PanelSection title={vi ? 'Gộp tồn' : 'Pool stock'}>
                      <ReconcileTab vi={vi} onNotice={showToast} />
                    </PanelSection>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <WarehouseListPanel
                vi={vi}
                api={api}
                onCreated={() => {
                  showToast(vi ? 'Đã tạo kho.' : 'Warehouse created.')
                  setWarehouseTab('layout')
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
                    <WarehouseHeader vi={vi} api={api} />
                    <TabBar
                      tabs={warehouseTabs}
                      active={warehouseTab}
                      vi={vi}
                      onChange={setWarehouseTab}
                    />
                    <div className="p-4">
                      {warehouseTab === 'layout' ? (
                        <div className="space-y-6">
                          <PanelSection
                            title={vi ? 'Khu' : 'Zones'}
                            hint={vi ? 'Bấm một khu để xem và tạo kệ trong khu đó.' : 'Click a zone to manage its racks.'}
                          >
                            <ZonesTab
                              vi={vi}
                              api={api}
                              onNotice={showToast}
                              onCreated={() => showToast(vi ? 'Đã tạo khu.' : 'Zone created.')}
                            />
                          </PanelSection>
                          <PanelSection
                            title={
                              api.selectedZone
                                ? vi
                                  ? `Kệ trong khu ${api.selectedZone.zoneCode}`
                                  : `Racks in zone ${api.selectedZone.zoneCode}`
                                : vi
                                  ? 'Kệ'
                                  : 'Racks'
                            }
                          >
                            <BinsTab
                              vi={vi}
                              api={api}
                              onNotice={showToast}
                              onOpenCategories={() => openCatalog('categories')}
                              onGenerated={(created) =>
                                showToast(
                                  vi ? `Đã tạo ${created} ô mới.` : `Created ${created} new bins.`,
                                )
                              }
                            />
                          </PanelSection>
                        </div>
                      ) : null}
                      {warehouseTab === 'assign' ? (
                        <AssignTab
                          vi={vi}
                          api={api}
                          binId={pickedBinId}
                          onBinIdChange={setPickedBinId}
                          onAssigned={() =>
                            showToast(vi ? 'Đã gán SKU vào ô.' : 'SKU assigned to bin.')
                          }
                        />
                      ) : null}
                      {warehouseTab === 'stock' ? (
                        <StockTab
                          vi={vi}
                          api={api}
                          onRestocked={() =>
                            showToast(vi ? 'Đã nhập thêm hàng.' : 'Stock added.')
                          }
                        />
                      ) : null}
                      {warehouseTab === 'picking' ? (
                        <PickingTab vi={vi} warehouseId={api.selectedWarehouse.id} />
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      {toast ? (
        <AdminToast message={toast} onClose={() => setToast(null)} />
      ) : null}
    </>
  )
}

function TabBar<T extends string>({
  tabs,
  active,
  vi,
  onChange,
}: {
  tabs: Array<{ id: T; labelVi: string; labelEn: string }>
  active: T
  vi: boolean
  onChange: (id: T) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-hairline px-2">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors',
            active === item.id
              ? 'border-primary text-primary-hover'
              : 'border-transparent text-ink-subtle hover:text-ink',
          )}
        >
          {vi ? item.labelVi : item.labelEn}
        </button>
      ))}
    </div>
  )
}

function PanelSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

function WarehouseHeader({ vi, api }: { vi: boolean; api: Api }) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const warehouse = api.selectedWarehouse
  if (!warehouse) return null

  return (
    <div className="border-b border-hairline px-4 py-3">
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
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
            className={cn(fieldClass, 'sm:w-56')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Input
            className={cn(fieldClass, 'sm:flex-1')}
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
          />
          <Button type="submit" className="h-9 text-xs" disabled={api.mutating}>
            {vi ? 'Lưu' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 text-xs"
            onClick={() => setEditing(false)}
          >
            {vi ? 'Huỷ' : 'Cancel'}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              {warehouse.warehouseName}
              {warehouse.isActive ? null : (
                <Badge tone="warning">{vi ? 'Đang tắt' : 'Inactive'}</Badge>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {warehouse.warehouseCode} · {warehouse.address}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={rowActionClass}
              disabled={api.loading || api.mutating}
              onClick={() => {
                void api.reload()
                void api.reloadUnassigned()
              }}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              {vi ? 'Tải lại' : 'Reload'}
            </button>
            <button
              type="button"
              className={rowActionClass}
              onClick={() => {
                setEditName(warehouse.warehouseName)
                setEditAddress(warehouse.address)
                setEditing(true)
              }}
            >
              {vi ? 'Sửa' : 'Edit'}
            </button>
            <button
              type="button"
              className={warehouse.isActive ? rowOffClass : rowActionClass}
              disabled={api.mutating}
              onClick={() => {
                const ok = window.confirm(
                  warehouse.isActive
                    ? vi
                      ? 'Tắt kho sẽ tắt luôn khu và kệ. Còn hàng thì hệ thống từ chối.'
                      : 'Deactivating the warehouse also deactivates its zones and bins.'
                    : vi
                      ? 'Bật lại chỉ kho. Khu và kệ vẫn tắt — bật lại từng khu cần dùng.'
                      : 'Reactivating only turns the warehouse back on.',
                )
                if (!ok) return
                void api.setWarehouseActive(!warehouse.isActive)
              }}
            >
              {warehouse.isActive ? (vi ? 'Tắt kho' : 'Deactivate') : vi ? 'Bật kho' : 'Reactivate'}
            </button>
          </div>
        </div>
      )}
    </div>
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
    <aside className="flex flex-col self-start rounded-xl border border-hairline bg-surface-1">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
        <p className="text-sm font-semibold text-ink">{vi ? 'Danh sách kho' : 'Warehouses'}</p>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-hover hover:bg-primary/10"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {open ? (vi ? 'Đóng' : 'Close') : vi ? 'Tạo kho' : 'New'}
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
          {vi ? 'Chưa có kho. Bấm "Tạo kho" để bắt đầu.' : 'No warehouses yet.'}
        </p>
      ) : (
        <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto p-2">
          {api.warehouses.map((row) => {
            const active = row.id === api.selectedWarehouseId
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => api.selectWarehouse(row.id)}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-primary/15' : 'hover:bg-surface-2',
                  )}
                >
                  <p className="truncate text-sm font-medium text-ink">{row.warehouseName}</p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {row.warehouseCode}
                    {row.isActive ? '' : vi ? ' · đang tắt' : ' · inactive'}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <label className="flex items-center gap-2 border-t border-hairline px-3 py-2 text-[11px] text-ink-muted">
        <input
          type="checkbox"
          checked={api.showInactive}
          onChange={(e) => api.setShowInactive(e.target.checked)}
        />
        {vi ? 'Hiện kho, khu, kệ đã tắt' : 'Show inactive'}
      </label>
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
        className={cn(formCardClass, 'grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_auto]')}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          className={fieldClass}
          placeholder={vi ? 'Mã (KA)' : 'Code (KA)'}
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
              ? 'Tạo khu trước khi sinh kệ. Bấm Tải lại nếu khu vừa tạo chưa hiện.'
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

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form
        className={cn(formCardClass, 'grid gap-2')}
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
        <p className="text-xs font-medium text-ink">
          {vi ? 'Tạo nhóm (cấp 1)' : 'New group (level 1)'}
        </p>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Mã nhóm' : 'Group code'}</span>
          <Input
            className={fieldClass}
            placeholder="AO"
            value={groupCode}
            onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-ink-muted">{vi ? 'Tên' : 'Name'}</span>
          <Input
            className={fieldClass}
            placeholder={vi ? 'Áo' : 'Tops'}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          className="h-9 justify-self-end text-xs"
          disabled={busy || !/^[A-Z0-9]{2,12}$/.test(groupCode.trim()) || groupName.trim().length < 2}
        >
          {vi ? 'Tạo nhóm' : 'Create group'}
        </Button>
      </form>

      <form
        className={cn(formCardClass, 'grid gap-2 sm:grid-cols-2')}
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
          {vi ? 'Tạo loại (cấp 2)' : 'New type (level 2) — with sizes, used for racks'}
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
          className="h-9 text-xs sm:col-span-2 sm:justify-self-end"
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
      </div>

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
          <div className="flex justify-end">
            <Button type="button" variant="secondary" className="h-9 text-xs" onClick={onReadyForBins}>
              {vi ? 'Sang tạo kệ' : 'Done — create racks'}
            </Button>
          </div>
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
  const [colors, setColors] = useState<ColorRecord[]>([])
  const [cellColors, setCellColors] = useState<string[]>(['', '', ''])
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
    void listColors()
      .then((rows) => {
        if (!cancelled) setColors(rows.filter((row) => row.isActive))
      })
      .catch(() => {
        if (!cancelled) setColors([])
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
      {!api.selectedZone ? (
        <p className="text-xs text-ink-muted">
          {vi ? 'Chọn một khu ở bảng trên để tạo kệ.' : 'Pick a zone above to create racks.'}
        </p>
      ) : (
      <form
        className={cn(formCardClass, 'space-y-4')}
        onSubmit={(e) => {
          e.preventDefault()
          const cellCount = Math.trunc(rackCells)
          if (!selectedCategory || !tiersReady || cellCount < 1 || cellCount > 9) return
          const tiers = tierSizes.map((size, index) => ({ tier: index + 1, size }))
          const chosenColors = cellColors.slice(0, cellCount)
          const colorsReady =
            chosenColors.length === cellCount && chosenColors.every((value) => value.length > 0)
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
              ...(colorsReady ? { cell_colors: chosenColors } : {}),
            })
            .then((created) => onGenerated(created))
        }}
      >
        <p className="text-xs font-medium text-ink">
          {vi ? 'Tạo kệ mới' : 'New rack'}
        </p>

        <div className="grid gap-2 sm:grid-cols-[90px_130px_90px_minmax(0,1fr)]">
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
            <span className="text-[11px] text-ink-muted">{vi ? 'Số kệ' : 'Bay'}</span>
            <Input
              className={fieldClass}
              type="number"
              min={1}
              value={rackBay}
              onChange={(e) => setRackBay(Number(e.target.value))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-ink-muted">{vi ? 'Loại hàng' : 'Product type'}</span>
            {level2Categories.length === 0 ? (
              <div className="flex h-9 items-center gap-2">
                <span className="text-xs text-ink-muted">
                  {vi ? 'Chưa có loại hàng.' : 'No product type yet.'}
                </span>
                <button type="button" className={rowActionClass} onClick={onOpenCategories}>
                  {vi ? 'Tạo danh mục' : 'Create categories'}
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
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11px] text-ink-muted">
              {vi ? 'Size theo tầng (tầng 1 sát sàn)' : 'Size per tier (tier 1 at floor)'}
            </p>
            {selectedCategory ? (
              <>
                {tierSizes.map((size, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-ink">
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
                    <button
                      type="button"
                      className={cn(rowActionClass, tierSizes.length > 1 ? '' : 'invisible')}
                      onClick={() => setTierSizes(tierSizes.filter((_, item) => item !== index))}
                    >
                      {vi ? 'Bỏ' : 'Remove'}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={rowActionClass}
                  disabled={tierSizes.length >= 9}
                  onClick={() => setTierSizes([...tierSizes, ''])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {vi ? 'Thêm tầng' : 'Add tier'}
                </button>
              </>
            ) : (
              <p className="text-xs text-ink-tertiary">
                {vi ? 'Chọn loại hàng trước.' : 'Choose a product type first.'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
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
                  onChange={(e) => {
                    const count = Math.max(1, Math.min(9, Math.trunc(Number(e.target.value)) || 1))
                    setRackCells(count)
                    setCellColors((prev) => {
                      const next = prev.slice(0, count)
                      while (next.length < count) next.push('')
                      return next
                    })
                  }}
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
            </div>
            {colors.length > 0 ? (
              <>
                <p className="text-[11px] text-ink-muted">
                  {vi ? 'Màu từng ô (tuỳ chọn, phải chọn đủ mọi ô)' : 'Cell colors (optional, all or none)'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {cellColors.map((value, index) => (
                    <select
                      key={index}
                      className={fieldClass}
                      aria-label={vi ? `Màu ô ${index + 1}` : `Cell ${index + 1} color`}
                      value={value}
                      onChange={(e) => {
                        const next = [...cellColors]
                        next[index] = e.target.value
                        setCellColors(next)
                      }}
                    >
                      <option value="">{vi ? `Ô ${index + 1}: —` : `Cell ${index + 1}: —`}</option>
                      {colors.map((row) => (
                        <option key={row.code} value={row.code}>
                          {`${vi ? 'Ô' : 'Cell'} ${index + 1}: ${row.code}`}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
          <p className="text-[11px] text-ink-muted">
            {vi ? 'Mã ô đầu tiên: ' : 'First bin code: '}
            <span className="font-mono text-ink">
              {api.selectedZone.zoneCode}-{rackAisle || 'D?'}-{rackSide}
              {String(Math.max(1, Math.trunc(rackBay) || 1)).padStart(2, '0')}-T01-1
            </span>
          </p>
          <Button
            type="submit"
            className="h-9 text-xs"
            disabled={
              api.mutating ||
              !/^D([1-9][0-9]?)$/.test(rackAisle) ||
              rackBay < 1 ||
              rackCells < 1 ||
              rackCells > 9 ||
              !tiersReady
            }
          >
            {vi ? 'Tạo kệ' : 'Create rack'}
          </Button>
        </div>
      </form>
      )}

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
  const [skuQuery, setSkuQuery] = useState('')

  const filteredUnassigned = useMemo(() => {
    const query = skuQuery.trim().toLowerCase()
    if (!query) return api.unassigned
    return api.unassigned.filter((row) => {
      const haystack = `${row.seller_sku} ${row.shop_id} ${row.platform}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [api.unassigned, skuQuery])

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
            ? `${api.unassigned.length} SKU trong catalog chưa có ô trong kho này (mỗi kho gán riêng).`
            : `${api.unassigned.length} catalog SKUs have no bin in this warehouse (each warehouse is separate).`}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-bg px-3 py-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {vi ? 'Mọi SKU trong catalog đã có ô trong kho này.' : 'Every catalog SKU has a bin in this warehouse.'}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={skuQuery}
              onChange={(e) => setSkuQuery(e.target.value)}
              placeholder={vi ? 'Tìm mã SKU, shop hoặc sàn…' : 'Search SKU, shop, or marketplace…'}
              aria-label={vi ? 'Tìm SKU chưa gán kệ' : 'Search unassigned SKUs'}
              disabled={api.unassigned.length === 0}
              className={cn(fieldClass, 'pl-9', skuQuery ? 'pr-8' : undefined)}
            />
            {skuQuery ? (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-ink-subtle hover:text-ink"
                aria-label={vi ? 'Xóa từ khóa' : 'Clear search'}
                onClick={() => setSkuQuery('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {skuQuery.trim() && api.unassigned.length > 0 ? (
            <p className="text-[11px] text-ink-muted">
              {vi
                ? `${filteredUnassigned.length} / ${api.unassigned.length} SKU khớp`
                : `${filteredUnassigned.length} / ${api.unassigned.length} matching`}
            </p>
          ) : null}
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
                {filteredUnassigned.map((row) => {
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
                {vi ? 'Không còn SKU chưa gán trong kho này.' : 'No unassigned SKUs in this warehouse.'}
              </p>
            ) : filteredUnassigned.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">
                {vi
                  ? `Không có SKU khớp «${skuQuery.trim()}».`
                  : `No SKU matches “${skuQuery.trim()}”.`}
              </p>
            ) : null}
          </div>
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
          <TableHead>{vi ? 'Thao tác' : 'Actions'}</TableHead>
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
                <span className={stockActionLabelClass}>{vi ? 'Nhập thêm' : 'Receive'}</span>
                <Input
                  className="h-8 w-16"
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
                <span className={stockActionLabelClass}>{vi ? 'Kiểm kê' : 'Count'}</span>
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
                  {vi ? 'Lưu' : 'Save'}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={stockActionLabelClass}>{vi ? 'Chuyển ô' : 'Move'}</span>
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
                  {vi ? 'Chuyển' : 'Move'}
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-3 pl-[4.5rem]">
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
              <TableHead>{vi ? 'Số lượng' : 'Qty'}</TableHead>
              <TableHead>{vi ? 'Khu' : 'Zone'}</TableHead>
              <TableHead>{vi ? 'Ô' : 'Bin'}</TableHead>
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
