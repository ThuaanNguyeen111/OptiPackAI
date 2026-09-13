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
    route: '/app/warehouse',
    items: [
      {
        id: 'ORD-84102',
        channel: 'Lazada',
        itemsCount: 7,
        slaWarning: 'SLA: Còn 12 phút',
        timeAgoVi: '8 phút trước',
        timeAgoEn: '8 mins ago',
        pickerStaff: 'JD',
      },
      {
        id: 'ORD-76311',
        channel: 'Shopee',
        itemsCount: 2,
        timeAgoVi: '19 phút trước',
        timeAgoEn: '19 mins ago',
        pickerStaff: 'AM',
      },
      {
        id: 'ORD-91104',
        channel: 'TikTok Shop',
        itemsCount: 4,
        timeAgoVi: '31 phút trước',
        timeAgoEn: '31 mins ago',
        pickerStaff: 'SL',
      },
    ],
  },
  {
    id: 'col-packing',
    titleVi: 'Đã đóng gói & In nhãn',
    titleEn: 'Packed & Labels Printed',
    color: 'emerald',
    count: 15,
    route: '/app/packing',
    moreCount: 11,
    items: [
      {
        id: 'ORD-82410',
        channel: 'Shopee',
        itemsCount: 2,
        timeAgoVi: '3 phút trước',
        timeAgoEn: '3 mins ago',
      },
      {
        id: 'ORD-77309',
        channel: 'Lazada',
        itemsCount: 6,
        timeAgoVi: '14 phút trước',
        timeAgoEn: '14 mins ago',
      },
      {
        id: 'ORD-85419',
        channel: 'TikTok Shop',
        itemsCount: 1,
        timeAgoVi: '22 phút trước',
        timeAgoEn: '22 mins ago',
      },
      {
        id: 'ORD-90412',
        channel: 'Shopee',
        itemsCount: 3,
        timeAgoVi: '29 phút trước',
        timeAgoEn: '29 mins ago',
      },
    ],
  },
  {
    id: 'col-handover',
    titleVi: 'Đã bàn giao cho hãng vận chuyển',
    titleEn: 'Handed Over to Carriers',
    color: 'slate',
    count: 22,
    route: '/app/shipping',
    moreCount: 18,
    items: [
      {
        id: 'ORD-81309',
        channel: 'TikTok Shop',
        itemsCount: 4,
        timeAgoVi: '2 phút trước',
        timeAgoEn: '2 mins ago',
      },
      {
        id: 'ORD-72014',
        channel: 'Shopee',
        itemsCount: 1,
        timeAgoVi: '11 phút trước',
        timeAgoEn: '11 mins ago',
      },
      {
        id: 'ORD-84192',
        channel: 'Lazada',
        itemsCount: 3,
        timeAgoVi: '20 phút trước',
        timeAgoEn: '20 mins ago',
      },
      {
        id: 'ORD-89312',
        channel: 'Shopee',
        itemsCount: 1,
        timeAgoVi: '35 phút trước',
        timeAgoEn: '35 mins ago',
      },
    ],
  },
]
