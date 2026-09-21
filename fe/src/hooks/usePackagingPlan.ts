import { useCallback, useEffect, useState } from 'react'
import {
  adjustPackagingPlan,
  approvePackagingPlan,
  generatePackagingPlan,
  getOrderGroup,
  getPackagingPlan,
  listPackagingBoxes,
  packOrderGroup,
  rejectPackagingPlan,
} from '../api/packaging.api'
import { formatApiError, getApiErrorCode } from '../lib/api'
import type {
  AdjustmentReason,
  OrderGroupSummary,
  PackagingBox,
  PackagingRecommendation,
} from '../types/packaging'

/**
 * Dữ liệu + thao tác cho màn kế hoạch đóng gói 1 Order Group. Mỗi thao
 * tác xong đều tải lại group (lấy `version` mới cho optimistic lock).
 */
export function usePackagingPlan(groupId: string) {
  const [group, setGroup] = useState<OrderGroupSummary | null>(null)
  const [recommendations, setRecommendations] = useState<PackagingRecommendation[]>([])
  const [boxes, setBoxes] = useState<PackagingBox[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const fetchAll = useCallback(
    () => Promise.all([getOrderGroup(groupId), getPackagingPlan(groupId), listPackagingBoxes()]),
    [groupId],
  )

  const reload = useCallback(async () => {
    const [nextGroup, plan, nextBoxes] = await fetchAll()
    setGroup(nextGroup)
    setRecommendations(plan.recommendations)
    setBoxes(nextBoxes)
  }, [fetchAll])

  useEffect(() => {
    let cancelled = false
    fetchAll()
      .then(([nextGroup, plan, nextBoxes]) => {
        if (cancelled) return
        setGroup(nextGroup)
        setRecommendations(plan.recommendations)
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

  /** Chạy 1 thao tác, tải lại dữ liệu; trả true nếu thành công. */
  const run = useCallback(
    async (action: (version: number) => Promise<unknown>): Promise<boolean> => {
      if (!group) return false
      setBusy(true)
      setError(null)
      setErrorCode(null)
      try {
        await action(group.version)
        await reload()
        return true
      } catch (err: unknown) {
        setError(formatApiError(err))
        setErrorCode(getApiErrorCode(err))
        return false
      } finally {
        setBusy(false)
      }
    },
    [group, reload],
  )

  return {
    group,
    recommendations,
    boxes,
    loading,
    busy,
    error,
    errorCode,
    generate: () => run(() => generatePackagingPlan(groupId)),
    approve: () => run((version) => approvePackagingPlan(groupId, version)),
    reject: () => run((version) => rejectPackagingPlan(groupId, version)),
    adjust: (input: { orderId: string; boxCode: string; reason: AdjustmentReason; note?: string }) =>
      run((version) => adjustPackagingPlan(groupId, { ...input, expectedGroupVersion: version })),
    pack: (packages: { orderId: string; actualWeightKg: number }[]) =>
      run((version) => packOrderGroup(groupId, packages, version)),
  }
}
