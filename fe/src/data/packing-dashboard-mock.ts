import type { Channel, Classification, SourceOrderRef } from './portal-mock'

export type PackSequenceStep = {
  id: string
  step: number
  emoji: string
  title_vi: string
  title_en: string
  position_vi: string
  position_en: string
  item_ids: string[]
}

export type CourierOption = {
  id: string
  name: string
  eta: string
  price: number
  recommended?: boolean
}

export type PackingJob = {
  id: string
  selector_label: string
  customer_name: string
  customer_address: string
  channels: Channel[]
  source_orders: SourceOrderRef[]
  classification: Classification
  ai_ms: number
  sku_count: number
  fragile_count: number
  box_code: string
  dimensions: string
  dim: { w: number; l: number; h: number }
  real_weight_g: number
  volumetric_weight_g: number
  fill_ratio: number
  unused_space: number
  shipping_price: number
  shipping_saved: number
  shipping_saved_pct: number
  cushioning_vi: string
  cushioning_en: string
  couriers: CourierOption[]
  sequence: PackSequenceStep[]
}

const FASHION_SEQUENCE: PackSequenceStep[] = [
  {
    id: 'pants',
    step: 1,
    emoji: '👖',
    title_vi: 'Quần tây đã gấp',
    title_en: 'Folded Trousers',
    position_vi: 'Đáy trái',
    position_en: 'Bottom Left',
    item_ids: ['pants'],
  },
  {
    id: 'shirt',
    step: 2,
    emoji: '👔',
    title_vi: 'Áo sơ mi đã gấp',
    title_en: 'Folded Shirt',
    position_vi: 'Chồng trên quần',
    position_en: 'Stacked on Trousers',
    item_ids: ['shirt'],
  },
  {
    id: 'backpack',
    step: 3,
    emoji: '🎒',
    title_vi: 'Balo',
    title_en: 'Backpack',
    position_vi: 'Hông phải, đứng dọc',
    position_en: 'Right Side Standing',
    item_ids: ['backpack'],
  },
  {
    id: 'top-layer',
    step: 4,
    emoji: '🎩',
    title_vi: 'Mũ bucket & mắt kính',
    title_en: 'Bucket Hat & Glasses',
    position_vi: 'Tầng trên (nhẹ / dễ vỡ)',
    position_en: 'Top Layer',
    item_ids: ['hat', 'glasses'],
  },
]

const DEFAULT_COURIERS: CourierOption[] = [
  {
    id: 'ghtk',
    name: 'GHTK — Economy',
    eta: '1–2 ngày',
    price: 22000,
    recommended: true,
  },
  { id: 'ghn', name: 'GHN — Standard', eta: '2–3 ngày', price: 27000 },
  { id: 'vtp', name: 'Viettel Post', eta: '2–4 ngày', price: 31000 },
]

export const packingJobs: PackingJob[] = [
  {
    id: 'ORD-TK-9921',
    selector_label: '#ORD-TK-9921 — TikTok Shop',
    customer_name: 'Nguyễn Minh Anh',
    customer_address: '123 Nguyễn Văn Cừ, Quận 5, TP.HCM',
    channels: ['tiktok', 'shopee'],
    source_orders: [
      { channel: 'tiktok', external_id: 'TK-9921', label: 'TikTok #ORD-TK-9921' },
      { channel: 'shopee', external_id: 'SP-3021', label: 'Shopee #ORD-SP-3021' },
    ],
    classification: 'pending_merge',
    ai_ms: 0.18,
    sku_count: 4,
    fragile_count: 1,
    box_code: 'CARTON-A2',
    dimensions: '25 × 15 × 10 cm',
    dim: { w: 25, l: 15, h: 10 },
    real_weight_g: 650,
    volumetric_weight_g: 750,
    fill_ratio: 0.92,
    unused_space: 8,
    shipping_price: 22000,
    shipping_saved: 22000,
    shipping_saved_pct: 18,
    cushioning_vi: '2 lớp xốp bóng khí cho mắt kính (Fragile)',
    cushioning_en: '2-layer bubble wrap required for glasses (Fragile)',
    couriers: DEFAULT_COURIERS,
    sequence: FASHION_SEQUENCE,
  },
  {
    id: 'ORD-SP-3021',
    selector_label: '#ORD-SP-3021 — Shopee',
    customer_name: 'Nguyễn Minh Anh',
    customer_address: '123 Nguyễn Văn Cừ, Quận 5, TP.HCM',
    channels: ['shopee'],
    source_orders: [
      { channel: 'shopee', external_id: 'SP-3021', label: 'Shopee #ORD-SP-3021' },
    ],
    classification: 'pending_merge',
    ai_ms: 0.21,
    sku_count: 3,
    fragile_count: 0,
    box_code: 'CARTON-A2',
    dimensions: '25 × 15 × 10 cm',
    dim: { w: 25, l: 15, h: 10 },
    real_weight_g: 420,
    volumetric_weight_g: 500,
    fill_ratio: 0.87,
    unused_space: 13,
    shipping_price: 22000,
    shipping_saved: 15000,
    shipping_saved_pct: 12,
    cushioning_vi: 'Không cần chèn lót đặc biệt',
    cushioning_en: 'No extra cushioning required',
    couriers: DEFAULT_COURIERS,
    sequence: FASHION_SEQUENCE.slice(0, 2),
  },
  {
    id: 'ORD-2041',
    selector_label: '#ORD-2041 — Shopee',
    customer_name: 'Lê Thị Hương',
    customer_address: '45 Lê Lợi, Quận 1, TP.HCM',
    channels: ['shopee'],
    source_orders: [
      { channel: 'shopee', external_id: 'SHP-9905', label: 'Shopee #SHP-9905' },
    ],
    classification: 'standalone',
    ai_ms: 0.14,
    sku_count: 5,
    fragile_count: 0,
    box_code: 'CARTON-B1',
    dimensions: '30 × 20 × 15 cm',
    dim: { w: 30, l: 20, h: 15 },
    real_weight_g: 820,
    volumetric_weight_g: 900,
    fill_ratio: 0.88,
    unused_space: 12,
    shipping_price: 27000,
    shipping_saved: 8000,
    shipping_saved_pct: 9,
    cushioning_vi: 'Chèn giấy tổ ong đáy hộp',
    cushioning_en: 'Honeycomb paper at box floor',
    couriers: [
      {
        id: 'ghn',
        name: 'GHN — Standard',
        eta: '1–2 ngày',
        price: 27000,
        recommended: true,
      },
      { id: 'ghtk', name: 'GHTK — Economy', eta: '2–3 ngày', price: 29000 },
      { id: 'vtp', name: 'Viettel Post', eta: '2–4 ngày', price: 33000 },
    ],
    sequence: [
      {
        id: 'shoes',
        step: 1,
        emoji: '👟',
        title_vi: 'Giày sneaker',
        title_en: 'Sneakers',
        position_vi: 'Đáy hộp',
        position_en: 'Box floor',
        item_ids: [],
      },
      {
        id: 'socks',
        step: 2,
        emoji: '🧦',
        title_vi: 'Tất thể thao ×4',
        title_en: 'Sports socks ×4',
        position_vi: 'Khe hông',
        position_en: 'Side gaps',
        item_ids: [],
      },
    ],
  },
]
