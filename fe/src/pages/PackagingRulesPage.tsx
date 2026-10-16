import { useEffect, useState } from 'react'
import { listPackagingBoxes, type PackagingBox } from '../api/packaging-catalog.api'
import { PackingSettingsForm } from '../components/packing/PackingSettingsReports'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'

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
  const vi = locale === 'vi'
  const [boxes, setBoxes] = useState<PackagingBox[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void listPackagingBoxes(false)
        .then(setBoxes)
        .catch((err: unknown) => setError(formatApiError(err)))
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
