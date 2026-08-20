import { useState } from 'react'
import type { AiPackagingParams } from '../../../types/admin'
import { Button } from '../../../components/ui/Button'

type Props = {
  params: AiPackagingParams
  onUpdate: (next: Partial<AiPackagingParams>) => void
}

export function AiConfigPanel({ params, onUpdate }: Props) {
  const [local, setLocal] = useState<AiPackagingParams>(params)

  function handleSave() {
    onUpdate(local)
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-4">
      <h3 className="mb-3 text-sm font-medium">Cấu hình AI Packaging</h3>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-subtle">Timeout (giây)</label>
          <input type="number" value={local.timeoutSeconds} onChange={(e) => setLocal({ ...local, timeoutSeconds: Number(e.target.value) })} className="w-40 rounded-lg border border-[#222734] bg-[#151922] px-3 py-2 text-sm text-ink focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40" />
          <p className="mt-1 text-xs text-ink-tertiary">Thời gian tối đa chờ gợi ý 3D bin packing</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-subtle">Min Fill Rate (0-1)</label>
          <input type="number" step="0.01" value={local.min_fill_rate} onChange={(e) => setLocal({ ...local, min_fill_rate: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })} className="w-40 rounded-lg border border-[#222734] bg-[#151922] px-3 py-2 text-sm text-ink focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40" />
          <p className="mt-1 text-xs text-ink-tertiary">Tỉ lệ lấp tối thiểu chấp nhận được; nếu thấp hơn sẽ fallback</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="mb-0 text-sm font-medium">Auto fallback</label>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" checked={local.autoFallback} onChange={(e) => setLocal({ ...local, autoFallback: e.target.checked })} className="peer sr-only" />
            <span className="h-5 w-9 rounded-full bg-hairline peer-checked:bg-primary" />
          </label>
        </div>

        <div className="pt-2">
          <Button variant="secondary" onClick={() => { setLocal(params) }}>Reset</Button>
          <Button variant="primary" className="ml-2" onClick={handleSave}>Lưu</Button>
        </div>
      </div>
    </div>
  )
}
