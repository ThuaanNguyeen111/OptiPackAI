import { apiRequest } from '../lib/api'
import {
  mapNotificationRaw,
  type AppNotification,
  type NotificationApiRaw,
} from '../types/notifications'

export async function listNotifications(params?: {
  is_read?: boolean
}): Promise<AppNotification[]> {
  const qs = new URLSearchParams()
  if (params?.is_read !== undefined) {
    qs.set('is_read', String(params.is_read))
  }
  const query = qs.toString() ? `?${qs.toString()}` : ''
  const raw = await apiRequest<NotificationApiRaw[]>(`/notifications${query}`, {
    auth: true,
  })
  if (!Array.isArray(raw)) return []
  return raw
    .map(mapNotificationRaw)
    .filter((n): n is AppNotification => n !== null)
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await apiRequest<{ count: number }>('/notifications/unread-count', {
    auth: true,
  })
  return typeof res.count === 'number' ? res.count : 0
}

export async function markNotificationRead(
  id: string,
): Promise<AppNotification | null> {
  const raw = await apiRequest<NotificationApiRaw>(`/notifications/${id}/read`, {
    method: 'PATCH',
    auth: true,
  })
  return mapNotificationRaw(raw)
}
