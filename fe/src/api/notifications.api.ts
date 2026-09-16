import { apiRequest } from '../lib/api'

export const NotificationType = {
  MFA_DISABLED: 'mfa_disabled',
} as const

export type AppNotification = {
  _id?: string
  id?: string
  type: string
  title: string
  message: string
  is_read?: boolean
  severity?: string
}

export function notificationId(record: AppNotification): string {
  if (typeof record.id === 'string' && record.id.length > 0) return record.id
  if (typeof record._id === 'string' && record._id.length > 0) return record._id
  return ''
}

export async function fetchUnreadNotifications(): Promise<AppNotification[]> {
  return apiRequest<AppNotification[]>('/notifications?is_read=false', {
    auth: true,
  })
}

export async function markNotificationReadApi(id: string): Promise<void> {
  await apiRequest<unknown>(`/notifications/${id}/read`, {
    method: 'PATCH',
    auth: true,
  })
}
