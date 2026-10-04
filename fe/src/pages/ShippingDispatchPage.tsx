import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Loader2, Printer, Truck } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { listOrderGroups } from '../api/packaging.api'
import {
  createShipmentBatch,
  getGroupQuote,
  listShipments,
  openDocument,
  schedulePickup,
  type GroupQuote,
  type PrintableDocument,
  type ServiceQuote,
  type Shipment,
} from '../api/shipping.api'
import { formatApiError } from '../lib/api'
import type { OrderGroupSummary } from '../types/packaging'

const vnd = (value: number) => `${value.toLocaleString('vi-VN')} đ`
const kg = (grams: number) => `${(grams / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour12: false }) : '—')
/** Giá trị cho <input type="datetime-local"> → ISO (giờ máy người dùng). */
const localToIso = (local: string) => new Date(local).toISOString()

/**
 * /app/shipping/dispatch — điều phối giao hàng THẬT: nhóm đã đóng gói → báo giá theo kiện →
 * chọn hãng/dịch vụ → tạo vận đơn → in nhãn / bảng kê / hẹn hãng lấy hàng.
 * Cước lấy từ bảng cước của hãng; hãng mẫu hiện nhãn "cước mẫu" vì chưa phải cước thật.
 */
export function ShippingDispatchPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [packed, setPacked] = useState<OrderGroupSummary[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [quote, setQuote] = useState<GroupQuote | null>(null)
  const [choice, setChoice] = useState<string>('')
  const [pickupLocal, setPickupLocal] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [version, setVersion] = useState(0)
  const reload = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([listOrderGroups('packed'), listShipments()])
      .then(([groups, ships]) => {
        if (cancelled) return
        setPacked(groups)
        setShipments(ships)
        setError(null)
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
  }, [version])

  const pickGroup = async (groupId: string) => {
    setSelected(groupId)
    setQuote(null)
    setChoice('')
    setError(null)
    setNotice(null)
    try {
      const q = await getGroupQuote(groupId)
      setQuote(q)
      if (q.recommended) setChoice(`${q.recommended.carrierCode}|${q.recommended.serviceCode}`)
    } catch (err) {
      setError(formatApiError(err))
    }
  }

  const ship = async () => {
    if (!selected || !choice) return
    const [carrierCode, serviceCode] = choice.split('|')
    if (!carrierCode || !serviceCode) return
    setBusy(true)
    setError(null)
    try {
      const result = await createShipmentBatch({
        orderGroupIds: [selected],
        carrierCode,
        serviceCode,
        pickupAt: pickupLocal ? localToIso(pickupLocal) : undefined,
      })
      setNotice(
        vi
          ? `Đã tạo vận đơn, mã chuyến ${result.tripCode} — cước ước tính ${vnd(result.totalCostVnd)}.`
          : `Shipment created, trip ${result.tripCode} — estimated cost ${vnd(result.totalCostVnd)}.`,
      )
      setSelected(null)
      setQuote(null)
      reload()
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const print = async (kind: PrintableDocument, id: string) => {
    setError(null)
    try {
      await openDocument(kind, id)
    } catch (err) {
      setError(formatApiError(err))
    }
  }

  const changePickup = async (shipment: Shipment, local: string) => {
    if (!local) return
    setError(null)
    try {
      await schedulePickup(shipment.id, localToIso(local))
      reload()
    } catch (err) {
      setError(formatApiError(err))
    }
  }

  const quoteRow = (q: ServiceQuote) => {
    const key = `${q.carrierCode}|${q.serviceCode}`
    return (
      <label
        key={key}
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
          choice === key
            ? 'border-[#2563eb] bg-blue-50 dark:bg-blue-950/40'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <input
          type="radio"
          name="service"
          className="mt-1"
          checked={choice === key}
          onChange={() => {
            setChoice(key)
          }}
        />
        <span className="flex-1">
          <span className="font-medium">
            {q.carrierName} — {q.serviceName}
          </span>
          {q.isSample && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
              {vi ? 'cước mẫu' : 'sample rate'}
            </span>
          )}
          <span className="block text-xs text-slate-500">
            {vi ? 'Giao dự kiến' : 'ETA'} {q.etaMinDays}–{q.etaMaxDays} {vi ? 'ngày' : 'days'} ·{' '}
            {vi ? 'tính cước' : 'chargeable'} {kg(q.totalChargeableG)} · {q.parcels.length} {vi ? 'kiện' : 'parcels'}
          </span>
        </span>
        <span className="font-semibold">{vnd(q.totalCostVnd)}</span>
      </label>
    )
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Điều phối giao hàng' : 'Dispatch' },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {notice && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {notice}
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4" />
              {vi ? 'Nhóm đã đóng gói, chờ giao' : 'Packed groups awaiting shipment'}
            </h2>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : packed.length === 0 ? (
              <p className="text-sm text-slate-500">{vi ? 'Chưa có nhóm nào ở trạng thái đã đóng gói.' : 'No packed groups.'}</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {packed.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="font-mono text-xs">{g.id}</span>
                    <span className="text-slate-500">
                      {g.platform} · {g.orderCount} {vi ? 'đơn' : 'orders'}
                    </span>
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => void print('packing-slip', g.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {vi ? 'Phiếu đóng gói' : 'Packing slip'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void pickGroup(g.id)}
                        className={`rounded-md px-3 py-1 text-xs font-medium ${
                          selected === g.id ? 'bg-[#2563eb] text-white' : 'border border-slate-200 hover:bg-slate-50 dark:border-slate-700'
                        }`}
                      >
                        {vi ? 'Báo giá & giao' : 'Quote & ship'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold">{vi ? 'Chọn hãng vận chuyển' : 'Choose a carrier'}</h2>
              {!quote ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : quote.quotes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {vi ? 'Chưa có hãng nào báo giá được (kiểm tra danh mục hãng).' : 'No carrier can quote this group.'}
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    {quote.parcelCount} {vi ? 'kiện' : 'parcels'} ·{' '}
                    {vi ? 'chiến lược mặc định' : 'default strategy'}: {quote.strategy}
                  </p>
                  <div className="space-y-2">{quote.quotes.map(quoteRow)}</div>
                  <label className="block text-xs text-slate-600 dark:text-slate-300">
                    {vi ? 'Hẹn hãng đến lấy hàng (tùy chọn)' : 'Pickup time (optional)'}
                    <input
                      type="datetime-local"
                      value={pickupLocal}
                      onChange={(e) => {
                        setPickupLocal(e.target.value)
                      }}
                      className="mt-1 block rounded-md border border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!choice || busy}
                    onClick={() => void ship()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {vi ? 'Tạo vận đơn' : 'Create shipment'}
                  </button>
                </>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold">{vi ? 'Vận đơn đã tạo' : 'Shipments'}</h2>
            {shipments.length === 0 ? (
              <p className="text-sm text-slate-500">{vi ? 'Chưa có vận đơn.' : 'No shipments yet.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-3">{vi ? 'Mã vận đơn' : 'Tracking'}</th>
                      <th className="pr-3">{vi ? 'Chuyến' : 'Trip'}</th>
                      <th className="pr-3">{vi ? 'Hãng' : 'Carrier'}</th>
                      <th className="pr-3">{vi ? 'Kiện' : 'Parcels'}</th>
                      <th className="pr-3">{vi ? 'Cước' : 'Cost'}</th>
                      <th className="pr-3">{vi ? 'Giao dự kiến' : 'ETA'}</th>
                      <th className="pr-3">{vi ? 'Hẹn lấy hàng' : 'Pickup'}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {shipments.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-3 font-mono">{s.trackingCode}</td>
                        <td className="pr-3 font-mono">{s.tripCode}</td>
                        <td className="pr-3">
                          {s.carrierName ?? '—'}
                          {s.serviceName ? ` · ${s.serviceName}` : ''}
                        </td>
                        <td className="pr-3">{s.parcelCount}</td>
                        <td className="pr-3">
                          {s.estimatedCostVnd === null ? '—' : vnd(s.estimatedCostVnd)}
                          {s.isSampleRate && <span className="ml-1 text-amber-700">({vi ? 'mẫu' : 'sample'})</span>}
                        </td>
                        <td className="pr-3">{dateTime(s.etaTo)}</td>
                        <td className="pr-3">
                          <input
                            type="datetime-local"
                            defaultValue={s.pickupAt ? new Date(new Date(s.pickupAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                            onBlur={(e) => void changePickup(s, e.target.value)}
                            className="rounded border border-slate-200 bg-transparent px-1 py-0.5 dark:border-slate-700"
                          />
                        </td>
                        <td className="whitespace-nowrap py-2">
                          <button
                            type="button"
                            onClick={() => void print('shipping-label', s.orderGroupId)}
                            className="mr-1 inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-700"
                          >
                            <Printer className="h-3 w-3" />
                            {vi ? 'Nhãn' : 'Label'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void print('manifest', s.tripCode)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-700"
                          >
                            <FileText className="h-3 w-3" />
                            {vi ? 'Bảng kê' : 'Manifest'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
