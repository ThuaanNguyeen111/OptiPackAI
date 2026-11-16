import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { PortalProvider } from '../../context/portal-provider'
import { ApiError, formatApiError } from '../../lib/api'
import { getPackingPlan } from '../../api/packing-plan.api'
import type { PackingPlan } from '../../types/packing-plan'

/**
 * Khung dùng chung cho các trang nhúng của app mobile (`/embed/packing/...`): tải kế hoạch đóng gói của nhóm,
 * hiện trạng thái đang tải / lỗi / hết phiên, tự hỏi lại khi phương án đang tính. Có dữ liệu thì gọi `children(plan)`.
 */
function EmbedPlanFrameContent({
  groupId,
  children,
}: {
  groupId: string
  children: (plan: PackingPlan | null) => ReactNode
}) {
  const [plan, setPlan] = useState<PackingPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    getPackingPlan(groupId)
      .then((next) => {
        if (cancelled) return
        setPlan(next)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setExpired(err instanceof ApiError && err.status === 401)
        setError(formatApiError(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, tick])

  // Đang tính phương án thì tự hỏi lại, không bắt người dùng bấm tay.
  const computing = plan?.status === 'computing'
  useEffect(() => {
    if (!computing) return
    const timer = window.setTimeout(() => setTick((n) => n + 1), 4000)
    return () => window.clearTimeout(timer)
  }, [computing, tick])

  if (loading && !plan) {
    return (
      <div className="flex h-svh items-center justify-center gap-2 bg-[#f8faff] text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-[#f8faff] p-6 text-center">
        <p className="text-sm text-slate-700">
          {expired ? 'Phiên đăng nhập đã hết hạn. Đóng màn hình này rồi mở lại.' : error}
        </p>
        {expired ? null : (
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </button>
        )}
      </div>
    )
  }

  return <>{children(plan)}</>
}

export function EmbedPlanFrame(props: {
  groupId: string
  children: (plan: PackingPlan | null) => ReactNode
}) {
  return (
    <PortalProvider>
      <EmbedPlanFrameContent {...props} />
    </PortalProvider>
  )
}
