import { useState } from 'react'
import { Check, Cpu, Loader2, RotateCcw } from 'lucide-react'
import type { AiPackagingParams } from '../../../types/admin'
import { Button } from '../../../components/ui/Button'
import { usePortal } from '../../../context/use-portal'

type Props = {
  params: AiPackagingParams
  onUpdate: (next: Partial<AiPackagingParams>) => void
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 caret-slate-900 placeholder:text-slate-400 transition-shadow focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-[#1C212D] dark:text-[#F3F4F6] dark:caret-[#F3F4F6] dark:placeholder:text-[#9CA3AF] dark:[color-scheme:dark]'

export function AiConfigPanel({ params, onUpdate }: Props) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [local, setLocal] = useState<AiPackagingParams>(params)
  const [saving, setSaving] = useState(false)

  const fillPct = Math.round(local.min_fill_rate * 100)

  async function handleSave() {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 400))
    onUpdate(local)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-surface-1 p-5">
          <Cpu className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
          <p className="mt-3 text-sm text-ink-subtle">
            {vi ? 'Timeout gợi ý' : 'Solver timeout'}
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-ink">
            {local.timeoutSeconds}s
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-1 p-5">
          <p className="text-sm text-ink-subtle">
            {vi ? 'Min fill rate' : 'Min fill rate'}
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-ink">
            {fillPct}%
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-1 p-5">
          <p className="text-sm text-ink-subtle">Auto fallback</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {local.autoFallback
              ? vi
                ? 'Bật'
                : 'On'
              : vi
                ? 'Tắt'
                : 'Off'}
          </p>
          <p className="mt-1 text-xs text-ink-tertiary">
            {vi
              ? 'Fallback thùng mặc định nếu fill thấp'
              : 'Default carton if fill is below threshold'}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-hairline bg-surface-1 p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <Cpu className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
          {vi ? 'Tham số 3D bin packing' : '3D bin packing parameters'}
        </h2>

        <div className="space-y-3">
          <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              {vi ? 'Timeout (giây)' : 'Timeout (seconds)'}
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={local.timeoutSeconds}
              onChange={(e) =>
                setLocal({
                  ...local,
                  timeoutSeconds: Math.max(
                    1,
                    Math.min(5, Number(e.target.value) || 1),
                  ),
                })
              }
              className={`${inputClass} max-w-[160px] font-mono`}
            />
            <p className="mt-1.5 text-xs text-ink-tertiary">
              {vi
                ? 'NFR Report 2: gợi ý 3D bin packing phải trả trong ≤ 5 giây. R02: timeout tối đa + fallback khi OR-Tools chậm.'
                : 'Report 2 NFR: 3D bin packing must return in ≤ 5s. R02: cap timeout and fallback if OR-Tools is slow.'}
            </p>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">Min Fill Rate</p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {vi
                    ? 'Tỉ lệ lấp tối thiểu; thấp hơn sẽ fallback'
                    : 'Minimum fill ratio; below this triggers fallback'}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-primary-hover">
                {fillPct}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={98}
              step={1}
              value={fillPct}
              onChange={(e) =>
                setLocal({
                  ...local,
                  min_fill_rate: Number(e.target.value) / 100,
                })
              }
              className="mt-3 w-full accent-[#6366F1]"
            />
            <p className="mt-1 font-mono text-[11px] text-ink-tertiary">
              Default 82% · current={fillPct}%
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Auto fallback</p>
              <p className="mt-0.5 text-xs text-ink-subtle">
                {vi
                  ? 'R02: fallback thuật toán đơn giản / thùng lớn hơn khi timeout hoặc fill rate thấp'
                  : 'R02: simpler fallback / larger carton when timeout or fill rate is too low'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={local.autoFallback}
              onClick={() =>
                setLocal({ ...local, autoFallback: !local.autoFallback })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                local.autoFallback ? 'bg-primary' : 'bg-surface-3'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  local.autoFallback ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="ghost"
            className="h-9 min-h-9"
            onClick={() => setLocal(params)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            variant="primary"
            className="h-9 min-h-9"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            {vi ? 'Lưu cấu hình' : 'Save config'}
          </Button>
        </div>
      </section>
    </div>
  )
}
