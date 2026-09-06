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

export type VerificationItem = {
  id: string
  sku: string
  title: string
  dimensions: string
  weightKg: number
  imageUrl: string
  verified: boolean
}

export type PackingJob = {
  id: string
  selector_label: string
  customer_name: string
  customer_address: string
  destination?: string
  sla_limit?: string
  delivery_service?: string
  channels: Channel[]
  source_orders: SourceOrderRef[]
  classification: Classification
  ai_ms: number
  sku_count: number
  fragile_count: number
  box_code: string
  box_label?: string
  dimensions: string
  dim: { w: number; l: number; h: number }
  real_weight_g: number
  volumetric_weight_g: number
  fill_ratio: number
  opt_score?: number
  unused_space: number
  shipping_price: number
  shipping_saved: number
  shipping_saved_pct: number
  cushioning_vi: string
  cushioning_en: string
  materials?: string[]
  packaging_cost_usd?: number
  shipping_fee_usd?: number
  verification_items?: VerificationItem[]
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

export const ORD_2026_9021_ITEMS: VerificationItem[] = [
  {
    id: 'item-1',
    sku: 'BZ-SLIM-401',
    title: 'Áo Blazer Nam Slim Fit',
    dimensions: '60×45×5 cm',
    weightKg: 0.8,
    imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'item-2',
    sku: 'KC-CASH-203',
    title: 'Khăn Choàng Cashmere',
    dimensions: '30×25×3 cm',
    weightKg: 0.3,
    imageUrl: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'item-3',
    sku: 'VD-CLUT-NF7',
    title: 'Ví Cầm Tay Da Nữ',
    dimensions: '22×12×4 cm',
    weightKg: 0.15,
    imageUrl: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'item-4',
    sku: 'DC-SIL-RD9',
    title: 'Dây Chuyền Bạc Mặt Tròn',
    dimensions: '20×15×3 cm',
    weightKg: 0.05,
    imageUrl: '',
    verified: false,
  },
]

export const ORD_TK_9921_ITEMS: VerificationItem[] = [
  {
    id: 'tk-1',
    sku: 'AK-2041-GL',
    title: 'Áo Khoác Gió Chống Nước Unisex',
    dimensions: '45×35×4 cm',
    weightKg: 0.45,
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'tk-2',
    sku: 'QJ-3052-BK',
    title: 'Quần Jogger Thun Co Giãn Form Rộng',
    dimensions: '35×25×3 cm',
    weightKg: 0.35,
    imageUrl: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'tk-3',
    sku: 'TX-1087-BR',
    title: 'Túi Đeo Chéo Da Tổng Hợp Vintage',
    dimensions: '28×18×6 cm',
    weightKg: 0.25,
    imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'tk-4',
    sku: 'KM-2290-UV',
    title: 'Kính Râm Phân Cực Thời Trang',
    dimensions: '18×8×4 cm',
    weightKg: 0.08,
    imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=300&auto=format&fit=crop&q=80',
    verified: false,
  },
]

export const ORD_SP_3021_ITEMS: VerificationItem[] = [
  {
    id: 'sp-1',
    sku: 'SM-OXFD-01',
    title: 'Áo Sơ Mi Nam Công Sở Oxford',
    dimensions: '40×30×3 cm',
    weightKg: 0.3,
    imageUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'sp-2',
    sku: 'CV-SILK-02',
    title: 'Cà Vạt Lụa Nam Họa Tiết Cao Cấp',
    dimensions: '25×10×2 cm',
    weightKg: 0.08,
    imageUrl: 'https://images.unsplash.com/photo-1589756823695-278bc923f962?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 'sp-3',
    sku: 'TL-6640-LT',
    title: 'Thắt Lưng Da Bò Khóa Kim Loại',
    dimensions: '20×12×4 cm',
    weightKg: 0.18,
    imageUrl: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=300&auto=format&fit=crop&q=80',
    verified: false,
  },
]

export const ORD_2041_ITEMS: VerificationItem[] = [
  {
    id: '2041-1',
    sku: 'SN-RUN-01',
    title: 'Giày Sneaker Thể Thao Độn Đế',
    dimensions: '32×20×12 cm',
    weightKg: 0.75,
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: '2041-2',
    sku: 'VT-4410-SK',
    title: 'Vớ Thể Thao Dệt Kim (Set 4 Đôi)',
    dimensions: '20×15×4 cm',
    weightKg: 0.18,
    imageUrl: 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=300&auto=format&fit=crop&q=80',
    verified: true,
  },
]

export const packingJobs: PackingJob[] = [
  {
    id: 'ORD-2026-9021',
    selector_label: '#ORD-2026-9021 — Shopee (Michael Chang)',
    customer_name: 'Michael Chang',
    customer_address: 'Blk 123 Tampines St 11 #05-123, Singapore 138683',
    destination: 'Singapore 138683',
    sla_limit: '14:30:00 (2h left)',
    delivery_service: 'Express Delivery',
    channels: ['shopee'],
    source_orders: [
      { channel: 'shopee', external_id: 'ORD-2026-9021', label: 'Shopee #ORD-2026-9021' },
    ],
    classification: 'standalone',
    ai_ms: 0.12,
    sku_count: 4,
    fragile_count: 1,
    box_code: 'Hộp S',
    box_label: 'Hộp S: 40 x 30 x 12 cm',
    dimensions: '40 × 30 × 12 cm',
    dim: { w: 40, l: 30, h: 12 },
    real_weight_g: 1300,
    volumetric_weight_g: 1000,
    fill_ratio: 0.98,
    opt_score: 98,
    unused_space: 2,
    shipping_price: 52000,
    shipping_saved: 24000,
    shipping_saved_pct: 32,
    packaging_cost_usd: 0.45,
    shipping_fee_usd: 2.10,
    materials: [
      'Hộp Carton S',
      'Giấy Lụa: 2 tờ',
      'Túi Chống Ẩm: 1 gói',
      'Nhãn Dán Thương Hiệu',
    ],
    verification_items: ORD_2026_9021_ITEMS,
    cushioning_vi: 'Giấy lụa bọc sản phẩm + túi chống ẩm bên trong',
    cushioning_en: 'Silk wrapping paper + desiccant silica gel pouch',
    couriers: DEFAULT_COURIERS,
    sequence: FASHION_SEQUENCE,
  },
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
    box_label: 'Hộp A2: 25 x 15 x 10 cm',
    verification_items: ORD_TK_9921_ITEMS,
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
    box_label: 'Hộp A2: 25 x 15 x 10 cm',
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
    verification_items: ORD_SP_3021_ITEMS,
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
    box_label: 'Hộp B1: 30 x 20 x 15 cm',
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
    verification_items: ORD_2041_ITEMS,
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
