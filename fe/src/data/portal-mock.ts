export type Channel = 'shopee' | 'tiktok' | 'facebook' | 'lazada'

export type PackStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'shipped'
  | 'consolidated'

export type Classification = 'consolidated' | 'standalone' | 'pending_merge'

export type DbSyncStatus = 'synced' | 'pending' | 'error'

export type SourceOrderRef = {
  channel: Channel
  external_id: string
  label: string
}

export type MatchCriteria = {
  phone_display: string
  address_display: string
  matched_fields: Array<'phone' | 'address'>
}

export type PortalOrder = {
  id: string
  package_id: string
  /** Proposed PKG id shown before confirm (pending_merge) */
  proposed_package_id?: string
  external_ids: string[]
  channels: Channel[]
  customer_name: string
  customer_phone: string
  customer_address: string
  item_count: number
  volumetric_weight_g: number
  ai_box: string
  ai_dimensions: string
  fill_ratio: number
  unused_space: number
  status: PackStatus
  classification: Classification
  db_status: DbSyncStatus
  match_criteria?: MatchCriteria
  source_orders: SourceOrderRef[]
  consolidation_hint?: string
  matching_badge?: string
  fragile_items?: string[]
  cushioning?: string
  items: Array<{ sku: string; name: string; qty: number; fragile?: boolean }>
}

export function proposePackageId(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 900) + 100)
  return `PKG-${y}${m}${d}-${seq}`
}

export type StreamEvent = {
  id: string
  at: string
  channel: Channel
  message_vi: string
  message_en: string
  stage: 'webhook' | 'normalized' | 'matched' | 'persisted'
}

export const channelLabels: Record<Channel, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  facebook: 'Facebook',
  lazada: 'Lazada',
}

export const channelColors: Record<Channel, string> = {
  shopee: 'bg-[#FF6B00] text-white',
  tiktok: 'bg-[#00E5FF] text-[#0B0E14]',
  facebook: 'bg-[#1877F2] text-white',
  lazada: 'bg-[#0F146D] text-white',
}

export const statusLabelsVi: Record<PackStatus, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  ready: 'Sẵn sàng đóng',
  shipped: 'Đã giao vận',
  consolidated: 'Gợi ý gộp',
}

export const streamStatus = {
  kafka_active: true,
  latency_ms: 0,
  topic: 'marketplace.orders.ingest',
}

export const recentStreamEvents: StreamEvent[] = [
  {
    id: 'evt-1',
    at: '14:18:02',
    channel: 'tiktok',
    message_vi: 'Webhook TikTok Shop → Normalized',
    message_en: 'Webhook triggered from TikTok Shop → Normalized',
    stage: 'normalized',
  },
  {
    id: 'evt-2',
    at: '14:17:58',
    channel: 'shopee',
    message_vi: 'Webhook Shopee → Kafka ingest (0ms)',
    message_en: 'Webhook from Shopee → Kafka ingest (0ms)',
    stage: 'webhook',
  },
  {
    id: 'evt-3',
    at: '14:17:41',
    channel: 'tiktok',
    message_vi: 'Match Phone+Address · gộp vào PKG-8801',
    message_en: 'Phone+Address match · merged into PKG-8801',
    stage: 'matched',
  },
  {
    id: 'evt-4',
    at: '14:17:40',
    channel: 'shopee',
    message_vi: 'Persisted PKG-8801 → MongoDB synced',
    message_en: 'Persisted PKG-8801 → MongoDB synced',
    stage: 'persisted',
  },
]

