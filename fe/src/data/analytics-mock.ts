export type AnalyticsRange = '7d' | 'month' | 'custom'

export type PlatformCostRow = {
  platform: string
  accent: string
  material_cost_vnd: number
  savings_vnd: number
  savings_pct: number
  orders: number
}

export type StaffEfficiencyRow = {
  operator: string
  role: string
  orders_per_hour: number
  packed_today: number
  accuracy_pct: number
}

export type SummaryRow = {
  date: string
  platform: string
  packages: number
  material_cost_vnd: number
  ai_savings_vnd: number
  avg_fill_pct: number
  courier: string
}

export const platformCostBreakdown: PlatformCostRow[] = [
  {
    platform: 'Shopee',
    accent: '#FF6B00',
    material_cost_vnd: 18540000,
    savings_vnd: 6240000,
    savings_pct: 33.7,
    orders: 620,
  },
  {
    platform: 'TikTok Shop',
    accent: '#00E5FF',
    material_cost_vnd: 11280000,
    savings_vnd: 4120000,
    savings_pct: 36.5,
    orders: 410,
  },
  {
    platform: 'Facebook',
    accent: '#1877F2',
    material_cost_vnd: 4860000,
    savings_vnd: 1380000,
    savings_pct: 28.4,
    orders: 180,
  },
]

export const staffEfficiency: StaffEfficiencyRow[] = [
  {
    operator: 'Nguyễn Văn A',
    role: 'Packaging Specialist',
    orders_per_hour: 42,
    packed_today: 168,
    accuracy_pct: 99.1,
  },
  {
    operator: 'Trần Thị B',
    role: 'Warehouse Staff',
    orders_per_hour: 38,
    packed_today: 152,
    accuracy_pct: 98.4,
  },
  {
    operator: 'Lê Minh C',
    role: 'Shipping Coordinator',
    orders_per_hour: 35,
    packed_today: 140,
    accuracy_pct: 97.8,
  },
  {
    operator: 'Phạm Đức D',
    role: 'Packaging Specialist',
    orders_per_hour: 45,
    packed_today: 180,
    accuracy_pct: 99.4,
  },
]

export const consolidatedSummary: SummaryRow[] = [
  {
    date: '2026-08-16',
    platform: 'Shopee',
    packages: 128,
    material_cost_vnd: 2140000,
    ai_savings_vnd: 720000,
    avg_fill_pct: 91,
    courier: 'GHN',
  },
  {
    date: '2026-08-16',
    platform: 'TikTok Shop',
    packages: 96,
    material_cost_vnd: 1680000,
    ai_savings_vnd: 610000,
    avg_fill_pct: 93,
    courier: 'GHTK',
  },
  {
    date: '2026-08-15',
    platform: 'Shopee',
    packages: 142,
    material_cost_vnd: 2380000,
    ai_savings_vnd: 790000,
    avg_fill_pct: 90,
    courier: 'GHN',
  },
  {
    date: '2026-08-15',
    platform: 'Facebook',
    packages: 34,
    material_cost_vnd: 540000,
    ai_savings_vnd: 160000,
    avg_fill_pct: 88,
    courier: 'Viettel Post',
  },
  {
    date: '2026-08-14',
    platform: 'TikTok Shop',
    packages: 110,
    material_cost_vnd: 1920000,
    ai_savings_vnd: 680000,
    avg_fill_pct: 92,
    courier: 'J&T',
  },
]

export function formatVnd(n: number) {
  return `${n.toLocaleString('vi-VN')} ₫`
}
