import { useEffect, useMemo, useState } from 'react'

/** Số dòng mỗi trang cho hàng đợi dài (phân trang cục bộ FE). */
export const QUEUE_PAGE_SIZE = 10

export type LocalQueuePagination<T> = {
  pagedItems: T[]
  page: number
  totalPages: number
  setPage: (page: number | ((prev: number) => number)) => void
  rangeStart: number
  rangeEnd: number
  total: number
}

/** Cắt danh sách đã lọc thành trang — không gọi API. */
export function useLocalQueuePagination<T>(
  items: T[],
  pageSize: number = QUEUE_PAGE_SIZE,
): LocalQueuePagination<T> {
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [items])

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, currentPage, pageSize])

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, total)

  return {
    pagedItems,
    page: currentPage,
    totalPages,
    setPage,
    rangeStart,
    rangeEnd,
    total,
  }
}
