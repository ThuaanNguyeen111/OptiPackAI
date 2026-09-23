export type PickingPriority = 'Urgent' | 'Normal'
export type PickingStatus = 'Picked' | 'Picking' | 'Pending' | 'Delayed'
export type BatchZone = 'Zone A' | 'Zone B' | 'Zone C'
export type BatchChannel = 'shopee' | 'tiktok' | 'lazada' | 'facebook'

/**
 * 3 trường hợp đơn hàng theo nghiệp vụ:
 * 1. 'express': Đơn hỏa tốc (Bắt buộc hoàn thành trong 4 tiếng, chỉ nhận trong giờ hành chính 08:00 - 17:30)
 * 2. 'normal': Đơn bình thường (Xử lý tiêu chuẩn 24h)
 * 3. 'delayed_packing': Đơn bình thường nhưng bị trễ thời gian đóng gói (Vượt quá hạn đóng gói quy định)
 */
export type OrderFulfillmentType = 'express' | 'normal' | 'delayed_packing'

export interface OrderSlaDetail {
  orderType: OrderFulfillmentType
  title: string
  slaHours?: number // 4 tiếng cho đơn hỏa tốc
  deadlineText: string // '12:15' hoặc 'Quá hạn 45 phút'
  remainingText?: string // 'Còn 1h 45m'
  receivedAtText?: string // '08:15 (Giờ hành chính: 08:00 - 17:30)'
  officeHoursOnly?: boolean // true cho đơn hỏa tốc
  overdueMinutes?: number // Số phút quá hạn đóng gói
  description: string
}

export interface StaffNotificationItem {
  id: string
  batchId: string
  type: OrderFulfillmentType
  title: string
  message: string
  deadlineInfo: string
  timeAgo: string
  urgent: boolean
}

export const DEFAULT_STAFF_NOTIFICATIONS: StaffNotificationItem[] = [
  {
    id: 'notif-1',
    batchId: 'BTH-20240115-001',
    type: 'express',
    title: '⚡ ĐƠN HỎA TỐC: Bắt buộc hoàn tất trong 4 tiếng',
    message: 'Đợt BTH-20240115-001 (12 món / 8 SKU) đã tiếp nhận lúc 08:15 trong giờ hành chính. Hạn chót hoàn tất đóng gói: 12:15!',
    deadlineInfo: 'SLA 4 tiếng · Còn 1h 45m · Nhận trong giờ HC (08:00 - 17:30)',
    timeAgo: '15 phút trước',
    urgent: true,
  },
  {
    id: 'notif-2',
    batchId: 'BTH-20240115-006',
    type: 'delayed_packing',
    title: '⚠️ CẢNH BÁO: Đơn trễ thời gian đóng gói',
    message: 'Đợt BTH-20240115-006 (Đơn bình thường) đã vượt quá thời gian đóng gói quy định (+45 phút). Trạng thái hiện tại: Chậm trễ!',
    deadlineInfo: 'Đã quá hạn 45 phút đóng gói · Yêu cầu xử lý đóng gói ngay',
    timeAgo: '5 phút trước',
    urgent: true,
  },
  {
    id: 'notif-3',
    batchId: 'BTH-20240115-004',
    type: 'express',
    title: '⚡ ĐƠN HỎA TỐC: Đang lấy hàng cần ưu tiên đóng gói',
    message: 'Đợt BTH-20240115-004 (15 món / 15 SKU) tiếp nhận lúc 09:15 trong giờ hành chính. Bắt buộc hoàn tất trước 13:15.',
    deadlineInfo: 'SLA 4 tiếng · Còn 2h 20m · Ưu tiên đóng gói trước',
    timeAgo: '30 phút trước',
    urgent: true,
  },
]

export interface CustomerOrderItem {
  sku: string
  name: string
  qty: number
  price: number
  bin: string
  picked: boolean
}

export interface CustomerOrder {
  orderId: string
  channel: BatchChannel
  customerName: string
  phone: string
  address: string
  createdAt: string
  paymentMethod: string
  totalAmount: number
  notes?: string
  items: CustomerOrderItem[]
}

export interface PickingBatch {
  id: string
  itemsCount: number
  skusCount: number
  channels: BatchChannel[]
  priority: PickingPriority
  orderType: OrderFulfillmentType
  slaDetail: OrderSlaDetail
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  picker: {
    name: string
    avatar: string
    initials: string
  }
  progress: {
    picked: number
    total: number
  }
  status: PickingStatus
  zone: BatchZone
  createdAt: string
  orders: CustomerOrder[]
  items: Array<{
    sku: string
    name: string
    qty: number
    bin: string
    picked: boolean
  }>
  aiPackaging?: {
    boxCode: string
    dimensions: string
    fillRatio: number
    cushioning?: string
  }
}

