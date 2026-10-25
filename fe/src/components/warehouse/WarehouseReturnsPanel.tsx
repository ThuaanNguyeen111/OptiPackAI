import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  inspectReturn,
  listQuarantine,
  listReturns,
  receiveReturn,
  resolveQuarantine,
  type PackagingInspectInput,
} from '../../api/returns.api'
import { listShipments, receiveReturnedShipment } from '../../api/shipments.api'
import type { Shipment } from '../../types/shipments'
import { listWarehouseBinLocations } from '../../api/warehouse.api'
import { formatApiError, getApiErrorCode, getApiErrorDetailList } from '../../lib/api'
import type { BinLocationRecord, WarehouseRecord } from '../../types/warehouse-admin'
import {
  RETURN_STATUS_LABELS,
  RETURN_TYPE_LABELS,
  type QuarantineLine,
  type ReturnRequest,
} from '../../types/returns'

type InspectDraft = {
  sellerSku: string
  quantity: number
  result: 'restock' | 'quarantine' | 'discard'
  binLocationId: string
}

type QueueMode = 'awaiting_receipt' | 'received' | 'quarantine'

function shortId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id
}

function otherBinMessage(err: unknown, vi: boolean): string | null {
  if (getApiErrorCode(err) !== 'WH_SKU_IN_OTHER_BIN') return null
  const codes = [
    ...getApiErrorDetailList(err, 'binCodes'),
    ...getApiErrorDetailList(err, 'bin_codes'),
  ]
  const listed = codes.length > 0 ? ` (${codes.join(', ')})` : ''
  return vi
    ? `SKU này đã nằm ở ô khác${listed}. Vẫn nhập vào ô đã chọn?`
    : `This SKU is already in another bin${listed}. Stock this bin anyway?`
}

