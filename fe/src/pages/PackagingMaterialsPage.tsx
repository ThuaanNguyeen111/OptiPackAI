import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import {
  createPackagingMaterial,
  deactivatePackagingMaterial,
  getPackagingMaterialsSavings,
  internalUsePackagingMaterial,
  listPackagingMaterialMovements,
  listPackagingMaterials,
  purchasePackagingMaterial,
  reactivatePackagingMaterial,
  updatePackagingMaterial,
  type PackagingMaterialKind,
  type PackagingMaterialMovement,
  type PackagingMaterialsSavings,
  type PackagingMaterialStock,
} from '../api/packaging-materials.api'
import {
  createCushionMaterial,
  createPackagingBag,
  createPackagingBox,
  getMaterialRules,
  listBoxMovements,
  listCushionMaterials,
  listCushionMovements,
  listPackagingBags,
  listPackagingBoxes,
  saveMaterialRules,
  stockInCushionMaterial,
  stockInPackagingBag,
  stockInPackagingBox,
  updateCushionMaterial,
  updatePackagingBag,
  updatePackagingBox,
  type CatalogMovement,
  type CushionMaterial,
  type CushionMaterialType,
  type MaterialRule,
  type MaterialRules,
  type PackagingBag,
  type PackagingBox,
  type StockStatus,
} from '../api/packaging-catalog.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Input } from '../components/ui/input'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { UserRole } from '../types/auth'
import { formatCurrency, formatDateTime } from '../utils/format'

type TabId = 'stock' | 'boxes' | 'bags' | 'cushions'

const TABS: TabId[] = ['boxes', 'bags', 'cushions', 'stock']

const CUSHION_TYPES: CushionMaterialType[] = [
  'foam_corner',
  'corrugated_divider',
  'air_pillow',
  'bubble_wrap',
  'fragile_tape',
  'kraft_paper',
  'tissue_paper',
]

const RULE_SCOPES = ['fragile', 'shoes', 'fragile_or_shoes', 'any', 'bag', 'dress_or_bag'] as const
const RULE_BASES = ['per_unit', 'per_extra_unit', 'per_carton', 'void_band'] as const

const fieldClass =
  'h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary'

function tx(vi: boolean, vn: string, en: string): string {
  return vi ? vn : en
}

function positiveInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function nonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function stockTone(status: StockStatus): 'success' | 'warning' | 'default' {
  if (status === 'in_stock') return 'success'
  if (status === 'low_stock') return 'warning'
  return 'default'
}

function stockLabel(status: StockStatus, vi: boolean): string {
  if (status === 'in_stock') return tx(vi, 'Còn hàng', 'In stock')
  if (status === 'low_stock') return tx(vi, 'Sắp hết', 'Low')
  return tx(vi, 'Hết hàng', 'Out')
}

function kindLabel(kind: string, vi: boolean): string {
  if (kind === 'box') return tx(vi, 'Thùng', 'Box')
  if (kind === 'cushioning') return tx(vi, 'Vật liệu chống sốc', 'Shock protection')
  if (kind === 'mailer') return tx(vi, 'Túi niêm phong', 'Mailer')
  return kind
}

function movementLabel(value: string, vi: boolean): string {
  const labels: Record<string, [string, string]> = {
    purchase: ['Nhập mới', 'Purchase'],
    consume: ['Xuất đóng gói', 'Packed'],
    recover: ['Thu hồi', 'Recovered'],
    internal_use: ['Xuất nội bộ', 'Internal use'],
    discard: ['Loại bỏ', 'Discarded'],
    waste: ['Hao hụt', 'Waste'],
    stock_in: ['Nhập kho', 'Stock in'],
    pack: ['Đóng gói', 'Pack'],
    pack_reused: ['Đóng gói (tái sử dụng)', 'Pack (reused)'],
    new: ['Mới', 'New'],
    reused: ['Tái sử dụng', 'Reused'],
    internal: ['Nội bộ', 'Internal'],
    discarded: ['Đã loại', 'Discarded'],
  }
  const pair = labels[value]
  return pair ? tx(vi, pair[0], pair[1]) : value
}

function useMaterialAccess(role: number | undefined) {
  const admin = role === UserRole.ADMIN
  const warehouse = role === UserRole.WAREHOUSE_STAFF
  const packaging = role === UserRole.PACKAGING_STAFF
  const owner = role === UserRole.STORE_OWNER
  return {
    canSeeSavings: admin || owner,
    canManage: admin,
    canStock: admin || warehouse,
    canSeeEngineLedger: admin || warehouse || packaging,
  }
}

function Banner({ error, notice }: { error: string; notice: string }) {
  if (!error && !notice) return null
  return (
    <p
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        error
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800',
      )}
    >
      {error || notice}
    </p>
  )
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-xl border border-hairline bg-surface-1 p-4 shadow-xl sm:rounded-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1 text-xs text-ink-muted">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function PackagingMaterialsPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const vi = locale === 'vi'
  const adminShell = location.pathname.startsWith('/app/admin')
  const access = useMaterialAccess(session?.role)
  const rawTab = params.get('tab')
  const tab: TabId = TABS.includes(rawTab as TabId) ? (rawTab as TabId) : 'stock'

  const tabLabel: Record<TabId, string> = {
    stock: tx(vi, 'Kho tái sử dụng', 'Reuse stock'),
    boxes: tx(vi, 'Thùng', 'Boxes'),
    bags: tx(vi, 'Túi zip', 'Zip bags'),
    cushions: tx(vi, 'Vật liệu chống sốc', 'Shock protection'),
  }

  return (
    <>
      <PortalTopBar
        variant={adminShell ? 'admin' : 'ops'}
        breadcrumbs={[
          {
            label: 'OptiPackAI',
            to: adminShell ? '/app/admin' : '/app',
          },
          { label: tx(vi, 'Vật liệu đóng gói', 'Packaging materials') },
        ]}
      />
      <div className="flex-1 overflow-auto bg-surface-2 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <header className="rounded-xl border border-hairline bg-surface-1 p-4">
            <h1 className="text-base font-semibold text-ink">
              {tx(vi, 'Vật liệu đóng gói', 'Packaging materials')}
            </h1>
          </header>

          <div className="flex flex-wrap gap-2">
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  'rounded-md px-3 py-2 text-sm',
                  tab === id
                    ? 'bg-primary text-on-primary'
                    : 'border border-hairline bg-surface-1 text-ink',
                )}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('tab', id)
                  setParams(next, { replace: true })
                }}
              >
                {tabLabel[id]}
              </button>
            ))}
          </div>

          {tab === 'stock' ? <ReuseStockPanel vi={vi} access={access} /> : null}
          {tab === 'boxes' ? <BoxesPanel vi={vi} access={access} /> : null}
          {tab === 'bags' ? <BagsPanel vi={vi} access={access} /> : null}
          {tab === 'cushions' ? <CushionsPanel vi={vi} access={access} /> : null}
        </div>
      </div>
    </>
  )
}

type Access = ReturnType<typeof useMaterialAccess>

