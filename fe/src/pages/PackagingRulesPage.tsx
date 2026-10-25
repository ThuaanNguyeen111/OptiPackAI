import { useEffect, useState } from 'react'
import { listPackagingBoxes, type PackagingBox } from '../api/packaging-catalog.api'
import { getShippingSettings, updateShippingSettings } from '../api/shipping.api'
import { PackingSettingsForm } from '../components/packing/PackingSettingsReports'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { UserRole } from '../types/auth'

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

function cm(mm: number): string {
  const value = mm / 10
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function stockLabel(status: PackagingBox['stockStatus'], vi: boolean): string {
  if (status === 'out_of_stock') return vi ? 'Hết hàng' : 'Out of stock'
  if (status === 'low_stock') return vi ? 'Sắp hết' : 'Low'
  return vi ? 'Còn hàng' : 'In stock'
}

export function PackagingRulesPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const canEditSender =
    session?.role === UserRole.STORE_OWNER || session?.role === UserRole.ADMIN
  const [boxes, setBoxes] = useState<PackagingBox[]>([])
  const [error, setError] = useState<string | null>(null)
  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [senderAddress, setSenderAddress] = useState('')
  const [senderBusy, setSenderBusy] = useState(false)
  const [senderError, setSenderError] = useState<string | null>(null)
  const [senderSaved, setSenderSaved] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void listPackagingBoxes(false)
        .then(setBoxes)
        .catch((err: unknown) => setError(formatApiError(err)))
      void getShippingSettings()
        .then((settings) => {
          setSenderName(settings.sender.name)
          setSenderPhone(settings.sender.phone)
          setSenderAddress(settings.sender.address)
        })
        .catch((err: unknown) => setSenderError(formatApiError(err)))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quy tắc Bao bì' : 'Packaging Rules' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <PackingSettingsForm vi={vi} canEdit />
          {canEditSender ? (
            <section className="rounded-xl border border-hairline bg-surface-1 p-4">
              <h2 className="text-sm font-medium text-ink">
                {vi ? 'Người gửi trên nhãn' : 'Sender on label'}
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                {vi
                  ? 'Tên, số điện thoại và địa chỉ shop in trên nhãn vận đơn. Chỉ chủ shop hoặc Admin được lưu.'
                  : 'Shop name, phone and address printed on shipping labels. Only Store Owner or Admin can save.'}
              </p>
              <div className="mt-3 space-y-2">
                <input
                  value={senderName}
                  onChange={(event) => setSenderName(event.target.value)}
                  maxLength={120}
                  placeholder={vi ? 'Tên người gửi' : 'Sender name'}
                  className="h-9 w-full rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <input
                  value={senderPhone}
                  onChange={(event) => setSenderPhone(event.target.value)}
                  placeholder={vi ? 'SĐT người gửi' : 'Sender phone'}
                  className="h-9 w-full rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <textarea
                  value={senderAddress}
                  onChange={(event) => setSenderAddress(event.target.value)}
                  placeholder={vi ? 'Địa chỉ người gửi' : 'Sender address'}
                  rows={2}
                  className="w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm"
                />
                {senderError ? (
                  <p className="text-xs text-rose-600">{senderError}</p>
                ) : null}
                {senderSaved ? (
                  <p className="text-xs text-emerald-700">
                    {vi ? 'Đã lưu người gửi.' : 'Sender saved.'}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={senderBusy}
                  onClick={() => {
                    setSenderBusy(true)
                    setSenderError(null)
                    setSenderSaved(false)
                    void updateShippingSettings({
                      sender_name: senderName,
                      sender_phone: senderPhone,
                      sender_address: senderAddress,
                    })
                      .then((next) => {
                        setSenderName(next.sender.name)
                        setSenderPhone(next.sender.phone)
                        setSenderAddress(next.sender.address)
                        setSenderSaved(true)
                      })
                      .catch((err: unknown) => setSenderError(formatApiError(err)))
                      .finally(() => setSenderBusy(false))
                  }}
                  className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {vi ? 'Lưu người gửi' : 'Save sender'}
                </button>
              </div>
            </section>
          ) : null}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Danh mục thùng carton' : 'Carton catalog'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'Đọc từ danh mục thùng. Thêm hoặc sửa thùng ở màn Vật tư đóng gói.'
                : 'Read from the box catalog. Add or edit boxes on the packaging materials screen.'}
            </p>
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div className="border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-medium text-ink">
                {vi ? 'Thùng đang có trong kho vật tư' : 'Boxes in the materials catalog'}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-ink-subtle">
                    <th className="px-4 py-3 font-medium">{vi ? 'Mã thùng' : 'Code'}</th>
                    <th className="px-4 py-3 font-medium">{vi ? 'Lòng thùng' : 'Inner size'}</th>
                    <th className="px-4 py-3 font-medium">{vi ? 'Tải tối đa' : 'Max load'}</th>
                    <th className="px-4 py-3 font-medium">{vi ? 'Tồn' : 'On hand'}</th>
                    <th className="px-4 py-3 font-medium">{vi ? 'Còn trống' : 'Available'}</th>
                    <th className="px-4 py-3 font-medium">{vi ? 'Đơn giá' : 'Price'}</th>
                    <th className="px-4 py-3 font-medium">{vi ? 'Trạng thái' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-ink-muted" colSpan={7}>
                        {error
                          ? null
                          : vi
                            ? 'Chưa có thùng hoặc đang tải.'
                            : 'No boxes yet, or still loading.'}
                      </td>
                    </tr>
                  ) : (
                    boxes.map((box) => (
                      <tr
                        key={box.id}
                        className="border-b border-hairline/70 last:border-0 hover:bg-surface-2/50"
                      >
                        <td className="px-4 py-3 font-mono font-medium text-ink">
                          {box.code}
                          <span className="mt-0.5 block text-[11px] font-sans font-normal text-ink-subtle">
                            {box.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {cm(box.inner.lengthMm)}×{cm(box.inner.widthMm)}×{cm(box.inner.heightMm)} cm
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {(box.maxLoadG / 1000).toLocaleString(vi ? 'vi-VN' : 'en-US')} kg
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {box.quantityOnHand}
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {box.available}
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {box.priceVnd == null ? '—' : formatVnd(box.priceVnd)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              box.stockStatus === 'in_stock'
                                ? 'success'
                                : box.stockStatus === 'low_stock'
                                  ? 'warning'
                                  : 'default'
                            }
                          >
                            {stockLabel(box.stockStatus, vi)}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