export function WarehouseReturnsPanel({
  vi,
  warehouses,
  warehouseId,
  refreshToken,
  onCounts,
}: {
  vi: boolean
  warehouses: WarehouseRecord[]
  warehouseId: string
  refreshToken: number
  onCounts: (count: number) => void
}) {
  const [mode, setMode] = useState<QueueMode>('awaiting_receipt')
  const [receiptSlips, setReceiptSlips] = useState<ReturnRequest[]>([])
  const [receivedSlips, setReceivedSlips] = useState<ReturnRequest[]>([])
  const [quarantine, setQuarantine] = useState<QuarantineLine[]>([])
  const [returning, setReturning] = useState<Shipment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bins, setBins] = useState<BinLocationRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [receipt, received, held, inbound] = await Promise.all([
        listReturns({ status: 'awaiting_receipt', limit: 100 }),
        listReturns({ status: 'received', limit: 100 }),
        listQuarantine(),
        listShipments({ status: 'returning_to_warehouse', limit: 50 }).catch(() => ({
          items: [] as Shipment[],
          total: 0,
          page: 1,
          limit: 50,
        })),
      ])
      void refreshToken
      setReceiptSlips(receipt.items)
      setReceivedSlips(received.items)
      setQuarantine(held)
      setReturning(inbound.items)
      onCounts(receipt.total + received.total + held.length)
      const next = mode === 'received' ? received.items : receipt.items
      setSelectedId((prev) => {
        if (mode === 'quarantine') return null
        if (prev && next.some((row) => row.id === prev)) return prev
        return next[0]?.id ?? null
      })
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }, [mode, refreshToken, onCounts])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    if (!warehouseId) return
    let cancelled = false
    void listWarehouseBinLocations(warehouseId)
      .then((rows) => {
        if (!cancelled) setBins(rows.filter((row) => row.isActive))
      })
      .catch(() => {
        if (!cancelled) setBins([])
      })
    return () => {
      cancelled = true
    }
  }, [warehouseId])

  const slips = mode === 'received' ? receivedSlips : receiptSlips
  const selected = slips.find((row) => row.id === selectedId) ?? null
  const visibleBins = warehouseId ? bins : []

  async function onReceive(): Promise<void> {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await receiveReturn(selected.id, { expected_version: selected.version })
      setMode('received')
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onInspect(
    drafts: InspectDraft[],
    packaging?: PackagingInspectInput[],
  ): Promise<void> {
    if (!selected) return
    async function send(confirmOtherBin: boolean) {
      if (!selected) return
      await inspectReturn(selected.id, {
        expected_version: selected.version,
        lines: drafts.map((line) => ({
          seller_sku: line.sellerSku,
          quantity: line.quantity,
          result: line.result,
          ...(line.result === 'restock'
            ? {
                warehouse_id: warehouseId,
                bin_location_id: line.binLocationId,
                confirm_other_bin: confirmOtherBin || undefined,
              }
            : {}),
        })),
        ...(packaging && packaging.length > 0 ? { packaging } : {}),
      })
    }
    setBusy(true)
    setError(null)
    try {
      await send(false)
      await load()
    } catch (err: unknown) {
      const prompt = otherBinMessage(err, vi)
      if (prompt && window.confirm(`${formatApiError(err)}\n\n${prompt}`)) {
        try {
          await send(true)
          await load()
        } catch (retryErr: unknown) {
          setError(formatApiError(retryErr))
        }
      } else {
        setError(formatApiError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function onReceiveShipment(shipment: Shipment): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await receiveReturnedShipment(shipment.id, shipment.version)
      await load()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onResolve(
    line: QuarantineLine,
    action: 'restock' | 'discard',
    binLocationId: string,
  ): Promise<void> {
    if (action === 'restock' && !binLocationId) {
      setError(vi ? 'Nhập lại kho phải chọn ô.' : 'Restock needs a bin.')
      return
    }
    async function send(confirmOtherBin: boolean) {
      await resolveQuarantine(line.returnId, line.lineIndex, {
        action,
        ...(action === 'restock'
          ? {
              warehouse_id: warehouseId,
              bin_location_id: binLocationId,
              confirm_other_bin: confirmOtherBin || undefined,
            }
          : {}),
      })
    }
    setBusy(true)
    setError(null)
    try {
      await send(false)
      await load()
    } catch (err: unknown) {
      const prompt = otherBinMessage(err, vi)
      if (prompt && window.confirm(`${formatApiError(err)}\n\n${prompt}`)) {
        try {
          await send(true)
          await load()
        } catch (retryErr: unknown) {
          setError(formatApiError(retryErr))
        }
      } else {
        setError(formatApiError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const modes: { id: QueueMode; vi: string; en: string; count: number }[] = [
    {
      id: 'awaiting_receipt',
      vi: 'Chờ nhận',
      en: 'To receive',
      count: receiptSlips.length,
    },
    {
      id: 'received',
      vi: 'Chờ kiểm',
      en: 'To inspect',
      count: receivedSlips.length,
    },
    {
      id: 'quarantine',
      vi: 'Cách ly',
      en: 'Quarantine',
      count: quarantine.length,
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {vi ? 'Phiếu trả hàng' : 'Return slips'}
          </h2>
          <p className="text-xs text-slate-500">
            {vi
              ? 'Nhận hàng về kho, kiểm từng SKU, rồi xử lý hàng cách ly.'
              : 'Receive the parcel, inspect each SKU, then clear quarantine.'}
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-50 p-0.5 dark:bg-surface-2">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                mode === item.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600'
              }`}
            >
              {vi ? item.vi : item.en}
              {` (${String(item.count)})`}
            </button>
          ))}
        </div>
      </div>

      {warehouses.length > 0 && !warehouseId ? (
        <p className="mt-3 text-xs text-amber-700">
          {vi
            ? 'Chọn kho ở thanh phía trên trước khi nhập lại ô.'
            : 'Pick a warehouse above before restocking a bin.'}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {vi ? 'Đang tải phiếu…' : 'Loading slips…'}
        </p>
      ) : null}
      {returning.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {returning.map((shipment) => (
            <li
              key={shipment.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
            >
              <span className="font-mono">{shipment.shipmentCode || shortId(shipment.id)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onReceiveShipment(shipment)}
                className="h-8 rounded-lg bg-slate-900 px-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {vi ? 'Nhận hàng hoàn' : 'Receive return'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? null : mode === 'quarantine' ? (
        <ul className="mt-4 space-y-2">
          {quarantine.length === 0 ? (
            <li className="text-sm text-slate-500">
              {vi ? 'Không có hàng cách ly.' : 'No quarantined lines.'}
            </li>
          ) : (
            quarantine.map((line) => (
              <QuarantineRow
                key={`${line.returnId}-${String(line.lineIndex)}`}
                vi={vi}
                line={line}
                bins={visibleBins}
                busy={busy}
                onResolve={onResolve}
              />
            ))
          )}
        </ul>
      ) : slips.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {vi ? 'Không có phiếu ở bước này.' : 'No slips in this step.'}
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <ul className="space-y-1">
            {slips.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs ${
                    row.id === selectedId
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="font-mono font-semibold">
                    {row.rmaCode || shortId(row.id)}
                  </span>
                  <span className="mt-0.5 block opacity-70">
                    {RETURN_TYPE_LABELS[row.type]
                      ? vi
                        ? RETURN_TYPE_LABELS[row.type]?.vi
                        : RETURN_TYPE_LABELS[row.type]?.en
                      : row.type}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {RETURN_STATUS_LABELS[selected.status]
                  ? vi
                    ? RETURN_STATUS_LABELS[selected.status]?.vi
                    : RETURN_STATUS_LABELS[selected.status]?.en
                  : selected.status}
                {' · '}
                {shortId(selected.orderGroupId)}
              </p>
              <ul className="space-y-2">
                {selected.items.map((item) => (
                  <li key={item.sellerSku} className="text-sm">
                    <span className="font-mono font-semibold">{item.sellerSku}</span>
                    <span className="text-slate-500"> × {item.quantity}</span>
                    {item.reasonLabel ? (
                      <span className="text-slate-500"> · {item.reasonLabel}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {mode === 'awaiting_receipt' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onReceive()}
                  className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Đã nhận hàng về kho' : 'Mark received'}
                </button>
              ) : (
                <InspectForm
                  key={`${selected.id}:${String(selected.version)}`}
                  vi={vi}
                  items={selected.items}
                  bins={visibleBins}
                  busy={busy}
                  onError={setError}
                  onSubmit={onInspect}
                />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function InspectForm({
  vi,
  items,
  bins,
  busy,
  onError,
  onSubmit,
}: {
  vi: boolean
  items: ReturnRequest['items']
  bins: BinLocationRecord[]
  busy: boolean
  onError: (message: string) => void
  onSubmit: (drafts: InspectDraft[], packaging?: PackagingInspectInput[]) => Promise<void>
}) {
  const [materialCode, setMaterialCode] = useState('')
  const [materialQty, setMaterialQty] = useState(1)
  const [materialGrade, setMaterialGrade] = useState<'A' | 'B' | 'C'>('A')
  const [labelRemoved, setLabelRemoved] = useState(false)
  const [reuseCycle, setReuseCycle] = useState(0)
  const [drafts, setDrafts] = useState<InspectDraft[]>(() =>
    items.map((item) => ({
      sellerSku: item.sellerSku,
      quantity: item.quantity,
      result: 'restock',
      binLocationId: '',
    })),
  )

  return (
    <div className="space-y-2">
      {drafts.map((line, index) => (
        <div key={line.sellerSku} className="grid gap-2 sm:grid-cols-3">
          <p className="self-center font-mono text-xs">{line.sellerSku}</p>
          <select
            value={line.result}
            onChange={(event) =>
              setDrafts((current) =>
                current.map((row, i) =>
                  i === index
                    ? {
                        ...row,
                        result: event.target.value as InspectDraft['result'],
                      }
                    : row,
                ),
              )
            }
            className="h-9 rounded-lg border border-slate-200 px-2 text-xs dark:border-slate-700 dark:bg-surface-2"
          >
            <option value="restock">{vi ? 'Nhập lại ô bán' : 'Restock'}</option>
            <option value="quarantine">{vi ? 'Cách ly' : 'Quarantine'}</option>
            <option value="discard">{vi ? 'Loại bỏ' : 'Discard'}</option>
          </select>
          {line.result === 'restock' ? (
            <select
              value={line.binLocationId}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((row, i) =>
                    i === index
                      ? { ...row, binLocationId: event.target.value }
                      : row,
                  ),
                )
              }
              className="h-9 rounded-lg border border-slate-200 px-2 text-xs dark:border-slate-700 dark:bg-surface-2"
            >
              <option value="">{vi ? 'Chọn ô' : 'Bin'}</option>
              {bins.map((bin) => (
                <option key={bin.id} value={bin.id}>
                  {bin.binCode}
                </option>
              ))}
            </select>
          ) : (
            <span />
          )}
        </div>
      ))}
      <div className="grid gap-2 rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
        <p className="font-semibold">{vi ? 'Thùng / vật tư hoàn (tuỳ chọn)' : 'Returned packaging (optional)'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={materialCode}
            onChange={(event) => setMaterialCode(event.target.value.toUpperCase())}
            placeholder="BOX-M"
            className="h-8 w-24 rounded-lg border border-slate-200 px-2 font-mono dark:border-slate-700 dark:bg-surface-2"
          />
          <input
            type="number"
            min={1}
            value={materialQty}
            onChange={(event) => setMaterialQty(Number(event.target.value) || 1)}
            className="h-8 w-16 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-surface-2"
          />
          <select
            value={materialGrade}
            onChange={(event) => setMaterialGrade(event.target.value as 'A' | 'B' | 'C')}
            className="h-8 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-surface-2"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={labelRemoved}
              onChange={(event) => setLabelRemoved(event.target.checked)}
            />
            {vi ? 'Đã gỡ nhãn cũ' : 'Old label removed'}
          </label>
          <input
            type="number"
            min={0}
            value={reuseCycle}
            onChange={(event) => setReuseCycle(Number(event.target.value) || 0)}
            className="h-8 w-16 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-surface-2"
            title={vi ? 'Số lần tái sử dụng trên nắp' : 'Reuse cycle on the lid'}
          />
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (drafts.some((line) => line.result === 'restock' && !line.binLocationId)) {
            onError(vi ? 'Nhập lại kho phải chọn ô.' : 'Restock needs a bin.')
            return
          }
          const code = materialCode.trim()
          if (code && materialGrade === 'A' && !labelRemoved) {
            onError(vi ? 'Hạng A phải xác nhận đã gỡ nhãn cũ.' : 'Grade A needs the old label removed.')
            return
          }
          const packaging = code
            ? [
                {
                  material_code: code,
                  quantity: materialQty,
                  grade: materialGrade,
                  reuse_cycle_seen: reuseCycle,
                  ...(materialGrade === 'A' ? { old_label_removed: true } : {}),
                },
              ]
            : undefined
          void onSubmit(drafts, packaging)
        }}
        className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        {vi ? 'Lưu kết quả kiểm' : 'Save inspection'}
      </button>
    </div>
  )
}

function QuarantineRow({
  vi,
  line,
  bins,
  busy,
  onResolve,
}: {
  vi: boolean
  line: QuarantineLine
  bins: BinLocationRecord[]
  busy: boolean
  onResolve: (
    line: QuarantineLine,
    action: 'restock' | 'discard',
    binLocationId: string,
  ) => Promise<void>
}) {
  const [binLocationId, setBinLocationId] = useState('')
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
      <span className="font-mono font-semibold">{line.rmaCode || shortId(line.returnId)}</span>
      <span className="font-mono">{line.sellerSku}</span>
      <span>× {line.quantity}</span>
      <select
        value={binLocationId}
        onChange={(event) => setBinLocationId(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-surface-2"
      >
        <option value="">{vi ? 'Ô nhập lại' : 'Restock bin'}</option>
        {bins.map((bin) => (
          <option key={bin.id} value={bin.id}>
            {bin.binCode}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onResolve(line, 'restock', binLocationId)}
        className="h-8 rounded-lg bg-slate-900 px-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {vi ? 'Nhập lại' : 'Restock'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onResolve(line, 'discard', '')}
        className="h-8 rounded-lg border border-slate-300 px-2 font-semibold disabled:opacity-50"
      >
        {vi ? 'Loại bỏ' : 'Discard'}
      </button>
    </li>
  )
}