export const initialPickingBatches: PickingBatch[] = [
  // Page 1 (Exact 7 rows from the design screenshot)
  {
    id: 'BTH-20240115-001',
    itemsCount: 12,
    skusCount: 4,
    channels: ['shopee', 'tiktok'],
    priority: 'Urgent',
    orderType: 'express',
    slaDetail: {
      orderType: 'express',
      title: 'Đơn hỏa tốc',
      slaHours: 4,
      deadlineText: '12:15',
      remainingText: 'Còn 1h 45m',
      receivedAtText: '08:15 (Giờ hành chính: 08:00 - 17:30)',
      officeHoursOnly: true,
      description: 'Bắt buộc nhân viên hoàn thành trong 4 tiếng. Chỉ tiếp nhận trong khung giờ hành chính (08:00 - 17:30).',
    },
    customerName: 'Trần Văn An',
    customerPhone: '0901 882 193',
    customerAddress: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    picker: {
      name: 'Ahmad R.',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      initials: 'AR',
    },
    progress: { picked: 6, total: 12 },
    status: 'Picking',
    zone: 'Zone A',
    createdAt: '2026-09-06T08:15:00Z',
    orders: [
      {
        orderId: 'SP-10482',
        channel: 'shopee',
        customerName: 'Trần Văn An',
        phone: '0901 882 193',
        address: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 07:30',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 490000,
        notes: 'Giao giờ hành chính, gọi điện trước khi đến',
        items: [
          { sku: 'AT-POLO-01', name: 'Áo Polo Nam Cotton Pique Thoáng Khí', qty: 2, price: 180000, bin: 'A-04-12', picked: true },
          { sku: 'QS-KAKI-02', name: 'Quần Short Kaki Nam Co Giãn Form Regular', qty: 1, price: 130000, bin: 'A-04-15', picked: true },
        ],
      },
      {
        orderId: 'TT-22910',
        channel: 'tiktok',
        customerName: 'Trần Văn An',
        phone: '0901 882 193',
        address: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 07:45',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 930000,
        notes: 'Đơn gộp cùng khách với Shopee SP-10482',
        items: [
          { sku: 'QS-KAKI-02', name: 'Quần Short Kaki Nam Co Giãn Form Regular', qty: 3, price: 130000, bin: 'A-04-15', picked: true },
          { sku: 'ML-BASE-03', name: 'Mũ Lưỡi Trai Unisex Thêu Chữ Vintage', qty: 6, price: 90000, bin: 'A-02-08', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'AT-POLO-01', name: 'Áo Polo Nam Cotton Pique Thoáng Khí', qty: 2, bin: 'A-04-12', picked: true },
      { sku: 'QS-KAKI-02', name: 'Quần Short Kaki Nam Co Giãn Form Regular', qty: 4, bin: 'A-04-15', picked: true },
      { sku: 'ML-BASE-03', name: 'Mũ Lưỡi Trai Unisex Thêu Chữ Vintage', qty: 6, bin: 'A-02-08', picked: false },
    ],
    aiPackaging: {
      boxCode: 'CARTON-B2',
      dimensions: '25 × 18 × 12 cm',
      fillRatio: 0.92,
      cushioning: 'Giấy lụa bọc sản phẩm + túi chống ẩm bên trong',
    },
  },
  {
    id: 'BTH-20240115-002',
    itemsCount: 24,
    skusCount: 16,
    channels: ['shopee', 'lazada', 'facebook'],
    priority: 'Normal',
    orderType: 'normal',
    slaDetail: {
      orderType: 'normal',
      title: 'Đơn bình thường',
      deadlineText: '18:00 hôm nay',
      remainingText: 'Còn 7h 30m',
      receivedAtText: '08:30',
      officeHoursOnly: false,
      description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
    },
    customerName: 'Lê Hoàng Yến',
    customerPhone: '0918 345 678',
    customerAddress: '45 Lê Quý Đôn, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
    picker: {
      name: 'Siti M.',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
      initials: 'SM',
    },
    progress: { picked: 18, total: 24 },
    status: 'Picking',
    zone: 'Zone B',
    createdAt: '2026-09-06T08:30:00Z',
    orders: [
      {
        orderId: 'SP-88219',
        channel: 'shopee',
        customerName: 'Lê Hoàng Yến',
        phone: '0918 345 678',
        address: '45 Lê Quý Đôn, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:00',
        paymentMethod: 'Ví ShopeePay (Đã thanh toán)',
        totalAmount: 520000,
        notes: 'Váy đầm cao cấp, xin bọc túi zip cẩn thận',
        items: [
          { sku: 'VD-SUONG-01', name: 'Váy Đầm Nữ Dáng Suông Tay Phồng Lụa Satin', qty: 6, price: 85000, bin: 'B-02-09', picked: true },
        ],
      },
      {
        orderId: 'LZ-55102',
        channel: 'lazada',
        customerName: 'Lê Hoàng Yến',
        phone: '0918 345 678',
        address: '45 Lê Quý Đôn, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:10',
        paymentMethod: 'Lazada Wallet (Đã thanh toán)',
        totalAmount: 780000,
        notes: 'Giao sau 17h hoặc gửi bảo vệ toà nhà',
        items: [
          { sku: 'AL-CARD-02', name: 'Áo Cardigan Len Mỏng Nữ Dệt Kim Cúc Gỗ', qty: 12, price: 65000, bin: 'B-03-04', picked: true },
        ],
      },
      {
        orderId: 'FB-99014',
        channel: 'facebook',
        customerName: 'Lê Hoàng Yến',
        phone: '0918 345 678',
        address: '45 Lê Quý Đôn, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:15',
        paymentMethod: 'Chuyển khoản ngân hàng MB (Đã thanh toán)',
        totalAmount: 890000,
        notes: 'Đơn gộp cùng khách với Shopee & Lazada, tặng kèm túi giấy',
        items: [
          { sku: 'KC-VOAN-03', name: 'Khăn Choàng Cổ Lụa Voan Họa Tiết Hoa Cúc', qty: 6, price: 148000, bin: 'B-01-11', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'VD-SUONG-01', name: 'Váy Đầm Nữ Dáng Suông Tay Phồng Lụa Satin', qty: 6, bin: 'B-02-09', picked: true },
      { sku: 'AL-CARD-02', name: 'Áo Cardigan Len Mỏng Nữ Dệt Kim Cúc Gỗ', qty: 12, bin: 'B-03-04', picked: true },
      { sku: 'KC-VOAN-03', name: 'Khăn Choàng Cổ Lụa Voan Họa Tiết Hoa Cúc', qty: 6, bin: 'B-01-11', picked: false },
    ],
    aiPackaging: {
      boxCode: 'CARTON-D4',
      dimensions: '40 × 30 × 25 cm',
      fillRatio: 0.88,
      cushioning: 'Bọc túi nilon zip bảo vệ sợi dệt cao cấp',
    },
  },
  {
    id: 'BTH-20240115-003',
    itemsCount: 8,
    skusCount: 6,
    channels: ['tiktok'],
    priority: 'Normal',
    orderType: 'normal',
    slaDetail: {
      orderType: 'normal',
      title: 'Đơn bình thường',
      deadlineText: '18:00 hôm nay',
      remainingText: 'Còn 8h',
      receivedAtText: '09:00',
      officeHoursOnly: false,
      description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
    },
    customerName: 'Đặng Quốc Huy',
    customerPhone: '0977 445 566',
    customerAddress: '54 Quang Trung, Phường 10, Quận Gò Vấp, TP. Hồ Chí Minh',
    picker: {
      name: 'Chưa phân công',
      avatar: '',
      initials: '--',
    },
    progress: { picked: 0, total: 8 },
    status: 'Pending',
    zone: 'Zone A',
    createdAt: '2026-09-06T09:00:00Z',
    orders: [
      {
        orderId: 'TT-33419',
        channel: 'tiktok',
        customerName: 'Đặng Quốc Huy',
        phone: '0977 445 566',
        address: '54 Quang Trung, Phường 10, Quận Gò Vấp, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:45',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 1450000,
        notes: 'Kiểm tra hàng trước khi nhận',
        items: [
          { sku: 'SM-OXFD-01', name: 'Áo Sơ Mi Nam Công Sở Vải Oxford Chống Nhăn', qty: 3, price: 180000, bin: 'A-01-05', picked: false },
          { sku: 'CV-SILK-02', name: 'Cà Vạt Lụa Nam Họa Tiết Chấm Bi Cao Cấp', qty: 2, price: 380000, bin: 'A-02-14', picked: false },
          { sku: 'TL-AUTO-03', name: 'Thắt Lưng Da Nam Khóa Tự Động Hợp Kim Titan', qty: 3, price: 50000, bin: 'A-05-02', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'SM-OXFD-01', name: 'Áo Sơ Mi Nam Công Sở Vải Oxford Chống Nhăn', qty: 3, bin: 'A-01-05', picked: false },
      { sku: 'CV-SILK-02', name: 'Cà Vạt Lụa Nam Họa Tiết Chấm Bi Cao Cấp', qty: 2, bin: 'A-02-14', picked: false },
      { sku: 'TL-AUTO-03', name: 'Thắt Lưng Da Nam Khóa Tự Động Hợp Kim Titan', qty: 3, bin: 'A-05-02', picked: false },
    ],
    aiPackaging: {
      boxCode: 'CARTON-C1',
      dimensions: '35 × 20 × 15 cm',
      fillRatio: 0.85,
      cushioning: 'Hộp quà thắt lưng + bọc giấy nến sơ mi',
    },
  },
  {
    id: 'BTH-20240115-004',
    itemsCount: 23,
    skusCount: 8,
    channels: ['shopee', 'lazada', 'tiktok'],
    priority: 'Urgent',
    orderType: 'express',
    slaDetail: {
      orderType: 'express',
      title: 'Đơn hỏa tốc',
      slaHours: 4,
      deadlineText: '13:15',
      remainingText: 'Còn 2h 20m',
      receivedAtText: '09:15 (Giờ hành chính: 08:00 - 17:30)',
      officeHoursOnly: true,
      description: 'Bắt buộc nhân viên hoàn thành trong 4 tiếng. Chỉ tiếp nhận trong khung giờ hành chính (08:00 - 17:30).',
    },
    customerName: 'Hoàng Minh Quân',
    customerPhone: '0912 345 678',
    customerAddress: '72 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    picker: {
      name: 'Rian K.',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
      initials: 'RK',
    },
    progress: { picked: 10, total: 23 },
    status: 'Picking',
    zone: 'Zone A',
    createdAt: '2026-09-06T09:15:00Z',
    orders: [
      {
        orderId: 'SP-10482',
        channel: 'shopee',
        customerName: 'Hoàng Minh Quân',
        phone: '0912 345 678',
        address: '72 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:30',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 1850000,
        notes: 'Giao giờ hành chính, gọi điện trước khi đến',
        items: [
          { sku: 'AK-2041-GL', name: 'Áo Khoác Gió Chống Nước Unisex - Size L', qty: 5, price: 320000, bin: 'A-03-12', picked: false },
          { sku: 'QJ-3052-BK', name: 'Quần Jogger Thun Co Giãn - Đen - Size XL', qty: 2, price: 125000, bin: 'A-02-08', picked: true },
          { sku: 'TX-1087-BR', name: 'Túi Đeo Chéo Da Tổng Hợp Cao Cấp - Nâu Vintage', qty: 4, price: 190000, bin: 'B-01-04', picked: true },
        ],
      },
      {
        orderId: 'TT-33419',
        channel: 'tiktok',
        customerName: 'Hoàng Minh Quân',
        phone: '0912 345 678',
        address: '72 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:45',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 920000,
        notes: 'Đơn gộp cùng khách với Shopee SP-10482',
        items: [
          { sku: 'KL-5520-PS', name: 'Khăn Lụa Họa Tiết Paisley Phong Cách Cổ Điển', qty: 1, price: 145000, bin: 'B-04-02', picked: true },
          { sku: 'MB-7731-CV', name: 'Mũ Bucket Hat Vải Canvas (Bộ 3 Màu)', qty: 3, price: 95000, bin: 'A-05-11', picked: true },
          { sku: 'TL-6640-LT', name: 'Thắt Lưng Da Bò Khóa Kim Loại Tự Động', qty: 1, price: 180000, bin: 'C-02-06', picked: false },
          { sku: 'KM-2290-PL', name: 'Kính Mát Polarized Tròng Vuông Chống UV400', qty: 2, price: 195000, bin: 'C-01-09', picked: false },
        ],
      },
      {
        orderId: 'LZ-55102',
        channel: 'lazada',
        customerName: 'Hoàng Minh Quân',
        phone: '0912 345 678',
        address: '72 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:50',
        paymentMethod: 'Lazada Wallet (Đã thanh toán)',
        totalAmount: 250000,
        notes: 'Đơn gộp cùng khách Hoàng Minh Quân, đóng chung 1 kiện',
        items: [
          { sku: 'VT-4410-SP', name: 'Vớ Thể Thao Cao Cổ Dệt Kim Kháng Khuẩn (Set 5 Đôi)', qty: 5, price: 50000, bin: 'B-03-15', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'AK-2041-GL', name: 'Áo Khoác Gió Chống Nước Unisex - Size L', qty: 5, bin: 'A-03-12', picked: false },
      { sku: 'QJ-3052-BK', name: 'Quần Jogger Thun Co Giãn - Đen - Size XL', qty: 2, bin: 'A-02-08', picked: true },
      { sku: 'TX-1087-BR', name: 'Túi Đeo Chéo Da Tổng Hợp Cao Cấp - Nâu Vintage', qty: 4, bin: 'B-01-04', picked: true },
      { sku: 'KL-5520-PS', name: 'Khăn Lụa Họa Tiết Paisley Phong Cách Cổ Điển', qty: 1, bin: 'B-04-02', picked: true },
      { sku: 'MB-7731-CV', name: 'Mũ Bucket Hat Vải Canvas (Bộ 3 Màu)', qty: 3, bin: 'A-05-11', picked: true },
      { sku: 'TL-6640-LT', name: 'Thắt Lưng Da Bò Khóa Kim Loại Tự Động', qty: 1, bin: 'C-02-06', picked: false },
      { sku: 'KM-2290-PL', name: 'Kính Mát Polarized Tròng Vuông Chống UV400', qty: 2, bin: 'C-01-09', picked: false },
      { sku: 'VT-4410-SP', name: 'Vớ Thể Thao Cao Cổ Dệt Kim Kháng Khuẩn (Set 5 Đôi)', qty: 5, bin: 'B-03-15', picked: false },
    ],
    aiPackaging: {
      boxCode: 'CARTON-D4',
      dimensions: '40 × 30 × 25 cm',
      fillRatio: 0.91,
    },
  },
  {
    id: 'BTH-20240115-005',
    itemsCount: 30,
    skusCount: 20,
    channels: ['lazada', 'facebook'],
    priority: 'Normal',
    orderType: 'normal',
    slaDetail: {
      orderType: 'normal',
      title: 'Đơn bình thường',
      deadlineText: '18:00 hôm nay',
      remainingText: 'Còn 8h 20m',
      receivedAtText: '09:40',
      officeHoursOnly: false,
      description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
    },
    customerName: 'Nguyễn Tấn Đạt',
    customerPhone: '0966 889 900',
    customerAddress: '102 Cộng Hòa, Phường 4, Quận Tân Bình, TP. Hồ Chí Minh',
    picker: {
      name: 'Chưa phân công',
      avatar: '',
      initials: '--',
    },
    progress: { picked: 0, total: 30 },
    status: 'Pending',
    zone: 'Zone B',
    createdAt: '2026-09-06T09:40:00Z',
    orders: [
      {
        orderId: 'LZ-77821',
        channel: 'lazada',
        customerName: 'Nguyễn Tấn Đạt',
        phone: '0966 889 900',
        address: '102 Cộng Hòa, Phường 4, Quận Tân Bình, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:10',
        paymentMethod: 'Lazada Wallet (Đã thanh toán)',
        totalAmount: 1125000,
        notes: 'Giao trong ngày nay giúp shop',
        items: [
          { sku: 'AL-TURT-01', name: 'Áo Len Cổ Lọ Nam Dày Dặn Phong Cách Hàn Quốc', qty: 15, price: 75000, bin: 'B-04-12', picked: false },
        ],
      },
      {
        orderId: 'FB-44120',
        channel: 'facebook',
        customerName: 'Nguyễn Tấn Đạt',
        phone: '0966 889 900',
        address: '102 Cộng Hòa, Phường 4, Quận Tân Bình, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:20',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 1350000,
        notes: 'Đơn gộp cùng khách Nguyễn Tấn Đạt (Giao buổi sáng)',
        items: [
          { sku: 'KQ-CASH-02', name: 'Khăn Quàng Cổ Cashmere Unisex Màu Be Ấm Áp', qty: 15, price: 90000, bin: 'B-05-08', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'AL-TURT-01', name: 'Áo Len Cổ Lọ Nam Dày Dặn Phong Cách Hàn Quốc', qty: 15, bin: 'B-04-12', picked: false },
      { sku: 'KQ-CASH-02', name: 'Khăn Quàng Cổ Cashmere Unisex Màu Be Ấm Áp', qty: 15, bin: 'B-05-08', picked: false },
    ],
    aiPackaging: {
      boxCode: 'CARTON-E2',
      dimensions: '50 × 40 × 30 cm',
      fillRatio: 0.94,
      cushioning: 'Hộp carton lớn đóng gói áo len và khăn quàng',
    },
  },
  {
    id: 'BTH-20240115-006',
    itemsCount: 18,
    skusCount: 12,
    channels: ['shopee'],
    priority: 'Urgent',
    orderType: 'delayed_packing',
    slaDetail: {
      orderType: 'delayed_packing',
      title: 'Đơn trễ thời gian đóng gói',
      overdueMinutes: 45,
      deadlineText: 'Quá hạn 45 phút',
      remainingText: 'Đã quá hạn đóng gói quy định',
      receivedAtText: '07:45',
      officeHoursOnly: false,
      description: 'Đơn hàng ban đầu là đơn bình thường nhưng bị trễ thời gian đóng gói quy định (+45 phút) nên tự động chuyển thành đơn Trễ đóng gói để ưu tiên xử lý ngay!',
    },
    customerName: 'Lý Kiến Thành',
    customerPhone: '0945 123 456',
    customerAddress: '88 An Dương Vương, Phường 9, Quận 5, TP. Hồ Chí Minh',
    picker: {
      name: 'Fahmi H.',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face',
      initials: 'FH',
    },
    progress: { picked: 10, total: 18 },
    status: 'Delayed',
    zone: 'Zone A',
    createdAt: '2026-09-06T07:45:00Z',
    orders: [
      {
        orderId: 'SP-33012',
        channel: 'shopee',
        customerName: 'Lý Kiến Thành',
        phone: '0945 123 456',
        address: '88 An Dương Vương, Phường 9, Quận 5, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 07:15',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 2160000,
        notes: 'Đơn gộp 2 kiện chung khách',
        items: [
          { sku: 'AK-DOWN-01', name: 'Áo Khoác Phao Dáng Dài Lông Vũ Mũ Trùm Chống Nước', qty: 8, price: 270000, bin: 'A-06-03', picked: true },
          { sku: 'ML-BEAN-02', name: 'Mũ Len Beanie Dệt Kim Giữ Ấm Mùa Đông', qty: 2, price: 150000, bin: 'A-06-05', picked: true },
        ],
      },
      {
        orderId: 'SP-33015',
        channel: 'shopee',
        customerName: 'Lý Kiến Thành',
        phone: '0945 123 456',
        address: '88 An Dương Vương, Phường 9, Quận 5, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 07:20',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 760000,
        notes: 'Giao cùng đơn SP-33012 cho Lý Kiến Thành',
        items: [
          { sku: 'KO-WOOL-03', name: 'Khăn Ống Len Lót Lông Cừu Dày Siêu Ấm', qty: 8, price: 95000, bin: 'A-06-07', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'AK-DOWN-01', name: 'Áo Khoác Phao Dáng Dài Lông Vũ Mũ Trùm Chống Nước', qty: 8, bin: 'A-06-03', picked: true },
      { sku: 'ML-BEAN-02', name: 'Mũ Len Beanie Dệt Kim Giữ Ấm Mùa Đông', qty: 2, bin: 'A-06-05', picked: true },
      { sku: 'KO-WOOL-03', name: 'Khăn Ống Len Lót Lông Cừu Dày Siêu Ấm', qty: 8, bin: 'A-06-07', picked: false },
    ],
    aiPackaging: {
      boxCode: 'CARTON-C2',
      dimensions: '30 × 22 × 18 cm',
      fillRatio: 0.87,
      cushioning: 'Ép phẳng áo phao bảo vệ và tối ưu thể tích carton',
    },
  },
  {
    id: 'BTH-20240115-007',
    itemsCount: 10,
    skusCount: 7,
    channels: ['tiktok', 'lazada'],
    priority: 'Normal',
    orderType: 'normal',
    slaDetail: {
      orderType: 'normal',
      title: 'Đơn bình thường',
      deadlineText: '18:00 hôm nay',
      remainingText: 'Đã hoàn tất',
      receivedAtText: '08:50',
      officeHoursOnly: false,
      description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
    },
    customerName: 'Mai Phương Trang',
    customerPhone: '0922 998 877',
    customerAddress: '42 Tôn Đức Thắng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    picker: {
      name: 'Eka S.',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face',
      initials: 'ES',
    },
    progress: { picked: 10, total: 10 },
    status: 'Picked',
    zone: 'Zone C',
    createdAt: '2026-09-06T08:50:00Z',
    orders: [
      {
        orderId: 'TT-77123',
        channel: 'tiktok',
        customerName: 'Mai Phương Trang',
        phone: '0922 998 877',
        address: '42 Tôn Đức Thắng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:30',
        paymentMethod: 'Ví điện tử Momo (Đã thanh toán)',
        totalAmount: 1250000,
        notes: 'Giao trực tiếp cho người nhận',
        items: [
          { sku: 'PJ-SATN-01', name: 'Set Đồ Ngủ Pijama Lụa Satin Dài Tay Cao Cấp', qty: 5, price: 250000, bin: 'C-01-02', picked: true },
        ],
      },
      {
        orderId: 'LZ-99120',
        channel: 'lazada',
        customerName: 'Mai Phương Trang',
        phone: '0922 998 877',
        address: '42 Tôn Đức Thắng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:35',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 1100000,
        notes: 'Đơn gộp cùng khách Mai Phương Trang, gọi trước 15 phút',
        items: [
          { sku: 'BD-SILK-02', name: 'Băng Đô Cài Tóc Nữ Bằng Lụa Satin Phối Nơ', qty: 5, price: 220000, bin: 'C-01-04', picked: true },
        ],
      },
    ],
    items: [
      { sku: 'PJ-SATN-01', name: 'Set Đồ Ngủ Pijama Lụa Satin Dài Tay Cao Cấp', qty: 5, bin: 'C-01-02', picked: true },
      { sku: 'BD-SILK-02', name: 'Băng Đô Cài Tóc Nữ Bằng Lụa Satin Phối Nơ', qty: 5, bin: 'C-01-04', picked: true },
    ],
    aiPackaging: {
      boxCode: 'CARTON-B3',
      dimensions: '28 × 20 × 16 cm',
      fillRatio: 0.91,
      cushioning: 'Gấp nếp giấy nến chống nhăn đồ lụa',
    },
  },

  // Page 2 & 3 Batches
  ...Array.from({ length: 17 }, (_, idx) => {
    const num = idx + 8
    const id = `BTH-20240115-${String(num).padStart(3, '0')}`
    const channels: BatchChannel[] =
      num % 3 === 0
        ? ['shopee', 'tiktok']
        : num % 3 === 1
          ? ['lazada', 'facebook']
          : ['shopee', 'lazada']
    const zone: BatchZone = num % 3 === 0 ? 'Zone A' : num % 3 === 1 ? 'Zone B' : 'Zone C'
    const status: PickingStatus =
      num % 4 === 0 ? 'Picked' : num % 4 === 1 ? 'Picking' : num % 4 === 2 ? 'Pending' : 'Delayed'
    const total = 10 + (num % 15)
    const picked = status === 'Picked' ? total : status === 'Pending' ? 0 : Math.floor(total * 0.6)

    const customerNames = [
      'Nguyễn Văn Bình',
      'Trần Thị Cúc',
      'Lê Quang Huy',
      'Phạm Minh Tuấn',
      'Đỗ Mỹ Linh',
      'Hoàng Thu Thảo',
      'Vũ Đình Trọng',
      'Bùi Thanh Trúc',
    ]
    const cName = customerNames[num % customerNames.length]!

    const fashionNames = [
      'Áo Thun Cổ Tròn Cotton Dệt Kim Basic',
      'Quần Tây Âu Dáng Slimfit Co Giãn',
      'Chân Váy Xếp Ly Dáng Dài Vintage',
      'Áo Blazer Hàn Quốc Form Rộng Unisex',
      'Khăn Lụa Vuông Quàng Cổ Tinh Tế',
      'Kính Mát Chống Tia UV Polarized Cao Cấp',
      'Thắt Lưng Da Khóa Cài Kim Loại Bền Đẹp',
      'Ví Cầm Tay Da Bò Đựng Thẻ Tối Giản',
    ]
    const fashionName = fashionNames[num % fashionNames.length]!

    const orderType: OrderFulfillmentType =
      num % 5 === 0 ? 'express' : num % 6 === 0 ? 'delayed_packing' : 'normal'
    const priority: PickingPriority =
      orderType === 'express' || orderType === 'delayed_packing' ? 'Urgent' : 'Normal'

    const slaDetail: OrderSlaDetail =
      orderType === 'express'
        ? {
            orderType: 'express',
            title: 'Đơn hỏa tốc',
            slaHours: 4,
            deadlineText: 'Trong vòng 4 tiếng',
            remainingText: 'Còn 2h 45m',
            receivedAtText: '10:00 (Giờ hành chính: 08:00 - 17:30)',
            officeHoursOnly: true,
            description: 'Bắt buộc nhân viên hoàn thành trong 4 tiếng. Chỉ tiếp nhận trong khung giờ hành chính (08:00 - 17:30).',
          }
        : orderType === 'delayed_packing'
          ? {
              orderType: 'delayed_packing',
              title: 'Đơn trễ thời gian đóng gói',
              overdueMinutes: 30 + (num % 35),
              deadlineText: `Quá hạn ${30 + (num % 35)} phút`,
              remainingText: 'Quá hạn đóng gói',
              receivedAtText: '08:00',
              officeHoursOnly: false,
              description: 'Đơn bình thường ban đầu nhưng đã quá hạn đóng gói quy định. Cần ưu tiên xử lý ngay!',
            }
          : {
              orderType: 'normal',
              title: 'Đơn bình thường',
              deadlineText: '18:00 hôm nay',
              remainingText: 'Còn 6h 30m',
              receivedAtText: '10:00',
              officeHoursOnly: false,
              description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
            }

    const cPhone = `09${(num % 9) + 1}1 234 56${num % 10}`
    const cAddress = `${10 + num} Nguyễn Trãi, Phường 3, Quận 5, TP. Hồ Chí Minh`
    const isMultiChannel = channels.length > 1
    const halfQty = Math.max(1, Math.floor(total / 2))
    const restQty = total - halfQty

    const batchOrders: CustomerOrder[] = [
      {
        orderId: `ORD-${num}011`,
        channel: channels[0]!,
        customerName: cName,
        phone: cPhone,
        address: cAddress,
        createdAt: '2026-09-06 09:30',
        paymentMethod: 'Đã thanh toán online',
        totalAmount: 320000 + num * 15000,
        notes: 'Đơn hàng đa kênh',
        items: [
          {
            sku: `FSH-${num}01`,
            name: fashionName,
            qty: isMultiChannel ? halfQty : total,
            price: Math.round((450000 + num * 20000) / total),
            bin: `${zone.slice(-1)}-0${(num % 8) + 1}-0${(num % 9) + 1}`,
            picked: status === 'Picked',
          },
        ],
      },
    ]

    if (isMultiChannel && channels[1]) {
      batchOrders.push({
        orderId: `ORD-${num}022`,
        channel: channels[1],
        customerName: cName,
        phone: cPhone,
        address: cAddress,
        createdAt: '2026-09-06 09:45',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 280000 + num * 12000,
        notes: `Đơn gộp cùng khách ${cName}`,
        items: [
          {
            sku: `FSH-${num}02`,
            name: `${fashionName} (Phụ kiện kèm)`,
            qty: restQty,
            price: Math.round((280000 + num * 12000) / restQty),
            bin: `${zone.slice(-1)}-0${(num % 8) + 2}-0${(num % 9) + 1}`,
            picked: status === 'Picked',
          },
        ],
      })
    }

    return {
      id,
      itemsCount: total,
      skusCount: Math.ceil(total * 0.6),
      channels,
      priority,
      orderType,
      slaDetail,
      customerName: cName,
      customerPhone: cPhone,
      customerAddress: cAddress,
      picker:
        status === 'Pending'
          ? {
              name: 'Chưa phân công',
              avatar: '',
              initials: '--',
            }
          : {
              name: ['Ahmad R.', 'Siti M.', 'Budi P.', 'Rian K.', 'Dewi A.', 'Fahmi H.', 'Eka S.'][num % 7]!,
              avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
              initials: 'NV',
            },
      progress: { picked, total },
      status,
      zone,
      createdAt: '2026-09-06T10:00:00Z',
      orders: batchOrders,
      items: [
        {
          sku: `FSH-${num}01`,
          name: fashionName,
          qty: isMultiChannel ? halfQty : total,
          bin: `${zone.slice(-1)}-0${(num % 8) + 1}-0${(num % 9) + 1}`,
          picked: status === 'Picked',
        },
        ...(isMultiChannel
          ? [
              {
                sku: `FSH-${num}02`,
                name: `${fashionName} (Phụ kiện kèm)`,
                qty: restQty,
                bin: `${zone.slice(-1)}-0${(num % 8) + 2}-0${(num % 9) + 1}`,
                picked: status === 'Picked',
              },
            ]
          : []),
      ],
      aiPackaging: {
        boxCode: `CARTON-B${(num % 4) + 1}`,
        dimensions: '30 × 20 × 15 cm',
        fillRatio: 0.88,
      },
    }
  }),
]

// ==========================================
// LOCAL STORAGE & BATCH STATE SYNCHRONIZATION
// ==========================================

export const PICKING_BATCHES_STORAGE_KEY = 'optipack_picking_batches_v3'

export function getStoredBatches(): PickingBatch[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PICKING_BATCHES_STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as PickingBatch[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return initialPickingBatches
}

export function saveStoredBatches(batches: PickingBatch[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PICKING_BATCHES_STORAGE_KEY, JSON.stringify(batches))
      window.dispatchEvent(new CustomEvent('optipack:batches_updated', { detail: batches }))
    }
  } catch {
    // Ignore storage save errors
  }
}

export function updateStoredBatch(
  batchId: string,
  updater: (prev: PickingBatch) => PickingBatch,
): PickingBatch[] {
  const current = getStoredBatches()
  const updated = current.map((b) => (b.id === batchId ? updater(b) : b))
  saveStoredBatches(updated)
  return updated
}

export function updateBatchPicker(
  batchId: string,
  picker: { name: string; avatar: string; initials: string },
): PickingBatch[] {
  return updateStoredBatch(batchId, (b) => ({
    ...b,
    picker,
    // Nếu đơn trước đó đang Pending thì khi đã gán nhân viên bắt đầu lấy hàng có thể chuyển sang Picking
    status: b.status === 'Pending' ? 'Picking' : b.status,
  }))
}

