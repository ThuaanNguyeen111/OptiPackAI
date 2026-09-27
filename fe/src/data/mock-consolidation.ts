import type { ConsolidationGroup } from '../types/orders'

export const mockConsolidationGroups: ConsolidationGroup[] = [
  {
    id: 'PKG-PENDING-01',
    customer: {
      name: 'Nguyễn Minh Anh',
      phone: '0901234567',
      address: '123 Nguyễn Văn Cừ, Q.5, TP.HCM',
    },
    order_ids: ['ORD-1042', 'ORD-1041'],
    status: 'pending_review',
    match_reason: 'Cùng SĐT và địa chỉ giao · 2 sàn (Shopee + TikTok)',
  },
  {
    id: 'PKG-001',
    customer: {
      name: 'Lê Thị Hương',
      phone: '0912345678',
      address: '45 Lê Lợi, Q.1, TP.HCM',
    },
    order_ids: ['ORD-1040', 'ORD-1037'],
    status: 'merged',
    match_reason: 'Khớp SĐT · đã gộp thành 1 kiện',
  },
]
