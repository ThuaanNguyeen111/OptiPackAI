import { useCallback, useEffect, useRef } from 'react'

/**
 * (13/11/2026) Mỗi lần gọi trả `signal` mới và huỷ request trước đó còn đang chạy.
 * Dùng cho danh sách có bộ lọc: đổi bộ lọc nhanh thì kết quả cũ (về muộn) không ghi đè kết quả mới.
 * Rời trang thì huỷ luôn request đang chạy.
 *
 * ```ts
 * const nextSignal = useAbortPrevious()
 * const load = async () => {
 *   const signal = nextSignal()
 *   try { setRows(await listX(params, { signal })) }
 *   catch (err) { if (isRequestCanceled(err)) return; setError(formatApiError(err)) }
 *   finally { if (!signal.aborted) setLoading(false) }
 * }
 * ```
 */
export function useAbortPrevious(): () => AbortSignal {
  const current = useRef<AbortController | null>(null)

  useEffect(() => () => current.current?.abort(), [])

  return useCallback(() => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    return controller.signal
  }, [])
}