export const portalOrders: PortalOrder[] = [
  {
    id: 'ORD-2042',
    package_id: 'PKG-PENDING',
    proposed_package_id: 'PKG-20260816-001',
    external_ids: ['SHP-9921', 'TT-4412'],
    channels: ['shopee', 'tiktok'],
    customer_name: 'Nguyễn Minh Anh',
    customer_phone: '0901234567',
    customer_address: '123 Nguyễn Văn Cừ, Quận 5, TP.HCM',
    item_count: 4,
    volumetric_weight_g: 450,
    ai_box: 'CARTON-A2',
    ai_dimensions: '25×15×10 cm',
    fill_ratio: 0.92,
    unused_space: 8,
    status: 'pending',
    classification: 'pending_merge',
    db_status: 'pending',
    match_criteria: {
      phone_display: 'Phone Number (+84 901 ··· 567)',
      address_display: 'Delivery Address (District 5, HCMC)',
      matched_fields: ['phone', 'address'],
    },
    source_orders: [
      { channel: 'shopee', external_id: 'SHP-9921', label: 'Shopee #SHP-9921' },
      { channel: 'tiktok', external_id: 'TT-4412', label: 'TikTok #TT-4412' },
    ],
    consolidation_hint: 'Khớp SĐT + địa chỉ · chờ xác nhận gộp',
    matching_badge: '✨ Matching Customer (Shopee + TikTok)',
    fragile_items: ['SKU-C03'],
    cushioning: 'Bubble wrap cho item #2 (Fragile)',
    items: [
      { sku: 'SKU-A01', name: 'Áo thun basic', qty: 2 },
      { sku: 'SKU-B02', name: 'Quần short kaki', qty: 1 },
      { sku: 'SKU-C03', name: 'Mũ bucket', qty: 1, fragile: true },
    ],
  },
  {
    id: 'ORD-2041',
    package_id: 'PKG-8798',
    external_ids: ['SHP-9905'],
    channels: ['shopee'],
    customer_name: 'Lê Thị Hương',
    customer_phone: '0912345678',
    customer_address: '45 Lê Lợi, Quận 1, TP.HCM',
    item_count: 5,
    volumetric_weight_g: 820,
    ai_box: 'CARTON-B1',
    ai_dimensions: '30×20×15 cm',
    fill_ratio: 0.88,
    unused_space: 12,
    status: 'ready',
    classification: 'standalone',
    db_status: 'synced',
    source_orders: [
      { channel: 'shopee', external_id: 'SHP-9905', label: 'Shopee #SHP-9905' },
    ],
    items: [
      { sku: 'SKU-D04', name: 'Giày sneaker', qty: 1 },
      { sku: 'SKU-E05', name: 'Tất thể thao', qty: 4 },
    ],
  },
  {
    id: 'ORD-2040',
    package_id: 'PKG-8795',
    external_ids: ['TT-4411987'],
    channels: ['tiktok'],
    customer_name: 'Phạm Quốc Bảo',
    customer_phone: '0923456789',
    customer_address: '88 Hoàng Văn Thụ, Tân Bình, TP.HCM',
    item_count: 2,
    volumetric_weight_g: 310,
    ai_box: 'CARTON-A1',
    ai_dimensions: '20×12×8 cm',
    fill_ratio: 0.85,
    unused_space: 15,
    status: 'processing',
    classification: 'standalone',
    db_status: 'synced',
    source_orders: [
      { channel: 'tiktok', external_id: 'TT-4411987', label: 'TikTok #TT-4411987' },
    ],
    items: [
      { sku: 'SKU-F06', name: 'Tai nghe BT', qty: 1, fragile: true },
      { sku: 'SKU-G07', name: 'Ốp điện thoại', qty: 1 },
    ],
    cushioning: 'Bubble wrap cho tai nghe',
  },
  {
    id: 'ORD-2039',
    package_id: 'PKG-8792',
    external_ids: ['FB-99102'],
    channels: ['facebook'],
    customer_name: 'Trần Hoàng Long',
    customer_phone: '0945678901',
    customer_address: '12 Pasteur, Quận 3, TP.HCM',
    item_count: 3,
    volumetric_weight_g: 560,
    ai_box: 'CARTON-A2',
    ai_dimensions: '25×15×10 cm',
    fill_ratio: 0.9,
    unused_space: 10,
    status: 'pending',
    classification: 'standalone',
    db_status: 'pending',
    source_orders: [
      { channel: 'facebook', external_id: 'FB-99102', label: 'Facebook #FB-99102' },
    ],
    items: [
      { sku: 'SKU-K11', name: 'Sách kỹ năng', qty: 3 },
    ],
  },
  {
    id: 'ORD-2038',
    package_id: 'PKG-8788',
    external_ids: ['LZ-44011', 'SHP-8990'],
    channels: ['lazada', 'shopee'],
    customer_name: 'Võ Thanh Tú',
    customer_phone: '0934567890',
    customer_address: '9 Nguyễn Huệ, Quận 1, TP.HCM',
    item_count: 3,
    volumetric_weight_g: 980,
    ai_box: 'CARTON-C3',
    ai_dimensions: '35×25×18 cm',
    fill_ratio: 0.86,
    unused_space: 14,
    status: 'consolidated',
    classification: 'consolidated',
    db_status: 'synced',
    match_criteria: {
      phone_display: 'Phone Number (+84 934 ··· 890)',
      address_display: 'Delivery Address (District 1, HCMC)',
      matched_fields: ['phone', 'address'],
    },
    source_orders: [
      { channel: 'lazada', external_id: 'LZ-44011', label: 'Lazada #LZ-44011' },
      { channel: 'shopee', external_id: 'SHP-8990', label: 'Shopee #SHP-8990' },
    ],
    consolidation_hint: 'Gộp 2 đơn cùng địa chỉ · Lazada + Shopee',
    matching_badge: '✨ Matching Customer (Lazada + Shopee)',
    items: [
      { sku: 'SKU-H08', name: 'Balo laptop', qty: 1 },
      { sku: 'SKU-I09', name: 'Chuột không dây', qty: 2 },
    ],
  },
  {
    id: 'ORD-2050',
    package_id: 'PKG-PENDING',
    proposed_package_id: 'PKG-20260816-042',
    external_ids: ['SHP-101', 'TT-202'],
    channels: ['shopee', 'tiktok'],
    customer_name: 'Hoàng Thị Lan',
    customer_phone: '0987654321',
    customer_address: '56 Hai Bà Trưng, Quận 1, TP.HCM',
    item_count: 3,
    volumetric_weight_g: 390,
    ai_box: 'CARTON-A2',
    ai_dimensions: '25×15×10 cm',
    fill_ratio: 0.91,
    unused_space: 9,
    status: 'pending',
    classification: 'pending_merge',
    db_status: 'pending',
    match_criteria: {
      phone_display: 'Phone Number (+84 987 ··· 321)',
      address_display: 'Delivery Address (District 1, HCMC)',
      matched_fields: ['phone', 'address'],
    },
    source_orders: [
      { channel: 'shopee', external_id: 'SHP-101', label: 'Shopee #SHP-101' },
      { channel: 'tiktok', external_id: 'TT-202', label: 'TikTok #TT-202' },
    ],
    consolidation_hint: 'Khớp SĐT + địa chỉ · chờ xác nhận gộp',
    matching_badge: '✨ Matching Customer (Shopee + TikTok)',
    items: [
      { sku: 'SKU-L12', name: 'Áo khoác gió', qty: 1 },
      { sku: 'SKU-M13', name: 'Khẩu trang KF94', qty: 2 },
    ],
  },
  {
    id: 'ORD-2037',
    package_id: 'PKG-8785',
    external_ids: ['TT-4411850'],
    channels: ['tiktok'],
    customer_name: 'Lê Thị Hương',
    customer_phone: '0912345678',
    customer_address: '45 Lê Lợi, Quận 1, TP.HCM',
    item_count: 1,
    volumetric_weight_g: 180,
    ai_box: 'CARTON-S1',
    ai_dimensions: '15×10×8 cm',
    fill_ratio: 0.94,
    unused_space: 6,
    status: 'shipped',
    classification: 'standalone',
    db_status: 'synced',
    source_orders: [
      { channel: 'tiktok', external_id: 'TT-4411850', label: 'TikTok #TT-4411850' },
    ],
    items: [{ sku: 'SKU-J10', name: 'Ví da mini', qty: 1 }],
  },
]

export const kpiOverview = {
  total_orders_today: 1280,
  total_orders_delta: 12.4,
  ai_savings_pct: 34.2,
  pending_packing: 45,
  fulfillment_rate: 98.6,
}

export const channelVolume = [
  { channel: 'shopee' as Channel, count: 620, color: '#FF6B00' },
  { channel: 'tiktok' as Channel, count: 410, color: '#00E5FF' },
  { channel: 'facebook' as Channel, count: 180, color: '#1877F2' },
  { channel: 'lazada' as Channel, count: 70, color: '#0F146D' },
]

export const savingsTrend = [
  { week: 'T1', before: 100, after: 78 },
  { week: 'T2', before: 100, after: 72 },
  { week: 'T3', before: 100, after: 68 },
  { week: 'T4', before: 100, after: 65 },
  { week: 'T5', before: 100, after: 62 },
  { week: 'T6', before: 100, after: 58 },
]
