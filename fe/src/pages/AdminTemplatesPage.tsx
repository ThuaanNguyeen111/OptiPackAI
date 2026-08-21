import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { usePackagingTemplates } from '../hooks/usePackagingTemplates'
import { AdminToast } from '../modules/admin/components/AdminToast'
import type { PackagingTemplate } from '../types/admin'

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 caret-slate-900 placeholder:text-slate-400 transition-shadow focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-[#1C212D] dark:text-[#F3F4F6] dark:caret-[#F3F4F6] dark:placeholder:text-[#9CA3AF] dark:[color-scheme:dark]'

type FormState = {
  name: string
  description: string
  boxCode: string
  lengthCm: number
  widthCm: number
  heightCm: number
  maxWeightKg: number
  cushioning: string
  active: boolean
}

const emptyForm: FormState = {
  name: '',
  description: '',
  boxCode: '',
  lengthCm: 20,
  widthCm: 12,
  heightCm: 8,
  maxWeightKg: 3,
  cushioning: '',
  active: true,
}

export function AdminTemplatesPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const api = usePackagingTemplates()
  const [editing, setEditing] = useState<PackagingTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [toast, setToast] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setCreating(true)
  }

  function openEdit(tpl: PackagingTemplate) {
    setCreating(false)
    setEditing(tpl)
    setForm({
      name: tpl.name,
      description: tpl.description ?? '',
      boxCode: tpl.boxCode,
      lengthCm: tpl.lengthCm,
      widthCm: tpl.widthCm,
      heightCm: tpl.heightCm,
      maxWeightKg: tpl.maxWeightKg,
      cushioning: tpl.cushioning ?? '',
      active: tpl.active,
    })
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.boxCode.trim()) return
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      boxCode: form.boxCode.trim(),
      lengthCm: form.lengthCm,
      widthCm: form.widthCm,
      heightCm: form.heightCm,
      maxWeightKg: form.maxWeightKg,
      cushioning: form.cushioning.trim() || undefined,
      active: form.active,
    }
    if (editing) {
      await api.updateTemplate(editing.id, payload)
      setToast(vi ? 'Đã cập nhật template' : 'Template updated')
    } else {
      await api.createTemplate(payload)
      setToast(vi ? 'Đã tạo template' : 'Template created')
    }
    window.setTimeout(() => setToast(null), 2800)
    closeForm()
  }

  const showForm = creating || editing !== null

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Templates đóng gói' : 'Packaging templates' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi
                  ? 'Packaging templates'
                  : 'Packaging templates'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'FE-08 · catalog thùng + cushioning cho AI bin packing (khác quy tắc kho của Store Owner)'
                  : 'FE-08 · carton + cushioning catalog for AI bin packing (distinct from Store Owner warehouse rules)'}
              </p>
            </div>
            <Button variant="primary" className="h-9 min-h-9" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              {vi ? 'Thêm template' : 'Add template'}
            </Button>
          </div>

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-ink-subtle">
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Template' : 'Template'}
                    </th>
                    <th className="px-4 py-3 font-medium">Box Code</th>
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Kích thước' : 'Dimensions'}
                    </th>
                    <th className="px-4 py-3 font-medium">Max Weight</th>
                    <th className="px-4 py-3 font-medium">Cushioning</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Thao tác' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {api.templates.map((tpl) => (
                    <tr
                      key={tpl.id}
                      className="border-b border-hairline/70 last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{tpl.name}</p>
                        <p className="mt-0.5 text-[11px] text-ink-tertiary">
                          {tpl.description ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink">
                        {tpl.boxCode}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {tpl.lengthCm}×{tpl.widthCm}×{tpl.heightCm} cm
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {tpl.maxWeightKg} kg
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {tpl.cushioning ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={tpl.active ? 'success' : 'warning'}>
                          {tpl.active
                            ? vi
                              ? 'Dùng cho AI'
                              : 'Used by AI'
                            : vi
                              ? 'Tắt'
                              : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(tpl)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline px-2 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink"
                          >
                            <Pencil className="h-3 w-3" />
                            {vi ? 'Sửa' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void api.removeTemplate(tpl.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#EF4444]/30 px-2 text-xs text-[#EF4444] hover:bg-[#EF4444]/10"
                          >
                            <Trash2 className="h-3 w-3" />
                            {vi ? 'Xóa' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Đóng"
            onClick={closeForm}
          />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl border border-hairline bg-surface-1 sm:rounded-2xl">
            <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
              <h2 className="text-sm font-medium text-ink">
                {editing
                  ? vi
                    ? 'Sửa template'
                    : 'Edit template'
                  : vi
                    ? 'Thêm template'
                    : 'Add template'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  {vi ? 'Tên template' : 'Template name'}
                </label>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  Box code
                </label>
                <input
                  className={`${inputClass} font-mono`}
                  value={form.boxCode}
                  onChange={(e) =>
                    setForm({ ...form, boxCode: e.target.value })
                  }
                  placeholder="CARTON-A1"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  L (cm)
                </label>
                <input
                  type="number"
                  className={`${inputClass} font-mono`}
                  value={form.lengthCm}
                  onChange={(e) =>
                    setForm({ ...form, lengthCm: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  W (cm)
                </label>
                <input
                  type="number"
                  className={`${inputClass} font-mono`}
                  value={form.widthCm}
                  onChange={(e) =>
                    setForm({ ...form, widthCm: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  H (cm)
                </label>
                <input
                  type="number"
                  className={`${inputClass} font-mono`}
                  value={form.heightCm}
                  onChange={(e) =>
                    setForm({ ...form, heightCm: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  Max kg
                </label>
                <input
                  type="number"
                  className={`${inputClass} font-mono`}
                  value={form.maxWeightKg}
                  onChange={(e) =>
                    setForm({ ...form, maxWeightKg: Number(e.target.value) })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  Cushioning
                </label>
                <input
                  className={inputClass}
                  value={form.cushioning}
                  onChange={(e) =>
                    setForm({ ...form, cushioning: e.target.value })
                  }
                  placeholder="Bubble wrap 2cm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  {vi ? 'Mô tả' : 'Description'}
                </label>
                <input
                  className={inputClass}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                  className="accent-[#6366F1]"
                />
                {vi ? 'Cho phép AI dùng template này' : 'Allow AI to use this template'}
              </label>
            </div>
            <div className="flex gap-2 border-t border-hairline p-4">
              <Button variant="ghost" className="flex-1" onClick={closeForm}>
                {vi ? 'Hủy' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void handleSave()}
                disabled={!form.name.trim() || !form.boxCode.trim()}
              >
                {vi ? 'Lưu' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <AdminToast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
