import { useCallback, useEffect, useState } from 'react'
import {
  adjustPackagingPlan,
  approvePackagingPlan,
  generatePackagingPlan,
  getOrderGroup,
  getPackagingPlan,
  listPackagingBoxes,
  packOrderGroup,
  previewMultiCartonPlan,
  rejectPackagingPlan,
  requestPackingGuide,
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
  const [guideLoadingId, setGuideLoadingId] = useState<string | null>(null)
  const [guideError, setGuideError] = useState<string | null>(null)
  const [cartonPreview, setCartonPreview] = useState<Awaited<ReturnType<typeof previewMultiCartonPlan>> | null>(null)
  const [cartonPreviewLoading, setCartonPreviewLoading] = useState(false)

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

  /**
   * Lấy/tạo hướng dẫn đóng gói cho 1 đơn — chỉ thay đúng phần tử đó,
   * không tải lại cả trang và không cần version (không đổi trạng thái group).
   */
  const loadGuide = useCallback(
    async (recommendationId: string, regenerate = false, cartonIndex = 0): Promise<void> => {
      setGuideLoadingId(`${recommendationId}:${String(cartonIndex)}`)
      setGuideError(null)
      try {
        const updated = await requestPackingGuide(groupId, recommendationId, regenerate, cartonIndex)
        setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } catch (err: unknown) {
        setGuideError(formatApiError(err))
      } finally {
        setGuideLoadingId(null)
      }
    },
    [groupId],
  )

  const previewCartons = useCallback(async (): Promise<void> => {
    setCartonPreviewLoading(true)
    setError(null)
    try {
      setCartonPreview(await previewMultiCartonPlan(groupId))
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setCartonPreviewLoading(false)
    }
  }, [groupId])

  return {
    group,
    recommendations,
    boxes,
    loading,
    busy,
    error,
    errorCode,
    guideLoadingId,
    guideError,
    cartonPreview,
    cartonPreviewLoading,
    previewCartons,
    loadGuide,
    generate: () => run(() => generatePackagingPlan(groupId)),
    approve: () => run((version) => approvePackagingPlan(groupId, version)),
    reject: () => run((version) => rejectPackagingPlan(groupId, version)),
    adjust: (input: { orderId: string; cartonIndex?: number; boxCode: string; reason: AdjustmentReason; note?: string }) =>
      run((version) => adjustPackagingPlan(groupId, { ...input, expectedGroupVersion: version })),
    pack: (packages: { orderId: string; cartonIndex?: number; actualWeightKg: number }[]) =>
      run((version) => packOrderGroup(groupId, packages, version)),
  }
}
