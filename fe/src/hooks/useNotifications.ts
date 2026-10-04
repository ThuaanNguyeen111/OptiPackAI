import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchUnreadNotificationCount,
  listNotifications,
  markNotificationRead,
} from '../api/notifications.api'
import { getAccessToken } from '../lib/auth-storage'
import type { AppNotification } from '../types/notifications'

/** BE throttle mặc định 20 req/phút — poll chỉ unread-count, list khi mở chuông. */
const POLL_MS = 45_000

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollInFlight = useRef(false)

  const refreshCount = useCallback(async () => {
    if (!enabled || !getAccessToken()) return
    if (pollInFlight.current) return
    pollInFlight.current = true
    try {
      const count = await fetchUnreadNotificationCount()
      setUnreadCount(count)
    } catch {
      /* giữ badge cũ — tránh spam lỗi khi đang bị rate-limit */
    } finally {
      pollInFlight.current = false
    }
  }, [enabled])

  /** Tải danh sách đầy đủ — gọi khi mở panel chuông (không poll). */
  const refreshList = useCallback(async () => {
    if (!enabled || !getAccessToken()) return
    setLoading(true)
    setError(null)
    try {
      const [list, count] = await Promise.all([
        listNotifications(),
        fetchUnreadNotificationCount(),
      ])
      setItems(list)
      setUnreadCount(count)
    } catch {
      setError('Không tải được thông báo.')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const kickoff = window.setTimeout(() => {
      void refreshCount()
    }, 0)
    const id = window.setInterval(() => {
      void refreshCount()
    }, POLL_MS)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(id)
    }
  }, [enabled, refreshCount])

  const markRead = useCallback(async (id: string) => {
    try {
      const updated = await markNotificationRead(id)
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? (updated ?? { ...n, isRead: true }) : n,
        ),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      /* giữ UI; lần mở panel sau sẽ đồng bộ lại */
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => !n.isRead)
    for (const n of unread) {
      await markRead(n.id)
    }
  }, [items, markRead])

  return {
    items,
    unreadCount,
    loading,
    error,
    refreshList,
    refreshCount,
    markRead,
    markAllRead,
  }
}
