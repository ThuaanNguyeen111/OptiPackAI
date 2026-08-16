import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import {
  formatVnd,
  initialCartons,
  type CartonBox,
} from '../data/packaging-rules-mock'

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-surface-3'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function PackagingRulesPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [cartons, setCartons] = useState<CartonBox[]>(() =>
    structuredClone(initialCartons),
  )
  const [fragilePad, setFragilePad] = useState(true)
  const [heavyHd, setHeavyHd] = useState(true)
  const [marginPct, setMarginPct] = useState(8)

  function addCarton() {
    const n = cartons.length + 1
    setCartons((prev) => [
      ...prev,
      {
        id: `box-new-${Date.now()}`,
        box_code: `CARTON-X${n}`,
        length_cm: 22,
        width_cm: 14,
        height_cm: 10,
        max_weight_kg: 4,
        stock_qty: 100,
        unit_cost_vnd: 4000,
        status: 'in_stock',
      },
    ])
  }

  function removeCarton(id: string) {
    setCartons((prev) => prev.filter((c) => c.id !== id))
  }

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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi
                  ? 'Quản lý Thùng Carton & Quy tắc Đóng gói AI'
                  : 'Carton Inventory & AI Packaging Rules'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'Kho thùng · cushioning · volumetric safety margin'
                  : 'Box stock · cushioning · volumetric safety margin'}
              </p>
            </div>
            <Button variant="primary" onClick={addCarton}>
              <Plus className="mr-1.5 h-4 w-4" />
              {vi ? '+ Thêm Kích Thước Thùng' : '+ Add Box Size'}
            </Button>
          </div>

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div className="border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-medium text-ink">
                {vi
                  ? 'Available Carton Inventory'
                  : 'Available Carton Inventory'}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-ink-subtle">
                    <th className="px-4 py-3 font-medium">Box Code</th>
                    <th className="px-4 py-3 font-medium">Dimensions</th>
                    <th className="px-4 py-3 font-medium">Max Weight</th>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Unit Cost</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cartons.map((box) => (
                    <tr
                      key={box.id}
                      className="border-b border-hairline/70 last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3 font-mono font-medium text-ink">
                        {box.box_code}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {box.length_cm}×{box.width_cm}×{box.height_cm} cm
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {box.max_weight_kg} kg
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {box.stock_qty}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {formatVnd(box.unit_cost_vnd)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            box.status === 'in_stock' ? 'success' : 'warning'
                          }
                        >
                          {box.status === 'in_stock' ? 'In Stock' : 'Low Stock'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline px-2 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCarton(box.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#EF4444]/30 px-2 text-xs text-[#EF4444] hover:bg-[#EF4444]/10"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-medium text-ink">
              {vi
                ? 'Cushioning & Safety Rules Matrix'
                : 'Cushioning & Safety Rules Matrix'}
            </h2>
            <div className="space-y-3">
              <ToggleRow
                label="Fragile Items"
                description={
                  vi
                    ? 'Tự động áp dụng buffer Bubble Wrap 2cm'
                    : 'Automatically apply 2cm Bubble Wrap padding buffer'
                }
                checked={fragilePad}
                onChange={setFragilePad}
              />
              <ToggleRow
                label="Heavy Electronics"
                description={
                  vi
                    ? 'Bắt buộc thùng double-wall CARTON-HD'
                    : 'Require double-wall corrugated carton (CARTON-HD)'
                }
                checked={heavyHd}
                onChange={setHeavyHd}
              />
              <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Volumetric Weight Safety Margin
                    </p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {vi
                        ? 'Ngưỡng khoảng trống an toàn'
                        : 'Threshold buffer space'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-primary-hover">
                    {marginPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={20}
                  step={1}
                  value={marginPct}
                  onChange={(e) => setMarginPct(Number(e.target.value))}
                  className="mt-3 w-full accent-[#6366F1]"
                />
                <p className="mt-1 font-mono text-[11px] text-ink-tertiary">
                  Default buffer: 8% · current={marginPct}%
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
