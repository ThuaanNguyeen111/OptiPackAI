export type DashboardChannel = 'Shopee' | 'TikTok Shop' | 'Lazada'

export interface DashboardKanbanItem {
  id: string
  channel: DashboardChannel
  itemsCount: number
  slaWarning?: string
  timeAgoVi: string
  timeAgoEn: string
  pickerStaff?: string
}

export interface DashboardKanbanColumn {
  id: string
  titleVi: string
  titleEn: string
  color: 'blue' | 'amber' | 'emerald' | 'slate'
  count: number
  items: DashboardKanbanItem[]
  moreCount?: number
  route: string
}

export const DASHBOARD_KANBAN_COLUMNS: DashboardKanbanColumn[] = [
  {
    id: 'col-new',
    titleVi: 'Đơn hàng mới / Đã hợp nhất',
    titleEn: 'New Orders / Consolidated',
    color: 'blue',
    count: 12,
    route: '/app/orders',
    moreCount: 8,
    items: [
      {
        id: 'ORD-88412',
        channel: 'Shopee',
        itemsCount: 3,
        slaWarning: 'SLA: Còn 18 phút',
        timeAgoVi: '15 phút trước',
        timeAgoEn: '15 mins ago',
      },
      {
        id: 'ORD-77301',
        channel: 'TikTok Shop',
        itemsCount: 1,
        timeAgoVi: '24 phút trước',
        timeAgoEn: '24 mins ago',
      },
      {
        id: 'ORD-90214',
        channel: 'Lazada',
        itemsCount: 5,
        timeAgoVi: '32 phút trước',
        timeAgoEn: '32 mins ago',
      },
      {
        id: 'ORD-88124',
        channel: 'Shopee',
        itemsCount: 2,
        timeAgoVi: '45 phút trước',
        timeAgoEn: '45 mins ago',
      },
    ],
  },
  {
    id: 'col-picking',
    titleVi: 'Đang lấy hàng',
    titleEn: 'Picking in Progress',
    color: 'amber',
    count: 8,
    route: '/app/orders',
    moreCount: 5,
    items: [
      {
        id: 'ORD-55102',
        channel: 'Lazada',
        itemsCount: 4,
        timeAgoVi: '8 phút trước',
        timeAgoEn: '8 mins ago',
        pickerStaff: 'NV',
      },
      {
        id: 'ORD-44119',
        channel: 'Shopee',
        itemsCount: 2,
        timeAgoVi: '19 phút trước',
        timeAgoEn: '19 mins ago',
        pickerStaff: 'TH',
      },
      {
        id: 'ORD-33088',
        channel: 'TikTok Shop',
        itemsCount: 1,
        slaWarning: 'SLA: Còn 35 phút',
        timeAgoVi: '27 phút trước',
        timeAgoEn: '27 mins ago',
        pickerStaff: 'LA',
      },
    ],
  },
  {
    id: 'col-packing',
    titleVi: 'Đang đóng gói',
    titleEn: 'Packing',
    color: 'emerald',
    count: 9,
    route: '/app/orders',
    moreCount: 4,
    items: [
      {
        id: 'ORD-22901',
        channel: 'Lazada',
        itemsCount: 3,
        timeAgoVi: '12 phút trước',
        timeAgoEn: '12 mins ago',
      },
      {
        id: 'ORD-21877',
        channel: 'Shopee',
        itemsCount: 5,
        timeAgoVi: '21 phút trước',
        timeAgoEn: '21 mins ago',
      },
      {
        id: 'ORD-20744',
        channel: 'TikTok Shop',
        itemsCount: 2,
        timeAgoVi: '33 phút trước',
        timeAgoEn: '33 mins ago',
      },
    ],
  },
  {
    id: 'col-ship',
    titleVi: 'Sẵn sàng giao / Đã giao',
    titleEn: 'Ready / Shipped',
    color: 'slate',
    count: 18,
    route: '/app/orders',
    moreCount: 11,
    items: [
      {
        id: 'ORD-19002',
        channel: 'Lazada',
        itemsCount: 1,
        timeAgoVi: '45 phút trước',
        timeAgoEn: '45 mins ago',
      },
      {
        id: 'ORD-18811',
        channel: 'Shopee',
        itemsCount: 2,
        timeAgoVi: '1 giờ trước',
        timeAgoEn: '1 hour ago',
      },
      {
        id: 'ORD-17755',
        channel: 'TikTok Shop',
        itemsCount: 3,
        timeAgoVi: '1 giờ trước',
        timeAgoEn: '1 hour ago',
      },
    ],
  },
]

/** Owner demo — tài chính / doanh thu / nhân viên (Package 5 mock) */
export type OwnerRevenueByChannel = {
  channel: DashboardChannel
  orders: number
  revenueVnd: number
  growthPct: number
}

export type OwnerStaffStat = {
  name: string
  roleVi: string
  roleEn: string
  ordersToday: number
  avgMinutes: number
  accuracyPct: number
}

export const OWNER_REVENUE_BY_CHANNEL: OwnerRevenueByChannel[] = [
  { channel: 'Lazada', orders: 186, revenueVnd: 42_850_000, growthPct: 8.2 },
  { channel: 'Shopee', orders: 142, revenueVnd: 31_200_000, growthPct: 5.1 },
  { channel: 'TikTok Shop', orders: 98, revenueVnd: 22_640_000, growthPct: 12.4 },
]

export const OWNER_STAFF_STATS: OwnerStaffStat[] = [
  {
    name: 'Ahmad R.',
    roleVi: 'Nhân viên lấy hàng',
    roleEn: 'Warehouse picker',
    ordersToday: 28,
    avgMinutes: 4.2,
    accuracyPct: 98.5,
  },
  {
    name: 'Linh P.',
    roleVi: 'Nhân viên đóng gói',
    roleEn: 'Packaging staff',
    ordersToday: 34,
    avgMinutes: 3.1,
    accuracyPct: 97.2,
  },
  {
    name: 'Minh T.',
    roleVi: 'Điều phối giao hàng',
    roleEn: 'Shipping coordinator',
    ordersToday: 41,
    avgMinutes: 2.4,
    accuracyPct: 99.1,
  },
]

export const OWNER_FINANCE_SUMMARY = {
  revenueTodayVnd: 12_480_000,
  revenueWeekVnd: 96_690_000,
  packagingCostWeekVnd: 4_320_000,
  aiSavingsWeekVnd: 1_284_000,
  multiPlatformGroupsToday: 17,
  cancelDetachToday: 3,
}
