import { useCallback, useEffect, useState } from 'react'
import { getOrderGroup, listPackagingBoxes } from '../api/packaging.api'
import { getPackingPlan, requestParcelGuide } from '../api/packing-plan.api'
import { formatApiError, getApiErrorCode } from '../lib/api'
import type { OrderGroupSummary, PackagingBox } from '../types/packaging'
import type { PackingPlan } from '../types/packing-plan'

const POLL_MS = 3000

/** Đang chờ máy chủ: kế hoạch đang tính, CP-SAT chạy nền, hoặc nhóm vừa lấy xong mà job chưa tạo kế hoạch. */
function isWaiting(group: OrderGroupSummary | null, plan: PackingPlan | null): boolean {
  if (plan) return plan.status === 'computing' || plan.cpSatPending
  return group?.fulfillmentStatus === 'picked'
}

/**
 * Dữ liệu + thao tác cho màn làm việc đóng gói 1 nhóm (04/10/2026).
 * Mọi thao tác ghi gửi `plan.version`; xong thì thay kế hoạch bằng bản
 * máy chủ trả về và tải lại nhóm (trạng thái nhóm đổi theo kế hoạch).
 */
export function usePackingWorkspace(groupId: string) {
  const [group, setGroup] = useState<OrderGroupSummary | null>(null)
  const [plan, setPlan] = useState<PackingPlan | null>(null)
  const [boxes, setBoxes] = useState<PackagingBox[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [guideLoading, setGuideLoading] = useState<number | null>(null)
  const [guideError, setGuideError] = useState<string | null>(null)

  const fetchAll = useCallback(
    () => Promise.all([getOrderGroup(groupId), getPackingPlan(groupId)]),
    [groupId],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAll(), listPackagingBoxes()])
      .then(([[nextGroup, nextPlan], nextBoxes]) => {
        if (cancelled) return
        setGroup(nextGroup)
        setPlan(nextPlan)
        setBoxes(nextBoxes)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(formatApiError(err))
        setErrorCode(getApiErrorCode(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchAll])

  // Thăm dò khi máy chủ còn đang tính — dừng ngay khi có kết quả.
  const waiting = !loading && isWaiting(group, plan)
  useEffect(() => {
    if (!waiting) return
    let cancelled = false
    const timer = window.setInterval(() => {
      fetchAll()
        .then(([nextGroup, nextPlan]) => {
          if (cancelled) return
          setGroup(nextGroup)
          setPlan(nextPlan)
        })
        .catch(() => {
          /* lỗi mạng tạm thời — lượt sau thử lại */
        })
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [waiting, fetchAll])

  /** Chạy 1 thao tác ghi; trả true nếu thành công. Xung đột phiên bản → tải lại để người dùng thấy bản mới. */
  const run = useCallback(
    async (action: (current: PackingPlan | null) => Promise<PackingPlan>): Promise<boolean> => {
      setBusy(true)
      setError(null)
      setErrorCode(null)
      try {
        const next = await action(plan)
        setPlan(next)
        setGroup(await getOrderGroup(groupId))
        return true
      } catch (err: unknown) {
        setError(formatApiError(err))
        setErrorCode(getApiErrorCode(err))
        try {
          const [nextGroup, nextPlan] = await fetchAll()
          setGroup(nextGroup)
          setPlan(nextPlan)
        } catch {
          /* giữ dữ liệu đang có */
        }
        return false
      } finally {
        setBusy(false)
      }
    },
    [plan, groupId, fetchAll],
  )

  /** Lấy/tạo hướng dẫn cho 1 kiện — không đổi version, không chặn thao tác khác. */
  const loadGuide = useCallback(
    async (parcelNo: number, regenerate = false): Promise<void> => {
      setGuideLoading(parcelNo)
      setGuideError(null)
      try {
        setPlan(await requestParcelGuide(groupId, parcelNo, regenerate))
      } catch (err: unknown) {
        setGuideError(formatApiError(err))
      } finally {
        setGuideLoading(null)
      }
    },
    [groupId],
  )

  return {
    group,
    plan,
    boxes,
    loading,
    busy,
    waiting,
    error,
    errorCode,
    guideLoading,
    guideError,
    run,
    loadGuide,
    clearError: () => {
      setError(null)
      setErrorCode(null)
    },
  }
}