function ReuseStockPanel({ vi, access }: { vi: boolean; access: Access }) {
  const [rows, setRows] = useState<PackagingMaterialStock[]>([])
  const [savings, setSavings] = useState<PackagingMaterialsSavings | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit' | 'purchase' | 'internal' | 'ledger'; item: PackagingMaterialStock }
    | { kind: 'deactivate'; item: PackagingMaterialStock }
    | null
  >(null)
  const [ledger, setLedger] = useState<PackagingMaterialMovement[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const list = await listPackagingMaterials(includeInactive)
      setRows(list)
      setSavings(access.canSeeSavings ? await getPackagingMaterialsSavings() : null)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void listPackagingMaterials(includeInactive)
      .then(async (list) => {
        if (cancelled) return
        setRows(list)
        if (access.canSeeSavings) {
          const next = await getPackagingMaterialsSavings()
          if (!cancelled) setSavings(next)
        } else if (!cancelled) {
          setSavings(null)
        }
        if (!cancelled) setError('')
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
  }, [access.canSeeSavings, includeInactive])

  async function openLedger(item: PackagingMaterialStock) {
    setDialog({ kind: 'ledger', item })
    setLedger([])
    setBusy(true)
    setError('')
    try {
      setLedger(await listPackagingMaterialMovements(item.code, 50))
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <Banner error={error} notice={notice} />
      {savings ? <SavingsCards vi={vi} savings={savings} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          {tx(vi, 'Hiện mục đã tắt', 'Show inactive')}
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1 size-4" />
            {tx(vi, 'Tải lại', 'Reload')}
          </Button>
          {access.canManage ? (
            <Button onClick={() => setDialog({ kind: 'create' })}>
              <Plus className="mr-1 size-4" />
              {tx(vi, 'Thêm vật liệu', 'Add material')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-hairline bg-surface-1">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-hairline text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">{tx(vi, 'Mã', 'Code')}</th>
              <th className="px-3 py-2">{tx(vi, 'Tên', 'Name')}</th>
              <th className="px-3 py-2">{tx(vi, 'Loại', 'Kind')}</th>
              <th className="px-3 py-2">{tx(vi, 'Mới', 'New')}</th>
              <th className="px-3 py-2">{tx(vi, 'Tái sử dụng', 'Reused')}</th>
              <th className="px-3 py-2">{tx(vi, 'Nội bộ', 'Internal')}</th>
              <th className="px-3 py-2">{tx(vi, 'Đơn giá', 'Unit cost')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-ink-muted">
                  <Loader2 className="mr-2 inline size-4 animate-spin" />
                  {tx(vi, 'Đang tải…', 'Loading…')}
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-ink-muted">
                  {tx(vi, 'Chưa có vật liệu.', 'No materials yet.')}
                </td>
              </tr>
            ) : null}
            {rows.map((item) => (
              <tr key={item.code} className="border-t border-hairline">
                <td className="px-3 py-2 font-medium text-ink">
                  {item.code}{' '}
                  {!item.isActive ? (
                    <Badge tone="default">{tx(vi, 'Đã tắt', 'Off')}</Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2">{kindLabel(item.kind, vi)}</td>
                <td className="px-3 py-2">{item.qtyNew}</td>
                <td className="px-3 py-2">{item.qtyReused}</td>
                <td className="px-3 py-2">{item.qtyInternal}</td>
                <td className="px-3 py-2">{formatCurrency(item.unitCostVnd)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button variant="ghost" onClick={() => void openLedger(item)}>
                      {tx(vi, 'Sổ', 'Ledger')}
                    </Button>
                    {access.canStock && item.isActive ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => setDialog({ kind: 'purchase', item })}
                        >
                          {tx(vi, 'Nhập', 'Receive')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setDialog({ kind: 'internal', item })}
                        >
                          {tx(vi, 'Nội bộ', 'Internal')}
                        </Button>
                      </>
                    ) : null}
                    {access.canManage ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => setDialog({ kind: 'edit', item })}
                        >
                          {tx(vi, 'Sửa', 'Edit')}
                        </Button>
                        {item.isActive ? (
                          <Button
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'deactivate', item })}
                          >
                            {tx(vi, 'Tắt', 'Deactivate')}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setBusy(true)
                              void reactivatePackagingMaterial(item.code)
                                .then(() => {
                                  setNotice(tx(vi, 'Đã bật lại.', 'Reactivated.'))
                                  return load()
                                })
                                .catch((err: unknown) => setError(formatApiError(err)))
                                .finally(() => setBusy(false))
                            }}
                          >
                            {tx(vi, 'Bật lại', 'Reactivate')}
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'create' ? (
        <CreateMaterialDialog
          vi={vi}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditMaterialDialog
          vi={vi}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog?.kind === 'purchase' || dialog?.kind === 'internal' ? (
        <StockActionDialog
          vi={vi}
          mode={dialog.kind}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog?.kind === 'ledger' ? (
        <Dialog
          title={`${tx(vi, 'Sổ', 'Ledger')} ${dialog.item.code}`}
          onClose={() => setDialog(null)}
        >
          <MovementTable vi={vi} rows={ledger} busy={busy} g4 />
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'deactivate'}
        title={tx(vi, 'Tắt vật liệu', 'Deactivate material')}
        description={
          dialog?.kind === 'deactivate'
            ? tx(
                vi,
                `Tắt ${dialog.item.code}? Chỉ tắt được khi cả ba tồn đều bằng 0.`,
                `Deactivate ${dialog.item.code}? Only when new, reused and internal stock are all zero.`,
              )
            : ''
        }
        confirmLabel={tx(vi, 'Tắt', 'Deactivate')}
        cancelLabel={tx(vi, 'Huỷ', 'Cancel')}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'deactivate') return
          setBusy(true)
          void deactivatePackagingMaterial(dialog.item.code)
            .then(() => {
              setNotice(tx(vi, 'Đã tắt.', 'Deactivated.'))
              setDialog(null)
              return load()
            })
            .catch((err: unknown) => setError(formatApiError(err)))
            .finally(() => setBusy(false))
        }}
      />
    </section>
  )
}

function SavingsCards({
  vi,
  savings,
}: {
  vi: boolean
  savings: PackagingMaterialsSavings
}) {
  const cards = [
    [tx(vi, 'Tiết kiệm', 'Saved'), formatCurrency(savings.totalSavingVnd)],
    [tx(vi, 'Tỷ lệ tái sử dụng', 'Reuse rate'), `${Math.round(savings.reuseRate * 100)}%`],
    [tx(vi, 'Đã dùng mới', 'Used new'), String(savings.unitsConsumedNew)],
    [tx(vi, 'Đã dùng tái sử dụng', 'Used reused'), String(savings.unitsConsumedReused)],
    [tx(vi, 'Thu hồi hạng A', 'Recovered grade A'), String(savings.unitsRecovered)],
    [tx(vi, 'Theo gợi ý', 'Followed plan'), `${Math.round(savings.recommendationFollowRate * 100)}%`],
  ] as const
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-hairline bg-surface-1 p-3">
          <p className="text-xs text-ink-muted">{label}</p>
          <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
        </div>
      ))}
    </div>
  )
}

function MovementTable({
  vi,
  rows,
  busy,
  g4,
}: {
  vi: boolean
  rows: Array<PackagingMaterialMovement | CatalogMovement>
  busy: boolean
  g4?: boolean
}) {
  if (busy) {
    return <p className="text-sm text-ink-muted">{tx(vi, 'Đang tải sổ…', 'Loading ledger…')}</p>
  }
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{tx(vi, 'Chưa có dòng sổ.', 'No movements.')}</p>
  }
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-ink-muted">
        <tr>
          <th className="py-1">{tx(vi, 'Thời điểm', 'When')}</th>
          <th className="py-1">{tx(vi, 'Loại', 'Type')}</th>
          <th className="py-1">{tx(vi, 'Lượng', 'Qty')}</th>
          {g4 ? <th className="py-1">{tx(vi, 'Tiết kiệm', 'Saved')}</th> : null}
          <th className="py-1">{tx(vi, 'Ghi chú', 'Note')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isG4 = 'materialCode' in row
          const reason = isG4 ? row.type : row.reason
          return (
            <tr key={`${row.createdAt ?? 'row'}-${index}`} className="border-t border-hairline">
              <td className="py-1">{row.createdAt ? formatDateTime(row.createdAt) : '—'}</td>
              <td className="py-1">
                {movementLabel(reason, vi)}
                {isG4 ? ` · ${movementLabel(row.condition, vi)}` : ''}
              </td>
              <td className="py-1">{row.delta}</td>
              {g4 ? (
                <td className="py-1">{isG4 ? formatCurrency(row.savingVnd) : '—'}</td>
              ) : null}
              <td className="py-1">{row.note ?? '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CreateMaterialDialog({
  vi,
  onClose,
  onDone,
}: {
  vi: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [kind, setKind] = useState<PackagingMaterialKind>('box')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const code = String(data.get('code') ?? '').trim().toUpperCase()
    const name = String(data.get('name') ?? '').trim()
    const unitCost = nonNegativeInt(String(data.get('unitCost') ?? ''))
    const cycles = positiveInt(String(data.get('cycles') ?? '3'))
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
      setError(tx(vi, 'Mã chỉ gồm A-Z, số, gạch ngang, 2–20 ký tự.', 'Code must be 2–20 letters, digits or hyphens.'))
      return
    }
    if (name.length < 2 || unitCost === null || cycles === null) {
      setError(tx(vi, 'Điền đủ tên, đơn giá và số lần dùng lại.', 'Fill name, cost and reuse cycles.'))
      return
    }
    const lengthCm = positiveInt(String(data.get('length') ?? ''))
    const widthCm = positiveInt(String(data.get('width') ?? ''))
    const heightCm = positiveInt(String(data.get('height') ?? ''))
    const match = String(data.get('match') ?? '').trim()
    if (kind === 'box' && (lengthCm === null || widthCm === null || heightCm === null)) {
      setError(tx(vi, 'Thùng cần đủ dài, rộng, cao (cm).', 'A box needs length, width and height in cm.'))
      return
    }
    if (kind === 'cushioning' && match.length < 1) {
      setError(tx(vi, 'Vật liệu chống sốc cần mã loại khớp luật.', 'Shock protection needs a matching material type.'))
      return
    }
    const tareG = nonNegativeInt(String(data.get('tare') ?? ''))
    const maxLoadText = String(data.get('maxLoad') ?? '').trim()
    const maxLoadG = maxLoadText === '' ? null : positiveInt(maxLoadText)
    if (kind === 'mailer') {
      if (lengthCm === null || widthCm === null || tareG === null) {
        setError(tx(vi, 'Túi niêm phong cần rộng, dài (cm) và khối lượng túi (g).', 'A mailer needs width, length (cm) and bag weight (g).'))
        return
      }
      if (maxLoadText !== '' && maxLoadG === null) {
        setError(tx(vi, 'Tải tối đa phải là số nguyên dương.', 'Max load must be a positive whole number.'))
        return
      }
    }
    setBusy(true)
    void createPackagingMaterial({
      code,
      name,
      kind,
      unitCostVnd: unitCost,
      maxReuseCycles: cycles,
      reusable: data.get('reusable') === 'on',
      lengthCm: lengthCm ?? undefined,
      widthCm: widthCm ?? undefined,
      heightCm: heightCm ?? undefined,
      matchMaterialType: match || undefined,
      tareG: tareG ?? undefined,
      maxLoadG: maxLoadG ?? undefined,
    })
      .then(() => onDone(tx(vi, 'Đã thêm vật liệu.', 'Material added.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={tx(vi, 'Thêm vật liệu', 'Add material')} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <p className="text-xs text-ink-muted">
          {tx(
            vi,
            'Thùng muốn engine xếp vào phải khai ở tab Thùng (mm). Form này ghi tồn và đơn giá theo cm.',
            'Boxes the packer can choose must be declared on the Boxes tab in millimetres. This form records stock and cost in centimetres.',
          )}
        </p>
        <Field label={tx(vi, 'Loại', 'Kind')}>
          <select
            className={fieldClass}
            value={kind}
            onChange={(event) => setKind(event.target.value as PackagingMaterialKind)}
          >
            <option value="box">{tx(vi, 'Thùng', 'Box')}</option>
            <option value="cushioning">{tx(vi, 'Vật liệu chống sốc', 'Shock protection')}</option>
            <option value="mailer">{tx(vi, 'Túi niêm phong', 'Mailer')}</option>
          </select>
        </Field>
        <Field label={tx(vi, 'Mã', 'Code')}>
          <Input name="code" className={fieldClass} required maxLength={20} />
        </Field>
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} required minLength={2} maxLength={120} />
        </Field>
        {kind === 'box' ? (
          <div className="grid grid-cols-3 gap-2">
            <Field label={tx(vi, 'Dài cm', 'L cm')}>
              <Input name="length" className={fieldClass} inputMode="numeric" />
            </Field>
            <Field label={tx(vi, 'Rộng cm', 'W cm')}>
              <Input name="width" className={fieldClass} inputMode="numeric" />
            </Field>
            <Field label={tx(vi, 'Cao cm', 'H cm')}>
              <Input name="height" className={fieldClass} inputMode="numeric" />
            </Field>
          </div>
        ) : kind === 'mailer' ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx(vi, 'Rộng cm (trải phẳng)', 'Flat width cm')}>
              <Input name="width" className={fieldClass} inputMode="numeric" />
            </Field>
            <Field label={tx(vi, 'Dài cm (trải phẳng)', 'Flat length cm')}>
              <Input name="length" className={fieldClass} inputMode="numeric" />
            </Field>
            <Field label={tx(vi, 'Khối lượng túi (g)', 'Bag weight (g)')}>
              <Input name="tare" className={fieldClass} inputMode="numeric" />
            </Field>
            <Field label={tx(vi, 'Tải tối đa (g, có thể trống)', 'Max load (g, optional)')}>
              <Input name="maxLoad" className={fieldClass} inputMode="numeric" />
            </Field>
          </div>
        ) : (
          <Field label={tx(vi, 'Mã loại khớp luật', 'Match type')}>
            <select name="match" className={fieldClass} defaultValue="bubble_wrap">
              {CUSHION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={tx(vi, 'Đơn giá (đ)', 'Unit cost')}>
          <Input name="unitCost" className={fieldClass} inputMode="numeric" defaultValue="0" />
        </Field>
        {kind === 'mailer' ? (
          <input type="hidden" name="cycles" value="1" />
        ) : (
          <>
            <Field label={tx(vi, 'Số lần dùng lại tối đa', 'Max reuse cycles')}>
              <Input name="cycles" className={fieldClass} inputMode="numeric" defaultValue="3" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="reusable" defaultChecked />
              {tx(vi, 'Cho phép tái sử dụng', 'Reusable')}
            </label>
          </>
        )}
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function EditMaterialDialog({
  vi,
  item,
  onClose,
  onDone,
}: {
  vi: boolean
  item: PackagingMaterialStock
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const unitCost = nonNegativeInt(String(data.get('unitCost') ?? ''))
    const cycles = positiveInt(String(data.get('cycles') ?? ''))
    if (name.length < 2 || unitCost === null || cycles === null) {
      setError(tx(vi, 'Tên, đơn giá hoặc số lần dùng lại chưa hợp lệ.', 'Name, cost or reuse cycles are invalid.'))
      return
    }
    setBusy(true)
    void updatePackagingMaterial(item.code, {
      name,
      unitCostVnd: unitCost,
      maxReuseCycles: cycles,
      reusable: data.get('reusable') === 'on',
    })
      .then(() => onDone(tx(vi, 'Đã cập nhật.', 'Updated.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={`${tx(vi, 'Sửa', 'Edit')} ${item.code}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} defaultValue={item.name} required />
        </Field>
        <Field label={tx(vi, 'Đơn giá (đ)', 'Unit cost')}>
          <Input name="unitCost" className={fieldClass} defaultValue={String(item.unitCostVnd)} />
        </Field>
        <Field label={tx(vi, 'Số lần dùng lại', 'Reuse cycles')}>
          <Input name="cycles" className={fieldClass} defaultValue={String(item.maxReuseCycles)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="reusable" defaultChecked={item.reusable} />
          {tx(vi, 'Cho phép tái sử dụng', 'Reusable')}
        </label>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function StockActionDialog({
  vi,
  mode,
  item,
  onClose,
  onDone,
}: {
  vi: boolean
  mode: 'purchase' | 'internal'
  item: PackagingMaterialStock
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const internal = mode === 'internal'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const quantity = positiveInt(String(data.get('quantity') ?? ''))
    const note = String(data.get('note') ?? '').trim()
    if (quantity === null) {
      setError(tx(vi, 'Số lượng phải là số nguyên dương.', 'Quantity must be a positive integer.'))
      return
    }
    if (internal && note.length < 3) {
      setError(tx(vi, 'Mục đích xuất nội bộ cần ít nhất 3 ký tự.', 'Internal-use purpose needs at least 3 characters.'))
      return
    }
    setBusy(true)
    const action = internal
      ? internalUsePackagingMaterial(item.code, quantity, note)
      : purchasePackagingMaterial(item.code, quantity, note)
    void action
      .then(() =>
        onDone(
          internal
            ? tx(vi, 'Đã xuất nội bộ.', 'Issued for internal use.')
            : tx(vi, 'Đã nhập hàng mới.', 'New stock received.'),
        ),
      )
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog
      title={
        internal
          ? `${tx(vi, 'Xuất nội bộ', 'Internal use')} ${item.code}`
          : `${tx(vi, 'Nhập mới', 'Receive')} ${item.code}`
      }
      onClose={onClose}
    >
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <p className="text-xs text-ink-muted">
          {internal
            ? tx(vi, `Nội bộ đang có ${item.qtyInternal}.`, `Internal stock is ${item.qtyInternal}.`)
            : tx(vi, `Tồn mới đang là ${item.qtyNew}.`, `New stock is ${item.qtyNew}.`)}
        </p>
        <Field label={tx(vi, 'Số lượng', 'Quantity')}>
          <Input name="quantity" className={fieldClass} inputMode="numeric" required />
        </Field>
        <Field label={internal ? tx(vi, 'Mục đích', 'Purpose') : tx(vi, 'Ghi chú', 'Note')}>
          <Input name="note" className={fieldClass} />
        </Field>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Xác nhận', 'Confirm')}
        </Button>
      </form>
    </Dialog>
  )
}

function BoxesPanel({ vi, access }: { vi: boolean; access: Access }) {
  const [rows, setRows] = useState<PackagingBox[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<
    | 'create'
    | { kind: 'stock' | 'edit' | 'ledger'; item: PackagingBox }
    | null
  >(null)
  const [ledger, setLedger] = useState<CatalogMovement[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listPackagingBoxes(!showInactive))
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void listPackagingBoxes(!showInactive)
      .then((next) => {
        if (!cancelled) {
          setRows(next)
          setError('')
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

  async function openLedger(item: PackagingBox) {
    setDialog({ kind: 'ledger', item })
    setLedger([])
    setBusy(true)
    try {
      setLedger(await listBoxMovements(item.id))
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <Banner error={error} notice={notice} />
      <Toolbar
        vi={vi}
        loading={loading}
        showInactive={showInactive}
        onToggle={setShowInactive}
        onReload={() => void load()}
        onCreate={access.canManage ? () => setDialog('create') : undefined}
        createLabel={tx(vi, 'Thêm thùng', 'Add box')}
      />
      <CatalogTable
        vi={vi}
        loading={loading}
        empty={tx(vi, 'Chưa có thùng.', 'No boxes yet.')}
        headers={[
          tx(vi, 'Mã', 'Code'),
          tx(vi, 'Đường kính trong (mm)', 'Inner mm'),
          tx(vi, 'Tồn/Giữ/Còn', 'On hand / held / free'),
          tx(vi, 'Trạng thái', 'Status'),
          '',
        ]}
      >
        {rows.map((item) => (
          <tr key={item.id} className="border-t border-hairline">
            <td className="px-3 py-2">
              <div className="font-medium text-ink">{item.code}</div>
              <div className="text-xs text-ink-muted">{item.name}</div>
            </td>
            <td className="px-3 py-2">
              {item.inner.lengthMm}×{item.inner.widthMm}×{item.inner.heightMm}
            </td>
            <td className="px-3 py-2">
              {item.quantityOnHand}/{item.reserved}/{item.available}
            </td>
            <td className="px-3 py-2">
              <Badge tone={stockTone(item.stockStatus)}>{stockLabel(item.stockStatus, vi)}</Badge>
            </td>
            <td className="px-3 py-2">
              <RowActions
                vi={vi}
                canStock={access.canStock}
                canManage={access.canManage}
                canLedger={access.canSeeEngineLedger}
                active={item.isActive}
                onLedger={() => void openLedger(item)}
                onStock={() => setDialog({ kind: 'stock', item })}
                onEdit={() => setDialog({ kind: 'edit', item })}
              />
            </td>
          </tr>
        ))}
      </CatalogTable>
      {dialog === 'create' ? (
        <BoxForm
          vi={vi}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'stock' ? (
        <QuantityDialog
          vi={vi}
          title={`${tx(vi, 'Nhập thùng', 'Receive boxes')} ${dialog.item.code}`}
          onClose={() => setDialog(null)}
          onSubmit={(quantity, note) => stockInPackagingBox(dialog.item.id, quantity, note)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'edit' ? (
        <BoxEditForm
          vi={vi}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'ledger' ? (
        <Dialog title={`${tx(vi, 'Sổ', 'Ledger')} ${dialog.item.code}`} onClose={() => setDialog(null)}>
          <MovementTable vi={vi} rows={ledger} busy={busy} />
        </Dialog>
      ) : null}
    </section>
  )
}

function BagsPanel({ vi, access }: { vi: boolean; access: Access }) {
  const [rows, setRows] = useState<PackagingBag[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<
    'create' | { kind: 'stock' | 'edit'; item: PackagingBag } | null
  >(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listPackagingBags(!showInactive))
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void listPackagingBags(!showInactive)
      .then((next) => {
        if (!cancelled) {
          setRows(next)
          setError('')
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

  return (
    <section className="space-y-3">
      <Banner error={error} notice={notice} />
      <Toolbar
        vi={vi}
        loading={loading}
        showInactive={showInactive}
        onToggle={setShowInactive}
        onReload={() => void load()}
        onCreate={access.canManage ? () => setDialog('create') : undefined}
        createLabel={tx(vi, 'Thêm túi', 'Add bag')}
      />
      <CatalogTable
        vi={vi}
        loading={loading}
        empty={tx(vi, 'Chưa có túi zip.', 'No zip bags yet.')}
        headers={[
          tx(vi, 'Mã', 'Code'),
          tx(vi, 'Khổ trải (mm)', 'Flat size mm'),
          tx(vi, 'Tồn', 'On hand'),
          tx(vi, 'Ngưỡng', 'Reorder'),
          '',
        ]}
      >
        {rows.map((item) => (
          <tr key={item.id} className="border-t border-hairline">
            <td className="px-3 py-2">
              <div className="font-medium text-ink">{item.code}</div>
              <div className="text-xs text-ink-muted">
                {item.name}
                {!item.isActive ? ` · ${tx(vi, 'đã tắt', 'off')}` : ''}
              </div>
            </td>
            <td className="px-3 py-2">
              {item.widthMm}×{item.lengthMm}
            </td>
            <td className="px-3 py-2">{item.quantityOnHand}</td>
            <td className="px-3 py-2">{item.reorderLevel}</td>
            <td className="px-3 py-2">
              <RowActions
                vi={vi}
                canStock={access.canStock}
                canManage={access.canManage}
                canLedger={false}
                active={item.isActive}
                onStock={() => setDialog({ kind: 'stock', item })}
                onEdit={() => setDialog({ kind: 'edit', item })}
              />
            </td>
          </tr>
        ))}
      </CatalogTable>
      {dialog === 'create' ? (
        <BagForm
          vi={vi}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'stock' ? (
        <QuantityDialog
          vi={vi}
          title={`${tx(vi, 'Nhập túi', 'Receive bags')} ${dialog.item.code}`}
          onClose={() => setDialog(null)}
          onSubmit={(quantity, note) => stockInPackagingBag(dialog.item.id, quantity, note)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'edit' ? (
        <BagEditForm
          vi={vi}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
    </section>
  )
}

function CushionsPanel({ vi, access }: { vi: boolean; access: Access }) {
  const [rows, setRows] = useState<CushionMaterial[]>([])
  const [rules, setRules] = useState<MaterialRules | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<
    'create' | { kind: 'stock' | 'edit' | 'ledger'; item: CushionMaterial } | null
  >(null)
  const [ledger, setLedger] = useState<CatalogMovement[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [materials, ruleSet] = await Promise.all([
        listCushionMaterials(!showInactive),
        getMaterialRules(),
      ])
      setRows(materials)
      setRules(ruleSet)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([listCushionMaterials(!showInactive), getMaterialRules()])
      .then(([materials, ruleSet]) => {
        if (!cancelled) {
          setRows(materials)
          setRules(ruleSet)
          setError('')
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

  return (
    <section className="space-y-4">
      <Banner error={error} notice={notice} />
      <Toolbar
        vi={vi}
        loading={loading}
        showInactive={showInactive}
        onToggle={setShowInactive}
        onReload={() => void load()}
        onCreate={access.canManage ? () => setDialog('create') : undefined}
        createLabel={tx(vi, 'Thêm vật liệu chống sốc', 'Add shock protection')}
      />
      <CatalogTable
        vi={vi}
        loading={loading}
        empty={tx(vi, 'Chưa có vật liệu chống sốc.', 'No shock protection yet.')}
        headers={[
          tx(vi, 'Mã', 'Code'),
          tx(vi, 'Loại', 'Type'),
          tx(vi, 'Tồn', 'On hand'),
          tx(vi, 'Mới/Tái sử dụng', 'New / reused'),
          '',
        ]}
      >
        {rows.map((item) => (
          <tr key={item.id} className="border-t border-hairline">
            <td className="px-3 py-2">
              <div className="font-medium text-ink">{item.code}</div>
              <div className="text-xs text-ink-muted">{item.name}</div>
            </td>
            <td className="px-3 py-2">
              {item.type}
              <div className="text-xs text-ink-muted">
                <Badge tone={stockTone(item.stockStatus)}>{stockLabel(item.stockStatus, vi)}</Badge>
              </div>
            </td>
            <td className="px-3 py-2">{item.quantityOnHand}</td>
            <td className="px-3 py-2">
              {item.quantityNew}/{item.quantityReused}
            </td>
            <td className="px-3 py-2">
              <RowActions
                vi={vi}
                canStock={access.canStock}
                canManage={access.canManage}
                canLedger={access.canSeeEngineLedger}
                active={item.isActive}
                onLedger={() => {
                  setDialog({ kind: 'ledger', item })
                  setBusy(true)
                  void listCushionMovements(item.id)
                    .then(setLedger)
                    .catch((err: unknown) => setError(formatApiError(err)))
                    .finally(() => setBusy(false))
                }}
                onStock={() => setDialog({ kind: 'stock', item })}
                onEdit={() => setDialog({ kind: 'edit', item })}
              />
            </td>
          </tr>
        ))}
      </CatalogTable>
      {rules ? (
        <RulesEditor
          key={`${rules.version ?? 'default'}-${rules.rules.length}`}
          vi={vi}
          canManage={access.canManage}
          rules={rules}
          onSaved={(message) => {
            setNotice(message)
            void load()
          }}
          onError={setError}
        />
      ) : null}
      {dialog === 'create' ? (
        <CushionForm
          vi={vi}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'stock' ? (
        <QuantityDialog
          vi={vi}
          title={`${tx(vi, 'Nhập vật liệu chống sốc', 'Receive')} ${dialog.item.code}`}
          onClose={() => setDialog(null)}
          onSubmit={(quantity, note) => stockInCushionMaterial(dialog.item.id, quantity, note)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'edit' ? (
        <CushionEditForm
          vi={vi}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice(message)
            setDialog(null)
            void load()
          }}
        />
      ) : null}
      {dialog && dialog !== 'create' && dialog.kind === 'ledger' ? (
        <Dialog title={`${tx(vi, 'Sổ', 'Ledger')} ${dialog.item.code}`} onClose={() => setDialog(null)}>
          <MovementTable vi={vi} rows={ledger} busy={busy} />
        </Dialog>
      ) : null}
    </section>
  )
}

function Toolbar({
  vi,
  loading,
  showInactive,
  onToggle,
  onReload,
  onCreate,
  createLabel,
}: {
  vi: boolean
  loading: boolean
  showInactive: boolean
  onToggle: (value: boolean) => void
  onReload: () => void
  onCreate?: () => void
  createLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {tx(vi, 'Hiện mục đã tắt', 'Show inactive')}
      </label>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onReload} disabled={loading}>
          <RefreshCw className="mr-1 size-4" />
          {tx(vi, 'Tải lại', 'Reload')}
        </Button>
        {onCreate ? (
          <Button onClick={onCreate}>
            <Plus className="mr-1 size-4" />
            {createLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function CatalogTable({
  loading,
  empty,
  headers,
  children,
  vi,
}: {
  loading: boolean
  empty: string
  headers: string[]
  children: ReactNode
  vi: boolean
}) {
  const childCount = useMemo(() => {
    return Array.isArray(children) ? children.length : children ? 1 : 0
  }, [children])
  return (
    <div className="overflow-auto rounded-xl border border-hairline bg-surface-1">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-hairline text-xs text-ink-muted">
          <tr>
            {headers.map((header) => (
              <th key={header || 'actions'} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-ink-muted">
                {tx(vi, 'Đang tải…', 'Loading…')}
              </td>
            </tr>
          ) : null}
          {!loading && childCount === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-ink-muted">
                {empty}
              </td>
            </tr>
          ) : null}
          {children}
        </tbody>
      </table>
    </div>
  )
}

function RowActions({
  vi,
  canStock,
  canManage,
  canLedger,
  active,
  onLedger,
  onStock,
  onEdit,
}: {
  vi: boolean
  canStock: boolean
  canManage: boolean
  canLedger: boolean
  active: boolean
  onLedger?: () => void
  onStock: () => void
  onEdit: () => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {canLedger && onLedger ? (
        <Button variant="ghost" onClick={onLedger}>
          {tx(vi, 'Sổ', 'Ledger')}
        </Button>
      ) : null}
      {canStock && active ? (
        <Button variant="secondary" onClick={onStock}>
          {tx(vi, 'Nhập', 'Receive')}
        </Button>
      ) : null}
      {canManage ? (
        <Button variant="ghost" onClick={onEdit}>
          {tx(vi, 'Sửa', 'Edit')}
        </Button>
      ) : null}
    </div>
  )
}

function QuantityDialog({
  vi,
  title,
  onClose,
  onSubmit,
  onDone,
}: {
  vi: boolean
  title: string
  onClose: () => void
  onSubmit: (quantity: number, note?: string) => Promise<unknown>
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const quantity = positiveInt(String(data.get('quantity') ?? ''))
    if (quantity === null) {
      setError(tx(vi, 'Số lượng phải là số nguyên dương.', 'Quantity must be a positive integer.'))
      return
    }
    setBusy(true)
    void onSubmit(quantity, String(data.get('note') ?? ''))
      .then(() => onDone(tx(vi, 'Đã nhập kho.', 'Stock received.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Số lượng', 'Quantity')}>
          <Input name="quantity" className={fieldClass} inputMode="numeric" required />
        </Field>
        <Field label={tx(vi, 'Ghi chú', 'Note')}>
          <Input name="note" className={fieldClass} />
        </Field>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Xác nhận', 'Confirm')}
        </Button>
      </form>
    </Dialog>
  )
}

function mmFields(key: 'in' | 'out', label: string) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Field label={`${label} L`}>
        <Input name={`${key}-l`} className={fieldClass} inputMode="numeric" required />
      </Field>
      <Field label={`${label} W`}>
        <Input name={`${key}-w`} className={fieldClass} inputMode="numeric" required />
      </Field>
      <Field label={`${label} H`}>
        <Input name={`${key}-h`} className={fieldClass} inputMode="numeric" required />
      </Field>
    </div>
  )
}

function readSize(
  data: FormData,
  prefix: string,
): { lengthMm: number; widthMm: number; heightMm: number } | null {
  const lengthMm = positiveInt(String(data.get(`${prefix}-l`) ?? ''))
  const widthMm = positiveInt(String(data.get(`${prefix}-w`) ?? ''))
  const heightMm = positiveInt(String(data.get(`${prefix}-h`) ?? ''))
  if (lengthMm === null || widthMm === null || heightMm === null) return null
  return { lengthMm, widthMm, heightMm }
}

function BoxForm({
  vi,
  onClose,
  onDone,
}: {
  vi: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const inner = readSize(data, 'in')
    const outer = readSize(data, 'out')
    const tare = nonNegativeInt(String(data.get('tare') ?? '0'))
    const load = positiveInt(String(data.get('load') ?? ''))
    const priceRaw = String(data.get('price') ?? '').trim()
    const price = priceRaw === '' ? null : nonNegativeInt(priceRaw)
    if (!inner || !outer || tare === null || load === null || (priceRaw !== '' && price === null)) {
      setError(tx(vi, 'Kiểm tra lại số đo, bì, tải và giá.', 'Check sizes, tare, load and price.'))
      return
    }
    setBusy(true)
    void createPackagingBox({
      code: String(data.get('code') ?? ''),
      name: String(data.get('name') ?? ''),
      inner,
      outer,
      tareG: tare,
      maxLoadG: load,
      priceVnd: price,
      reorderLevel: positiveInt(String(data.get('reorder') ?? '')) ?? undefined,
      storageLocation: String(data.get('location') ?? ''),
    })
      .then(() => onDone(tx(vi, 'Đã thêm thùng.', 'Box added.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={tx(vi, 'Thêm thùng', 'Add box')} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Mã', 'Code')}>
          <Input name="code" className={fieldClass} required />
        </Field>
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} required />
        </Field>
        {mmFields('in', tx(vi, 'Đường kính trong (mm)', 'Inner mm'))}
        {mmFields('out', tx(vi, 'Đường kính ngoài (mm)', 'Outer mm'))}
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx(vi, 'Bì (g)', 'Tare g')}>
            <Input name="tare" className={fieldClass} defaultValue="0" />
          </Field>
          <Field label={tx(vi, 'Tải tối đa (g)', 'Max load g')}>
            <Input name="load" className={fieldClass} required />
          </Field>
        </div>
        <Field label={tx(vi, 'Giá (đ)', 'Price')}>
          <Input name="price" className={fieldClass} />
        </Field>
        <Field label={tx(vi, 'Ngưỡng cảnh báo', 'Reorder level')}>
          <Input name="reorder" className={fieldClass} defaultValue="10" />
        </Field>
        <Field label={tx(vi, 'Vị trí để', 'Storage')}>
          <Input name="location" className={fieldClass} />
        </Field>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function BoxEditForm({
  vi,
  item,
  onClose,
  onDone,
}: {
  vi: boolean
  item: PackagingBox
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const priceRaw = String(data.get('price') ?? '').trim()
    const price = priceRaw === '' ? null : nonNegativeInt(priceRaw)
    const reorder = nonNegativeInt(String(data.get('reorder') ?? '0'))
    if ((priceRaw !== '' && price === null) || reorder === null) {
      setError(tx(vi, 'Giá hoặc ngưỡng chưa hợp lệ.', 'Price or reorder level is invalid.'))
      return
    }
    setBusy(true)
    void updatePackagingBox(item.id, {
      name: String(data.get('name') ?? ''),
      priceVnd: price,
      reorderLevel: reorder,
      storageLocation: String(data.get('location') ?? '') || null,
      isActive: data.get('active') === 'on',
    })
      .then(() => onDone(tx(vi, 'Đã cập nhật thùng.', 'Box updated.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={`${tx(vi, 'Sửa thùng', 'Edit box')} ${item.code}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} defaultValue={item.name} required />
        </Field>
        <Field label={tx(vi, 'Giá (đ)', 'Price')}>
          <Input name="price" className={fieldClass} defaultValue={item.priceVnd ?? ''} />
        </Field>
        <Field label={tx(vi, 'Ngưỡng cảnh báo', 'Reorder level')}>
          <Input name="reorder" className={fieldClass} defaultValue={String(item.reorderLevel)} />
        </Field>
        <Field label={tx(vi, 'Vị trí để', 'Storage')}>
          <Input name="location" className={fieldClass} defaultValue={item.storageLocation ?? ''} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="active" defaultChecked={item.isActive} />
          {tx(vi, 'Đang dùng', 'Active')}
        </label>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function BagForm({
  vi,
  onClose,
  onDone,
}: {
  vi: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const width = positiveInt(String(data.get('width') ?? ''))
    const length = positiveInt(String(data.get('length') ?? ''))
    const priceRaw = String(data.get('price') ?? '').trim()
    const price = priceRaw === '' ? null : nonNegativeInt(priceRaw)
    if (width === null || length === null || (priceRaw !== '' && price === null)) {
      setError(tx(vi, 'Rộng, dài hoặc giá chưa hợp lệ.', 'Width, length or price is invalid.'))
      return
    }
    setBusy(true)
    void createPackagingBag({
      code: String(data.get('code') ?? ''),
      name: String(data.get('name') ?? ''),
      widthMm: width,
      lengthMm: length,
      priceVnd: price,
      reorderLevel: positiveInt(String(data.get('reorder') ?? '')) ?? undefined,
    })
      .then(() => onDone(tx(vi, 'Đã thêm túi.', 'Bag added.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={tx(vi, 'Thêm túi zip', 'Add zip bag')} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Mã', 'Code')}>
          <Input name="code" className={fieldClass} required />
        </Field>
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx(vi, 'Rộng mm', 'Width mm')}>
            <Input name="width" className={fieldClass} required />
          </Field>
          <Field label={tx(vi, 'Dài mm', 'Length mm')}>
            <Input name="length" className={fieldClass} required />
          </Field>
        </div>
        <Field label={tx(vi, 'Giá (đ)', 'Price')}>
          <Input name="price" className={fieldClass} />
        </Field>
        <Field label={tx(vi, 'Ngưỡng cảnh báo', 'Reorder level')}>
          <Input name="reorder" className={fieldClass} defaultValue="10" />
        </Field>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function BagEditForm({
  vi,
  item,
  onClose,
  onDone,
}: {
  vi: boolean
  item: PackagingBag
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const width = positiveInt(String(data.get('width') ?? ''))
    const length = positiveInt(String(data.get('length') ?? ''))
    const priceRaw = String(data.get('price') ?? '').trim()
    const price = priceRaw === '' ? null : nonNegativeInt(priceRaw)
    const reorder = nonNegativeInt(String(data.get('reorder') ?? '0'))
    if (width === null || length === null || reorder === null || (priceRaw !== '' && price === null)) {
      setError(tx(vi, 'Số đo hoặc giá chưa hợp lệ.', 'Size or price is invalid.'))
      return
    }
    setBusy(true)
    void updatePackagingBag(item.id, {
      name: String(data.get('name') ?? ''),
      widthMm: width,
      lengthMm: length,
      priceVnd: price,
      reorderLevel: reorder,
      isActive: data.get('active') === 'on',
    })
      .then(() => onDone(tx(vi, 'Đã cập nhật túi.', 'Bag updated.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={`${tx(vi, 'Sửa túi', 'Edit bag')} ${item.code}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} defaultValue={item.name} required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx(vi, 'Rộng mm', 'Width mm')}>
            <Input name="width" className={fieldClass} defaultValue={String(item.widthMm)} />
          </Field>
          <Field label={tx(vi, 'Dài mm', 'Length mm')}>
            <Input name="length" className={fieldClass} defaultValue={String(item.lengthMm)} />
          </Field>
        </div>
        <Field label={tx(vi, 'Giá (đ)', 'Price')}>
          <Input name="price" className={fieldClass} defaultValue={item.priceVnd ?? ''} />
        </Field>
        <Field label={tx(vi, 'Ngưỡng', 'Reorder')}>
          <Input name="reorder" className={fieldClass} defaultValue={String(item.reorderLevel)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="active" defaultChecked={item.isActive} />
          {tx(vi, 'Đang dùng', 'Active')}
        </label>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function CushionForm({
  vi,
  onClose,
  onDone,
}: {
  vi: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const weight = nonNegativeInt(String(data.get('weight') ?? '0'))
    const price = nonNegativeInt(String(data.get('price') ?? '0'))
    const type = String(data.get('type') ?? '') as CushionMaterialType
    if (weight === null || price === null || !CUSHION_TYPES.includes(type)) {
      setError(tx(vi, 'Khối lượng, giá hoặc loại chưa hợp lệ.', 'Weight, price or type is invalid.'))
      return
    }
    setBusy(true)
    void createCushionMaterial({
      code: String(data.get('code') ?? ''),
      name: String(data.get('name') ?? ''),
      type,
      unit: String(data.get('unit') ?? 'cái'),
      weightGPerUnit: weight,
      priceVndPerUnit: price,
      reorderLevel: positiveInt(String(data.get('reorder') ?? '')) ?? undefined,
      storageLocation: String(data.get('location') ?? ''),
      reusable: data.get('reusable') === 'on',
    })
      .then(() => onDone(tx(vi, 'Đã thêm vật liệu chống sốc.', 'Shock protection added.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={tx(vi, 'Thêm vật liệu chống sốc', 'Add shock protection')} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Mã', 'Code')}>
          <Input name="code" className={fieldClass} required />
        </Field>
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} required />
        </Field>
        <Field label={tx(vi, 'Loại', 'Type')}>
          <select name="type" className={fieldClass} defaultValue="bubble_wrap">
            {CUSHION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tx(vi, 'Đơn vị', 'Unit')}>
          <Input name="unit" className={fieldClass} defaultValue="cái" required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx(vi, 'Gram / đơn vị', 'Grams / unit')}>
            <Input name="weight" className={fieldClass} defaultValue="1" />
          </Field>
          <Field label={tx(vi, 'Giá / đơn vị', 'Price / unit')}>
            <Input name="price" className={fieldClass} defaultValue="0" />
          </Field>
        </div>
        <Field label={tx(vi, 'Ngưỡng', 'Reorder')}>
          <Input name="reorder" className={fieldClass} defaultValue="10" />
        </Field>
        <Field label={tx(vi, 'Vị trí để', 'Storage')}>
          <Input name="location" className={fieldClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="reusable" />
          {tx(vi, 'Thu hồi được khi kiểm hàng hoàn', 'Recoverable on return inspection')}
        </label>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function CushionEditForm({
  vi,
  item,
  onClose,
  onDone,
}: {
  vi: boolean
  item: CushionMaterial
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const weight = nonNegativeInt(String(data.get('weight') ?? '0'))
    const price = nonNegativeInt(String(data.get('price') ?? '0'))
    const reorder = nonNegativeInt(String(data.get('reorder') ?? '0'))
    if (weight === null || price === null || reorder === null) {
      setError(tx(vi, 'Số liệu chưa hợp lệ.', 'Numbers are invalid.'))
      return
    }
    setBusy(true)
    void updateCushionMaterial(item.id, {
      name: String(data.get('name') ?? ''),
      unit: String(data.get('unit') ?? ''),
      weightGPerUnit: weight,
      priceVndPerUnit: price,
      reorderLevel: reorder,
      storageLocation: String(data.get('location') ?? '') || null,
      reusable: data.get('reusable') === 'on',
      isActive: data.get('active') === 'on',
    })
      .then(() => onDone(tx(vi, 'Đã cập nhật vật liệu chống sốc.', 'Shock protection updated.')))
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={`${tx(vi, 'Sửa', 'Edit')} ${item.code}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Banner error={error} notice="" />
        <Field label={tx(vi, 'Tên', 'Name')}>
          <Input name="name" className={fieldClass} defaultValue={item.name} required />
        </Field>
        <Field label={tx(vi, 'Đơn vị', 'Unit')}>
          <Input name="unit" className={fieldClass} defaultValue={item.unit} required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx(vi, 'Gram / đơn vị', 'Grams / unit')}>
            <Input name="weight" className={fieldClass} defaultValue={String(item.weightGPerUnit)} />
          </Field>
          <Field label={tx(vi, 'Giá / đơn vị', 'Price / unit')}>
            <Input name="price" className={fieldClass} defaultValue={String(item.priceVndPerUnit)} />
          </Field>
        </div>
        <Field label={tx(vi, 'Ngưỡng', 'Reorder')}>
          <Input name="reorder" className={fieldClass} defaultValue={String(item.reorderLevel)} />
        </Field>
        <Field label={tx(vi, 'Vị trí để', 'Storage')}>
          <Input name="location" className={fieldClass} defaultValue={item.storageLocation ?? ''} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="reusable" defaultChecked={item.reusable} />
          {tx(vi, 'Thu hồi được', 'Recoverable')}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="active" defaultChecked={item.isActive} />
          {tx(vi, 'Đang dùng', 'Active')}
        </label>
        <Button type="submit" disabled={busy}>
          {tx(vi, 'Lưu', 'Save')}
        </Button>
      </form>
    </Dialog>
  )
}

function RulesEditor({
  vi,
  canManage,
  rules,
  onSaved,
  onError,
}: {
  vi: boolean
  canManage: boolean
  rules: MaterialRules
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [draft, setDraft] = useState<MaterialRule[]>(rules.rules)
  const [busy, setBusy] = useState(false)

  function updateRow(index: number, patch: Partial<MaterialRule>) {
    setDraft((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }

  function save() {
    const payload = draft.map((rule) => ({
      ...rule,
      quantity: Math.max(0, Math.floor(rule.quantity) || 0),
      minUnits: Math.max(1, Math.floor(rule.minUnits) || 1),
      voidBands:
        rule.basis === 'void_band' && rule.voidBands.length === 0
          ? [{ minVoidRatio: 0.5, quantity: 2 }]
          : rule.voidBands,
    }))
    setBusy(true)
    void saveMaterialRules(payload)
      .then(() => onSaved(tx(vi, 'Đã lưu vật tư.', 'Material rules saved.')))
      .catch((err: unknown) => onError(formatApiError(err)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {tx(vi, 'Luật chọn vật tư', 'Material rules')}
          </h2>
          <p className="text-xs text-ink-muted">
            {rules.isDefault
              ? tx(vi, 'Đang dùng luật mặc định.', 'Using the default rules.')
              : tx(vi, `Phiên bản ${rules.version ?? '—'}`, `Version ${rules.version ?? '—'}`)}
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  {
                    materialType: 'bubble_wrap',
                    appliesTo: 'any',
                    minUnits: 1,
                    basis: 'per_carton',
                    quantity: 1,
                    voidBands: [],
                  },
                ])
              }
            >
              {tx(vi, 'Thêm dòng', 'Add row')}
            </Button>
            <Button onClick={save} disabled={busy}>
              {tx(vi, 'Lưu', 'Save rules')}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1">{tx(vi, 'Loại', 'Type')}</th>
              <th className="py-1">{tx(vi, 'Áp dụng', 'Applies')}</th>
              <th className="py-1">{tx(vi, 'Cách tính', 'Basis')}</th>
              <th className="py-1">{tx(vi, 'Số lượng', 'Qty')}</th>
              <th className="py-1">{tx(vi, 'Từ món', 'Min units')}</th>
              {canManage ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {draft.map((rule, index) => (
              <tr key={`${rule.materialType}-${index}`} className="border-t border-hairline">
                <td className="py-1 pr-2">
                  <select
                    className={fieldClass}
                    disabled={!canManage}
                    value={rule.materialType}
                    onChange={(event) => updateRow(index, { materialType: event.target.value })}
                  >
                    {CUSHION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <select
                    className={fieldClass}
                    disabled={!canManage}
                    value={rule.appliesTo}
                    onChange={(event) => updateRow(index, { appliesTo: event.target.value })}
                  >
                    {RULE_SCOPES.map((scope) => (
                      <option key={scope} value={scope}>
                        {scope}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <select
                    className={fieldClass}
                    disabled={!canManage}
                    value={rule.basis}
                    onChange={(event) => {
                      const basis = event.target.value
                      updateRow(index, {
                        basis,
                        voidBands:
                          basis === 'void_band' && rule.voidBands.length === 0
                            ? [{ minVoidRatio: 0.5, quantity: 2 }]
                            : rule.voidBands,
                      })
                    }}
                  >
                    {RULE_BASES.map((basis) => (
                      <option key={basis} value={basis}>
                        {basis}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  {rule.basis === 'void_band' ? (
                    <div className="flex gap-1">
                      <Input
                        className={fieldClass}
                        disabled={!canManage}
                        title={tx(vi, 'Độ trống tối thiểu (0–1)', 'Minimum void ratio (0–1)')}
                        value={String(rule.voidBands[0]?.minVoidRatio ?? 0.5)}
                        onChange={(event) => {
                          const band = rule.voidBands[0] ?? { minVoidRatio: 0.5, quantity: 2 }
                          updateRow(index, {
                            voidBands: [
                              { ...band, minVoidRatio: Number(event.target.value) || 0 },
                            ],
                          })
                        }}
                      />
                      <Input
                        className={fieldClass}
                        disabled={!canManage}
                        title={tx(vi, 'Số lượng ở dải này', 'Quantity in this band')}
                        value={String(rule.voidBands[0]?.quantity ?? 2)}
                        onChange={(event) => {
                          const band = rule.voidBands[0] ?? { minVoidRatio: 0.5, quantity: 2 }
                          updateRow(index, {
                            voidBands: [{ ...band, quantity: Number(event.target.value) || 0 }],
                          })
                        }}
                      />
                    </div>
                  ) : (
                    <Input
                      className={fieldClass}
                      disabled={!canManage}
                      value={String(rule.quantity)}
                      onChange={(event) =>
                        updateRow(index, { quantity: Number(event.target.value) || 0 })
                      }
                    />
                  )}
                </td>
                <td className="py-1 pr-2">
                  <Input
                    className={fieldClass}
                    disabled={!canManage}
                    value={String(rule.minUnits)}
                    onChange={(event) =>
                      updateRow(index, { minUnits: Number(event.target.value) || 1 })
                    }
                  />
                </td>
                {canManage ? (
                  <td className="py-1">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))
                      }
                    >
                      {tx(vi, 'Xoá', 'Remove')}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
