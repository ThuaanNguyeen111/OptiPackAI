import type { PlatformIntegration, SyncLogEvent } from '../types/orders'

export const mockIntegrations: PlatformIntegration[] = [
  {
    marketplace: 'shopee',
    connected: true,
    webhook_active: true,
    last_sync_at: '2026-08-14T08:10:00+07:00',
    orders_today: 24,
  },
  {
    marketplace: 'tiktok',
    connected: true,
    webhook_active: true,
    last_sync_at: '2026-08-14T08:08:00+07:00',
    orders_today: 18,
  },
]

export const mockSyncLogs: SyncLogEvent[] = [
  {
    id: 'LOG-001',
    marketplace: 'shopee',
    event_type: 'new_order',
    external_id: 'SP-8829103',
    status: 'success',
    at: '2026-08-14T08:12:00+07:00',
    message: 'Đơn mới · ORD-1042',
  },
  {
    id: 'LOG-002',
    marketplace: 'tiktok',
    event_type: 'new_order',
    external_id: 'TT-4412098',
    status: 'success',
    at: '2026-08-14T07:45:00+07:00',
    message: 'Đơn mới · ORD-1041',
  },
  {
    id: 'LOG-003',
    marketplace: 'shopee',
    event_type: 'order_update',
    external_id: 'SP-8829055',
    status: 'success',
    at: '2026-08-14T06:30:00+07:00',
    message: 'Cập nhật trạng thái thanh toán',
  },
  {
    id: 'LOG-004',
    marketplace: 'tiktok',
    event_type: 'cancellation',
    external_id: 'TT-4411700',
    status: 'success',
    at: '2026-08-14T05:30:00+07:00',
    message: 'Khách hủy đơn trên sàn',
  },
  {
    id: 'LOG-005',
    marketplace: 'shopee',
    event_type: 'new_order',
    external_id: 'SP-8828880',
    status: 'error',
    at: '2026-08-14T05:00:00+07:00',
    message: 'Lỗi chuẩn hóa · thiếu district',
  },
]

export const syncEventTypeLabels = {
  new_order: 'Đơn mới',
  order_update: 'Cập nhật',
  cancellation: 'Hủy đơn',
} as const
