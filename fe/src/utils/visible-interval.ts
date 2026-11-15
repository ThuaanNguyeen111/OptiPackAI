/**
 * Giống `setInterval` nhưng chỉ chạy khi tab đang hiện: tab ẩn thì dừng (đỡ request, đỡ chạm giới hạn
 * gọi API theo IP của cả kho), tab hiện lại thì gọi 1 lần ngay rồi chạy tiếp.
 * Trả về hàm dọn dẹp để dùng trong `useEffect`.
 */
export function setVisibleInterval(callback: () => void, ms: number): () => void {
  let id: number | null = null

  const start = (): void => {
    if (id === null) id = window.setInterval(callback, ms)
  }
  const stop = (): void => {
    if (id !== null) {
      window.clearInterval(id)
      id = null
    }
  }
  const onVisibility = (): void => {
    if (document.hidden) {
      stop()
      return
    }
    callback()
    start()
  }

  if (!document.hidden) start()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
