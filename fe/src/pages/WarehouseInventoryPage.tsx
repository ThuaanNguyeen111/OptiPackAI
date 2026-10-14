import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, MapPin, PackageSearch, RefreshCw, Search, X } from 'lucide-react'
import {
  adjustStockAssignment,
  listSkuBinAssignments,
  listStockMovements,
  listWarehouseBinLocations,
  listWarehouseZones,
  listWarehouses,
  readStoredWarehouseId,
  restockSkuAssignment,
  transferStockAssignment,
  writeStoredWarehouseId,
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
import { cn } from '../lib/cn'
import { formatApiError, getApiErrorCode } from '../lib/api'
import { formatDateTime } from '../utils/format'
import type {
  BinLocationRecord,
  InventoryMovementRecord,
  SkuBinAssignmentRecord,
  StockAdjustReason,
  WarehouseRecord,
  WarehouseZoneRecord,
} from '../types/warehouse-admin'

const fieldClass =
  'h-9 w-full rounded-md border border-hairline bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

type StockFilter = 'all' | 'in_stock' | 'empty'
type ActionId = 'receive' | 'count' | 'move' | 'ledger'

type WarehouseData = {
  key: string
  zones: WarehouseZoneRecord[]
  bins: BinLocationRecord[]
  assignments: SkuBinAssignmentRecord[]
}

type StockRow = SkuBinAssignmentRecord & {
  binLabel: string
  zoneCode: string
  capacity: number | null
  pickSequence: number | null
}

const MOVEMENT_LABELS: Record<string, [string, string]> = {
  assign_initial: ['Gán lần đầu', 'Initial assign'],
  receive: ['Nhập hàng', 'Receive'],
  pick: ['Lấy hàng', 'Pick'],
  adjust: ['Kiểm kê', 'Count'],
  transfer_out: ['Chuyển đi', 'Moved out'],
  transfer_in: ['Chuyển đến', 'Moved in'],
  return_restock: ['Hàng hoàn nhập lại', 'Return restock'],
  sku_merge: ['Gộp tồn', 'Stock merge'],
}

function movementLabel(type: string, vi: boolean): string {
  const label = MOVEMENT_LABELS[type]
  if (!label) return type
  return vi ? label[0] : label[1]
}

export function WarehouseInventoryPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [warehouses, setWarehouses] = useState<WarehouseRecord[] | null>(null)
  const [warehousesError, setWarehousesError] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState(() => readStoredWarehouseId())
  const [reloadToken, setReloadToken] = useState(0)
  const [data, setData] = useState<WarehouseData | null>(null)
  const [dataError, setDataError] = useState<{ key: string; message: string } | null>(null)

  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const activeWarehouseId = useMemo(() => {
    if (!warehouses || warehouses.length === 0) return ''
    if (warehouses.some((row) => row.id === warehouseId)) return warehouseId
    return warehouses[0]?.id ?? ''
  }, [warehouses, warehouseId])

  const dataKey = activeWarehouseId ? `${activeWarehouseId}:${reloadToken}` : ''

  useEffect(() => {
    let cancelled = false
    listWarehouses()
      .then((rows) => {
        if (!cancelled) setWarehouses(rows.filter((row) => row.isActive))
      })
      .catch((err: unknown) => {
        if (!cancelled) setWarehousesError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!dataKey) return
    let cancelled = false
    Promise.all([
      listWarehouseZones(activeWarehouseId),
      listWarehouseBinLocations(activeWarehouseId),
      listSkuBinAssignments(activeWarehouseId),
    ])
      .then(([zones, bins, assignments]) => {
        if (!cancelled) setData({ key: dataKey, zones, bins, assignments })
      })
      .catch((err: unknown) => {
        if (!cancelled) setDataError({ key: dataKey, message: formatApiError(err) })
      })
    return () => {
      cancelled = true
    }
  }, [dataKey, activeWarehouseId])

  const loadError = dataError?.key === dataKey ? dataError.message : null
  const current = data && data.key.startsWith(`${activeWarehouseId}:`) ? data : null
  const loading = Boolean(dataKey) && data?.key !== dataKey && !loadError

  const zoneById = useMemo(
    () => new Map((current?.zones ?? []).map((zone) => [zone.id, zone])),
    [current],
  )
  const binById = useMemo(
    () => new Map((current?.bins ?? []).map((bin) => [bin.id, bin])),
    [current],
  )

  const rows = useMemo<StockRow[]>(() => {
    if (!current) return []
    return current.assignments
      .map((row) => {
        const bin = binById.get(row.binLocationId)
        const zone = bin ? zoneById.get(bin.zoneId) : undefined
        return {
          ...row,
          binLabel: bin?.binCode || row.binCode || row.binLocationId.slice(-8),
          zoneCode: zone?.zoneCode ?? '',
          capacity: bin?.capacity ?? null,
          pickSequence: bin?.pickSequence ?? null,
        }
      })
      .sort((a, b) => {
        if (a.pickSequence !== null && b.pickSequence !== null) {
          return a.pickSequence - b.pickSequence
        }
        if (a.pickSequence !== null) return -1
        if (b.pickSequence !== null) return 1
        return a.binLabel.localeCompare(b.binLabel, 'en')
      })
  }, [current, binById, zoneById])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (zoneFilter && row.zoneCode !== zoneFilter) return false
      if (stockFilter === 'in_stock' && row.quantityOnHand <= 0) return false
      if (stockFilter === 'empty' && row.quantityOnHand > 0) return false
      if (!q) return true
      return [row.sellerSku, row.masterSku ?? '', row.binLabel, row.shopId].some((value) =>
        value.toLowerCase().includes(q),
      )
    })
  }, [rows, search, zoneFilter, stockFilter])

  const totals = useMemo(
    () => ({
      units: rows.reduce((sum, row) => sum + row.quantityOnHand, 0),
      empty: rows.filter((row) => row.quantityOnHand <= 0).length,
    }),
    [rows],
  )

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const zoneCodes = useMemo(
    () => [...new Set(rows.map((row) => row.zoneCode).filter(Boolean))].sort(),
    [rows],
  )

  function changeWarehouse(next: string) {
    setWarehouseId(next)
    writeStoredWarehouseId(next)
    setSelectedId('')
    setZoneFilter('')
  }

  function reload() {
    setReloadToken((value) => value + 1)
  }

  function handleDone(message: string) {
    setNotice(message)
    reload()
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Vận hành kho' : 'Warehouse', to: '/app/warehouse' },
          { label: vi ? 'Tồn kho theo vị trí' : 'Stock by bin' },
        ]}
      />

      <div className="flex-1 overflow-auto bg-surface-2 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <header className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-base font-semibold text-ink">
                {vi ? 'Tồn kho theo vị trí' : 'Stock by bin'}
              </h1>
              <p className="text-xs text-ink-muted">
                {vi
                  ? 'Xem hàng đang nằm ở ô nào, nhập hàng, kiểm kê và chuyển ô. Mọi thay đổi đều ghi sổ cái.'
                  : 'See what sits in each bin, receive, count and move stock. Every change is logged.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className={cn(fieldClass, 'min-w-[220px]')}
                value={activeWarehouseId}
                disabled={!warehouses || warehouses.length === 0}
                onChange={(e) => changeWarehouse(e.target.value)}
              >
                {(warehouses ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.warehouseCode} · {row.warehouseName}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                className="h-9 min-h-0 px-3 text-xs"
                disabled={!activeWarehouseId || loading}
                onClick={reload}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                {vi ? 'Tải lại' : 'Reload'}
              </Button>
            </div>
          </header>

          {notice ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <span>{notice}</span>
              <button type="button" className="cursor-pointer" onClick={() => setNotice(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {warehousesError ? <ErrorBox message={warehousesError} /> : null}
          {warehouses && warehouses.length === 0 ? (
            <EmptyBox
              title={vi ? 'Chưa có kho nào đang hoạt động' : 'No active warehouse'}
              body={vi ? 'Liên hệ Admin để tạo kho.' : 'Ask an Admin to create one.'}
            />
          ) : null}
          {loadError ? <ErrorBox message={loadError} /> : null}

          {activeWarehouseId && !loadError ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className="rounded-xl border border-hairline bg-surface-1">
                <div className="flex flex-col gap-2 border-b border-hairline p-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
                    <input
                      className={cn(fieldClass, 'pl-8')}
                      value={search}
                      placeholder={vi ? 'Tìm SKU sàn, SKU nội bộ, mã ô…' : 'Search SKU or bin…'}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className={cn(fieldClass, 'lg:w-36')}
                    value={zoneFilter}
                    onChange={(e) => setZoneFilter(e.target.value)}
                  >
                    <option value="">{vi ? 'Mọi khu' : 'All zones'}</option>
                    {zoneCodes.map((code) => (
                      <option key={code} value={code}>
                        {vi ? 'Khu' : 'Zone'} {code}
                      </option>
                    ))}
                  </select>
                  <div className="flex rounded-md border border-hairline p-0.5 text-xs">
                    {(
                      [
                        ['all', vi ? 'Tất cả' : 'All'],
                        ['in_stock', vi ? 'Còn hàng' : 'In stock'],
                        ['empty', vi ? 'Hết hàng' : 'Empty'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={cn(
                          'cursor-pointer rounded px-2.5 py-1.5 font-medium',
                          stockFilter === id ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
                        )}
                        onClick={() => setStockFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="px-3 pt-3 text-[11px] text-ink-muted">
                  {vi
                    ? `${rows.length} dòng tồn · ${totals.units.toLocaleString('vi-VN')} cái · ${totals.empty} dòng hết hàng`
                    : `${rows.length} rows · ${totals.units} units · ${totals.empty} empty`}
                </p>

                {loading && !current ? (
                  <div className="flex items-center gap-2 p-6 text-sm text-ink-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {vi ? 'Đang tải…' : 'Loading…'}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="p-3">
                    <EmptyBox
                      title={vi ? 'Kho này chưa có SKU nào được gán ô' : 'No SKU assigned to bins yet'}
                      body={
                        vi
                          ? 'Admin cần gán SKU vào ô ở màn Cấu hình kho thì hàng mới hiện ở đây.'
                          : 'An Admin must assign SKUs to bins first.'
                      }
                    />
                  </div>
                ) : (
                  <div className="p-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{vi ? 'Ô' : 'Bin'}</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">{vi ? 'Tồn' : 'On hand'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(
                              'cursor-pointer',
                              row.id === selectedId && 'bg-primary/5',
                            )}
                            onClick={() => setSelectedId(row.id)}
                          >
                            <TableCell>
                              <p className="font-mono text-xs font-semibold text-ink">{row.binLabel}</p>
                              {row.zoneCode ? (
                                <p className="text-[11px] text-ink-muted">
                                  {vi ? 'Khu' : 'Zone'} {row.zoneCode}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-ink">{row.sellerSku}</p>
                              <p className="text-[11px] text-ink-muted">
                                {row.platform} · {row.shopId}
                                {row.masterSku ? ` · ${row.masterSku}` : ''}
                              </p>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge tone={row.quantityOnHand > 0 ? 'success' : 'warning'}>
                                {row.quantityOnHand}
                                {row.capacity !== null ? ` / ${row.capacity}` : ''}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredRows.length === 0 ? (
                      <p className="py-6 text-center text-xs text-ink-muted">
                        {vi ? 'Không có dòng nào khớp bộ lọc.' : 'No rows match the filters.'}
                      </p>
                    ) : null}
                  </div>
                )}
              </section>

              <aside className="rounded-xl border border-hairline bg-surface-1 lg:sticky lg:top-4 lg:self-start">
                {selected ? (
                  <ActionPanel
                    key={selected.id}
                    vi={vi}
                    warehouseId={activeWarehouseId}
                    row={selected}
                    bins={current?.bins ?? []}
                    onClose={() => setSelectedId('')}
                    onDone={handleDone}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <MapPin className="h-5 w-5 text-ink-tertiary" />
                    <p className="text-sm font-medium text-ink">
                      {vi ? 'Chọn một dòng tồn' : 'Select a stock row'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {vi
                        ? 'Bấm vào một dòng bên trái để nhập hàng, kiểm kê, chuyển ô hoặc xem sổ cái.'
                        : 'Click a row to receive, count, move or view the ledger.'}
                    </p>
                  </div>
                )}
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

function ActionPanel({
  vi,
  warehouseId,
  row,
  bins,
  onClose,
  onDone,
}: {
  vi: boolean
  warehouseId: string
  row: StockRow
  bins: BinLocationRecord[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [action, setAction] = useState<ActionId>('receive')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [receiveQty, setReceiveQty] = useState(1)
  const [counted, setCounted] = useState(row.quantityOnHand)
  const [reason, setReason] = useState<StockAdjustReason>('count_correction')
  const [note, setNote] = useState('')
  const [targetBin, setTargetBin] = useState('')
  const [moveQty, setMoveQty] = useState(1)
  const [movements, setMovements] = useState<InventoryMovementRecord[] | null>(null)

  async function run(task: () => Promise<string>) {
    setBusy(true)
    setError(null)
    try {
      onDone(await task())
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  function confirmOverCapacity(err: unknown, question: string): boolean {
    if (getApiErrorCode(err) !== 'WH_BIN_OVER_CAPACITY') return false
    return window.confirm(`${formatApiError(err)}\n\n${question}`)
  }

  function receive() {
    void run(async () => {
      try {
        await restockSkuAssignment(warehouseId, row.id, receiveQty)
      } catch (err: unknown) {
        if (!confirmOverCapacity(err, vi ? 'Vẫn nhập?' : 'Receive anyway?')) throw err
        await restockSkuAssignment(warehouseId, row.id, receiveQty, true)
      }
      return vi
        ? `Đã nhập ${receiveQty} cái ${row.sellerSku} vào ô ${row.binLabel}.`
        : `Received ${receiveQty} × ${row.sellerSku} into ${row.binLabel}.`
    })
  }

  function count() {
    void run(async () => {
      await adjustStockAssignment(warehouseId, row.id, {
        counted_quantity: counted,
        reason_code: reason,
        note: note.trim() || undefined,
      })
      return vi
        ? `Đã lưu kiểm kê ô ${row.binLabel}: ${row.quantityOnHand} → ${counted}.`
        : `Count saved for ${row.binLabel}: ${row.quantityOnHand} → ${counted}.`
    })
  }

  function move() {
    const input = { to_bin_location_id: targetBin, quantity: moveQty }
    const target = bins.find((bin) => bin.id === targetBin)?.binCode ?? ''
    void run(async () => {
      try {
        await transferStockAssignment(warehouseId, row.id, input)
      } catch (err: unknown) {
        if (!confirmOverCapacity(err, vi ? 'Vẫn chuyển?' : 'Move anyway?')) throw err
        await transferStockAssignment(warehouseId, row.id, { ...input, force: true })
      }
      return vi
        ? `Đã chuyển ${moveQty} cái từ ${row.binLabel} sang ${target}.`
        : `Moved ${moveQty} from ${row.binLabel} to ${target}.`
    })
  }

  function openLedger() {
    setAction('ledger')
    setMovements(null)
    setError(null)
    listStockMovements(warehouseId, row.id)
      .then(setMovements)
      .catch((err: unknown) => setError(formatApiError(err)))
  }

  const tabs: [ActionId, string][] = [
    ['receive', vi ? 'Nhập hàng' : 'Receive'],
    ['count', vi ? 'Kiểm kê' : 'Count'],
    ['move', vi ? 'Chuyển ô' : 'Move'],
    ['ledger', vi ? 'Sổ cái' : 'Ledger'],
  ]

  return (
    <div>
      <div className="flex items-start justify-between gap-2 border-b border-hairline p-4">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-ink">{row.binLabel}</p>
          <p className="truncate text-xs text-ink">{row.sellerSku}</p>
          <p className="text-[11px] text-ink-muted">
            {vi ? 'Đang có' : 'On hand'}: <strong className="text-ink">{row.quantityOnHand}</strong>
            {row.capacity !== null ? ` / ${row.capacity}` : ''}
            {row.masterSku ? ` · ${row.masterSku}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="cursor-pointer rounded p-1 text-ink-muted hover:bg-surface-2"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-hairline px-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              'cursor-pointer border-b-2 px-2.5 py-2 text-xs font-medium',
              action === id
                ? 'border-primary text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
            onClick={() => {
              if (id === 'ledger') openLedger()
              else {
                setAction(id)
                setError(null)
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-4">
        {action === 'receive' ? (
          <Field label={vi ? 'Số lượng nhập thêm' : 'Quantity to add'}>
            <Input
              className={fieldClass}
              type="number"
              min={1}
              value={receiveQty}
              onChange={(e) => setReceiveQty(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="text-[11px] text-ink-muted">
              {vi ? 'Sau khi nhập' : 'After'}: {row.quantityOnHand + receiveQty}
            </p>
          </Field>
        ) : null}

        {action === 'count' ? (
          <>
            <Field label={vi ? 'Số đếm thực tế' : 'Counted quantity'}>
              <Input
                className={fieldClass}
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="text-[11px] text-ink-muted">
                {vi ? 'Chênh lệch' : 'Difference'}: {counted - row.quantityOnHand > 0 ? '+' : ''}
                {counted - row.quantityOnHand}
              </p>
            </Field>
            <Field label={vi ? 'Lý do' : 'Reason'}>
              <select
                className={fieldClass}
                value={reason}
                onChange={(e) => setReason(e.target.value as StockAdjustReason)}
              >
                <option value="count_correction">{vi ? 'Đếm lại' : 'Recount'}</option>
                <option value="damaged">{vi ? 'Hàng hư' : 'Damaged'}</option>
                <option value="lost">{vi ? 'Thất lạc' : 'Lost'}</option>
                <option value="found">{vi ? 'Tìm thấy thêm' : 'Found'}</option>
                <option value="other">{vi ? 'Khác' : 'Other'}</option>
              </select>
            </Field>
            <Field label={vi ? 'Ghi chú' : 'Note'}>
              <Input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        ) : null}

        {action === 'move' ? (
          <>
            <Field label={vi ? 'Ô đích' : 'Destination bin'}>
              <select
                className={fieldClass}
                value={targetBin}
                onChange={(e) => setTargetBin(e.target.value)}
              >
                <option value="">{vi ? 'Chọn ô' : 'Choose bin'}</option>
                {bins
                  .filter((bin) => bin.id !== row.binLocationId && bin.isActive)
                  .map((bin) => (
                    <option key={bin.id} value={bin.id}>
                      {bin.binCode}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={vi ? 'Số lượng chuyển' : 'Quantity'}>
              <Input
                className={fieldClass}
                type="number"
                min={1}
                max={row.quantityOnHand}
                value={moveQty}
                onChange={(e) => setMoveQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </>
        ) : null}

        {action === 'ledger' ? (
          movements === null && !error ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {vi ? 'Đang tải…' : 'Loading…'}
            </div>
          ) : movements && movements.length === 0 ? (
            <p className="text-xs text-ink-muted">{vi ? 'Chưa có dòng sổ.' : 'No movements yet.'}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-hairline overflow-y-auto text-xs">
              {(movements ?? []).map((move) => (
                <li key={move.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{movementLabel(move.type, vi)}</span>
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        move.delta > 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {move.delta > 0 ? '+' : ''}
                      {move.delta}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {move.quantityBefore} → {move.quantityAfter}
                    {move.createdAt ? ` · ${formatDateTime(move.createdAt)}` : ''}
                    {move.note ? ` · ${move.note}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        {action !== 'ledger' ? (
          <div className="flex justify-end border-t border-hairline pt-3">
            <Button
              className="h-9 min-h-0 text-xs"
              disabled={
                busy ||
                (action === 'move' && (!targetBin || moveQty > row.quantityOnHand)) ||
                (action === 'count' && counted === row.quantityOnHand)
              }
              onClick={() => {
                if (action === 'receive') receive()
                else if (action === 'count') count()
                else move()
              }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {action === 'receive'
                ? vi
                  ? 'Nhập hàng'
                  : 'Receive'
                : action === 'count'
                  ? vi
                    ? 'Lưu kiểm kê'
                    : 'Save count'
                  : vi
                    ? 'Chuyển ô'
                    : 'Move'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      {message}
    </div>
  )
}

function EmptyBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-hairline bg-surface-1 px-4 py-10 text-center">
      <PackageSearch className="h-5 w-5 text-ink-tertiary" />
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-xs text-ink-muted">{body}</p>
    </div>
  )
}

export default WarehouseInventoryPage
