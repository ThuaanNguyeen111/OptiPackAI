export type PickingPriority = 'Urgent' | 'High' | 'Normal'
export type PickingStatus = 'Picked' | 'Picking' | 'Pending' | 'Delayed'
export type BatchZone = 'Zone A' | 'Zone B' | 'Zone C'
export type BatchChannel = 'shopee' | 'tiktok' | 'lazada' | 'facebook'

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
    skusCount: 8,
    channels: ['shopee', 'tiktok'],
    priority: 'Urgent',
    picker: {
      name: 'Ahmad R.',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      initials: 'AR',
    },
    progress: { picked: 12, total: 12 },
    status: 'Picked',
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
          { sku: 'ML-BASE-03', name: 'Mũ Lưỡi Trai Unisex Thêu Chữ Vintage', qty: 6, price: 90000, bin: 'A-02-08', picked: true },
        ],
      },
    ],
    items: [
      { sku: 'AT-POLO-01', name: 'Áo Polo Nam Cotton Pique Thoáng Khí', qty: 2, bin: 'A-04-12', picked: true },
      { sku: 'QS-KAKI-02', name: 'Quần Short Kaki Nam Co Giãn Form Regular', qty: 4, bin: 'A-04-15', picked: true },
      { sku: 'ML-BASE-03', name: 'Mũ Lưỡi Trai Unisex Thêu Chữ Vintage', qty: 6, bin: 'A-02-08', picked: true },
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
    priority: 'High',
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
        customerName: 'Nguyễn Bích Ngọc',
        phone: '0987 654 321',
        address: '182 Bạch Đằng, Phường 24, Quận Bình Thạnh, TP. Hồ Chí Minh',
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
        customerName: 'Phạm Thu Hương',
        phone: '0933 112 233',
        address: '76 Phan Xích Long, Phường 2, Quận Phú Nhuận, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:15',
        paymentMethod: 'Chuyển khoản ngân hàng MB (Đã thanh toán)',
        totalAmount: 890000,
        notes: 'Tặng kèm túi giấy giúp em',
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
    picker: {
      name: 'Budi P.',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
      initials: 'BP',
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
    itemsCount: 15,
    skusCount: 15,
    channels: ['shopee', 'lazada', 'tiktok', 'facebook'],
    priority: 'High',
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
        customerName: 'Trần Văn An',
        phone: '0901 882 193',
        address: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:30',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 1850000,
        notes: 'Giao giờ hành chính, gọi điện trước khi đến',
        items: [
          { sku: 'AK-2041-GL', name: 'Áo Khoác Gió Chống Nước Unisex - Size L', qty: 5, price: 320000, bin: 'A-03-12', picked: false },
          { sku: 'QJ-3052-BK', name: 'Quần Jogger Thun Co Giãn - Đen - Size XL', qty: 2, price: 125000, bin: 'A-02-08', picked: true },
        ],
      },
      {
        orderId: 'SP-88219',
        channel: 'shopee',
        customerName: 'Lê Hoàng Yến',
        phone: '0918 345 678',
        address: '45 Lê Quý Đôn, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:35',
        paymentMethod: 'Ví ShopeePay (Đã thanh toán)',
        totalAmount: 760000,
        items: [
          { sku: 'TX-1087-BR', name: 'Túi Đeo Chéo Da Tổng Hợp Cao Cấp - Nâu Vintage', qty: 4, price: 190000, bin: 'B-01-04', picked: true },
        ],
      },
      {
        orderId: 'LZ-55102',
        channel: 'lazada',
        customerName: 'Nguyễn Bích Ngọc',
        phone: '0987 654 321',
        address: '182 Bạch Đằng, Phường 24, Quận Bình Thạnh, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:40',
        paymentMethod: 'Lazada Wallet (Đã thanh toán)',
        totalAmount: 145000,
        items: [
          { sku: 'KL-5520-PS', name: 'Khăn Lụa Họa Tiết Paisley Phong Cách Cổ Điển', qty: 1, price: 145000, bin: 'B-04-02', picked: true },
        ],
      },
      {
        orderId: 'TT-33419',
        channel: 'tiktok',
        customerName: 'Đặng Quốc Huy',
        phone: '0977 445 566',
        address: '54 Quang Trung, Phường 10, Quận Gò Vấp, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:45',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 285000,
        items: [
          { sku: 'MB-7731-CV', name: 'Mũ Bucket Hat Vải Canvas (Bộ 3 Màu)', qty: 3, price: 95000, bin: 'A-05-11', picked: false },
        ],
      },
      {
        orderId: 'SP-99201',
        channel: 'shopee',
        customerName: 'Vũ Đức Thắng',
        phone: '0908 776 655',
        address: '28 Đường Số 9, Phường Linh Tây, TP. Thủ Đức, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:50',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 180000,
        items: [
          { sku: 'TL-6640-LT', name: 'Thắt Lưng Da Bò Khóa Kim Loại Tự Động', qty: 1, price: 180000, bin: 'C-02-06', picked: false },
        ],
      },
      {
        orderId: 'FB-99014',
        channel: 'facebook',
        customerName: 'Phạm Thu Hương',
        phone: '0933 112 233',
        address: '76 Phan Xích Long, Phường 2, Quận Phú Nhuận, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:55',
        paymentMethod: 'Chuyển khoản ngân hàng (Đã thanh toán)',
        totalAmount: 390000,
        items: [
          { sku: 'KM-2290-PL', name: 'Kính Mát Polarized Tròng Vuông Chống UV400', qty: 2, price: 195000, bin: 'C-01-09', picked: false },
        ],
      },
      {
        orderId: 'TT-77123',
        channel: 'tiktok',
        customerName: 'Mai Phương Trang',
        phone: '0922 998 877',
        address: '42 Tôn Đức Thắng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:00',
        paymentMethod: 'Ví Momo (Đã thanh toán)',
        totalAmount: 250000,
        items: [
          { sku: 'VT-4410-SP', name: 'Vớ Thể Thao Cao Cổ Dệt Kim Kháng Khuẩn (Set 5 Đôi)', qty: 5, price: 50000, bin: 'B-03-15', picked: false },
        ],
      },
      {
        orderId: 'SP-33012',
        channel: 'shopee',
        customerName: 'Lý Kiến Thành',
        phone: '0945 123 456',
        address: '88 An Dương Vương, Phường 9, Quận 5, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:05',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 580000,
        items: [
          { sku: 'BL-8812-BK', name: 'Balo Laptop Đa Năng 15.6 inch Chống Nước Oxford', qty: 2, price: 290000, bin: 'A-01-03', picked: false },
        ],
      },
      {
        orderId: 'LZ-11849',
        channel: 'lazada',
        customerName: 'Hoàng Kim Liên',
        phone: '0919 223 344',
        address: '15 Nguyễn Thị Thập, Phường Tân Phú, Quận 7, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:10',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 520000,
        items: [
          { sku: 'AP-1120-WT', name: 'Áo Polo Nam Thể Thao Co Giãn Thoáng Khí', qty: 4, price: 130000, bin: 'A-04-07', picked: false },
        ],
      },
      {
        orderId: 'FB-44120',
        channel: 'facebook',
        customerName: 'Trịnh Mai Khanh',
        phone: '0903 778 899',
        address: '254 Ba Tháng Hai, Phường 12, Quận 10, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:15',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 360000,
        items: [
          { sku: 'QD-9931-DG', name: 'Quần Đùi Thể Thao 2 Lớp Chạy Bộ Có Túi Khóa', qty: 3, price: 120000, bin: 'B-02-10', picked: false },
        ],
      },
      {
        orderId: 'LZ-77821',
        channel: 'lazada',
        customerName: 'Nguyễn Tấn Đạt',
        phone: '0966 889 900',
        address: '102 Cộng Hòa, Phường 4, Quận Tân Bình, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:20',
        paymentMethod: 'Lazada Wallet (Đã thanh toán)',
        totalAmount: 220000,
        items: [
          { sku: 'VN-3321-BR', name: 'Ví Nam Da Bò Thật Nhiều Ngăn Đựng Thẻ Khóa Zip', qty: 1, price: 220000, bin: 'C-03-05', picked: false },
        ],
      },
      {
        orderId: 'SP-33015',
        channel: 'shopee',
        customerName: 'Lý Kiến Thành',
        phone: '0945 123 456',
        address: '88 An Dương Vương, Phường 9, Quận 5, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:25',
        paymentMethod: 'ShopeePay (Đã thanh toán)',
        totalAmount: 480000,
        items: [
          { sku: 'DH-7740-SL', name: 'Đồng Hồ Thể Thao Điện Tử Dây Silicone Chống Nước', qty: 2, price: 240000, bin: 'C-04-14', picked: false },
        ],
      },
      {
        orderId: 'TT-77124',
        channel: 'tiktok',
        customerName: 'Mai Phương Trang',
        phone: '0922 998 877',
        address: '42 Tôn Đức Thắng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:30',
        paymentMethod: 'Ví Momo (Đã thanh toán)',
        totalAmount: 210000,
        items: [
          { sku: 'GT-5501-GY', name: 'Găng Tay Đi Xe Máy Chống Nắng Tia UV Co Giãn', qty: 3, price: 70000, bin: 'B-05-01', picked: false },
        ],
      },
      {
        orderId: 'LZ-99120',
        channel: 'lazada',
        customerName: 'Bùi Thế Hiển',
        phone: '0981 334 455',
        address: '15 Kỳ Đồng, Phường 9, Quận 3, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:35',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 450000,
        items: [
          { sku: 'SN-2219-BL', name: 'Giày Sneaker Thể Thao Nam Nữ Đệm Khí Êm Ái', qty: 1, price: 450000, bin: 'A-06-16', picked: false },
        ],
      },
    ],
    items: [
      { sku: 'AK-2041-GL', name: 'Áo Khoác Gió Chống Nước Unisex - Size L', qty: 5, bin: 'A-03-12', picked: false },
      { sku: 'QJ-3052-BK', name: 'Quần Jogger Thun Co Giãn - Đen - Size XL', qty: 2, bin: 'A-02-08', picked: true },
      { sku: 'TX-1087-BR', name: 'Túi Đeo Chéo Da Tổng Hợp Cao Cấp - Nâu Vintage', qty: 4, bin: 'B-01-04', picked: true },
      { sku: 'KL-5520-PS', name: 'Khăn Lụa Họa Tiết Paisley Phong Cách Cổ Điển', qty: 1, bin: 'B-04-02', picked: true },
      { sku: 'MB-7731-CV', name: 'Mũ Bucket Hat Vải Canvas (Bộ 3 Màu)', qty: 3, bin: 'A-05-11', picked: false },
      { sku: 'TL-6640-LT', name: 'Thắt Lưng Da Bò Khóa Kim Loại Tự Động', qty: 1, bin: 'C-02-06', picked: false },
      { sku: 'KM-2290-PL', name: 'Kính Mát Polarized Tròng Vuông Chống UV400', qty: 2, bin: 'C-01-09', picked: false },
      { sku: 'VT-4410-SP', name: 'Vớ Thể Thao Cao Cổ Dệt Kim Kháng Khuẩn (Set 5 Đôi)', qty: 5, bin: 'B-03-15', picked: false },
      { sku: 'BL-8812-BK', name: 'Balo Laptop Đa Năng 15.6 inch Chống Nước Oxford', qty: 2, bin: 'A-01-03', picked: false },
      { sku: 'AP-1120-WT', name: 'Áo Polo Nam Thể Thao Co Giãn Thoáng Khí', qty: 4, bin: 'A-04-07', picked: false },
      { sku: 'QD-9931-DG', name: 'Quần Đùi Thể Thao 2 Lớp Chạy Bộ Có Túi Khóa', qty: 3, bin: 'B-02-10', picked: false },
      { sku: 'VN-3321-BR', name: 'Ví Nam Da Bò Thật Nhiều Ngăn Đựng Thẻ Khóa Zip', qty: 1, bin: 'C-03-05', picked: false },
      { sku: 'DH-7740-SL', name: 'Đồng Hồ Thể Thao Điện Tử Dây Silicone Chống Nước', qty: 2, bin: 'C-04-14', picked: false },
      { sku: 'GT-5501-GY', name: 'Găng Tay Đi Xe Máy Chống Nắng Tia UV Co Giãn', qty: 3, bin: 'B-05-01', picked: false },
      { sku: 'SN-2219-BL', name: 'Giày Sneaker Thể Thao Nam Nữ Đệm Khí Êm Ái', qty: 1, bin: 'A-06-16', picked: false },
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
    picker: {
      name: 'Dewi A.',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
      initials: 'DA',
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
        customerName: 'Trịnh Mai Khanh',
        phone: '0903 778 899',
        address: '254 Ba Tháng Hai, Phường 12, Quận 10, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 09:20',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 1350000,
        notes: 'Giao buổi sáng',
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
        notes: 'Giao cùng đơn SP-33012',
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
        customerName: 'Bùi Thế Hiển',
        phone: '0981 334 455',
        address: '15 Kỳ Đồng, Phường 9, Quận 3, TP. Hồ Chí Minh',
        createdAt: '2026-09-06 08:35',
        paymentMethod: 'COD (Thu tiền khi nhận hàng)',
        totalAmount: 1100000,
        notes: 'Gọi trước 15 phút',
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
    const priority: PickingPriority = num % 3 === 0 ? 'Urgent' : num % 3 === 1 ? 'High' : 'Normal'
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

    return {
      id,
      itemsCount: total,
      skusCount: Math.ceil(total * 0.6),
      channels,
      priority,
      picker: {
        name: ['Ahmad R.', 'Siti M.', 'Budi P.', 'Rian K.', 'Dewi A.', 'Fahmi H.', 'Eka S.'][num % 7]!,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
        initials: 'NV',
      },
      progress: { picked, total },
      status,
      zone,
      createdAt: '2026-09-06T10:00:00Z',
      orders: [
        {
          orderId: `ORD-${num}011`,
          channel: channels[0]!,
          customerName: cName,
          phone: `09${num}1 234 567`,
          address: `${10 + num} Nguyễn Trãi, Phường 3, Quận 5, TP. Hồ Chí Minh`,
          createdAt: '2026-09-06 09:30',
          paymentMethod: 'Đã thanh toán online',
          totalAmount: 450000 + num * 20000,
          notes: 'Giao hàng tiêu chuẩn',
          items: [
            {
              sku: `FSH-${num}01`,
              name: fashionName,
              qty: total,
              price: Math.round((450000 + num * 20000) / total),
              bin: `${zone.slice(-1)}-0${(num % 8) + 1}-0${(num % 9) + 1}`,
              picked: status === 'Picked',
            },
          ],
        },
      ],
      items: [
        {
          sku: `FSH-${num}01`,
          name: fashionName,
          qty: total,
          bin: `${zone.slice(-1)}-0${(num % 8) + 1}-0${(num % 9) + 1}`,
          picked: status === 'Picked',
        },
      ],
      aiPackaging: {
        boxCode: `CARTON-B${(num % 4) + 1}`,
        dimensions: '30 × 20 × 15 cm',
        fillRatio: 0.88,
      },
    }
  }),
]
