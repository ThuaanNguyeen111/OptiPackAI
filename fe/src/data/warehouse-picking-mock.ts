import {
  initialPickingBatches,
  type PickingBatch,
} from './picking-batches-mock'

export interface WarehousePickingItem {
  id: string
  name: string
  shortName: string
  sku: string
  upc: string
  location: string // e.g. KỆ 03 - NGĂN 12
  zone: string
  rack: string
  bin: string
  qty: number
  qtyPicked: number
  status: 'picking' | 'picked' | 'queued' | 'short'
  imageUrl: string
  channel: 'shopee' | 'tiktok' | 'lazada' | 'facebook'
  orderId: string
  customerName: string
}

/** Product image lookup by SKU and keyword with reliable Unsplash fashion assets */
export function getProductImage(sku: string, name: string): string {
  const s = sku.toUpperCase()
  const n = name.toLowerCase()

  // 1. Áo Blazer / Áo Vest
  if (s.includes('BZ') || n.includes('blazer') || n.includes('vest')) {
    return 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&auto=format&fit=crop&q=80'
  }
  // 2. Áo Khoác Gió / Áo Phao / Jacket / Hoodie
  if (s.includes('AK') || n.includes('áo khoác') || n.includes('phao') || n.includes('jacket') || n.includes('hoodie')) {
    return 'https://images.unsplash.com/photo-1544441893-675973e31985?w=500&auto=format&fit=crop&q=80'
  }
  // 3. Áo Len / Cardigan / Áo Cổ Lọ
  if (s.includes('AL') || n.includes('len') || n.includes('cardigan') || n.includes('sweater')) {
    return 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500&auto=format&fit=crop&q=80'
  }
  // 4. Áo Sơ Mi / Oxford
  if (s.includes('SM') || n.includes('sơ mi') || n.includes('oxford')) {
    return 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&auto=format&fit=crop&q=80'
  }
  // 5. Áo Thun / Áo Polo
  if (s.includes('AT') || s.includes('POLO') || n.includes('thun') || n.includes('polo')) {
    return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80'
  }
  // 6. Váy / Đầm / Chân Váy
  if (s.includes('VD') || n.includes('váy') || n.includes('đầm') || n.includes('skirt')) {
    return 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=500&auto=format&fit=crop&q=80'
  }
  // 7. Đồ Ngủ / Pijama
  if (s.includes('PJ') || n.includes('pijama') || n.includes('đồ ngủ')) {
    return 'https://images.unsplash.com/photo-1571513722275-4b41940f54b8?w=500&auto=format&fit=crop&q=80'
  }
  // 8. Quần Jogger / Quần Short / Quần Tây / Quần Jeans
  if (s.includes('QJ') || s.includes('QS') || n.includes('jogger') || n.includes('quần') || n.includes('short') || n.includes('jean')) {
    return 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=500&auto=format&fit=crop&q=80'
  }
  // 9. Túi Xách / Balo
  if (s.includes('TX') || s.includes('BL') || n.includes('túi') || n.includes('balo') || n.includes('bag')) {
    return 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500&auto=format&fit=crop&q=80'
  }
  // 10. Ví Da / Clutch Cầm Tay
  if (s.includes('VD-CLUT') || s.includes('VI') || n.includes('ví') || n.includes('clutch') || n.includes('wallet')) {
    return 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=500&auto=format&fit=crop&q=80'
  }
  // 11. Khăn Choàng / Khăn Quàng / Khăn Lụa / Cashmere
  if (s.includes('KL') || s.includes('KC') || s.includes('KQ') || n.includes('khăn') || n.includes('cashmere')) {
    return 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=500&auto=format&fit=crop&q=80'
  }
  // 12. Mũ / Nón / Bucket Hat / Beanie
  if (s.includes('MB') || s.includes('ML') || n.includes('mũ') || n.includes('nón') || n.includes('bucket') || n.includes('beanie')) {
    return 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=500&auto=format&fit=crop&q=80'
  }
  // 13. Thắt Lưng / Dây Nịt
  if (s.includes('TL') || n.includes('thắt lưng') || n.includes('dây nịt') || n.includes('belt')) {
    return 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=500&auto=format&fit=crop&q=80'
  }
  // 14. Kính Mát / Kính Râm
  if (s.includes('KM') || n.includes('kính') || n.includes('sunglasses')) {
    return 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&auto=format&fit=crop&q=80'
  }
  // 15. Dây Chuyền / Trang Sức / Bạc
  if (s.includes('DC') || n.includes('dây chuyền') || n.includes('vòng') || n.includes('bạc') || n.includes('nhẫn') || n.includes('jewelry')) {
    return 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&auto=format&fit=crop&q=80'
  }
  // 16. Cà Vạt
  if (s.includes('CV') || n.includes('cà vạt') || n.includes('tie')) {
    return 'https://images.unsplash.com/photo-1589756823695-278bc923f962?w=500&auto=format&fit=crop&q=80'
  }
  // 17. Vớ / Tất
  if (s.includes('VT') || n.includes('vớ') || n.includes('tất') || n.includes('socks')) {
    return 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=500&auto=format&fit=crop&q=80'
  }
  // 18. Găng Tay
  if (s.includes('GT') || n.includes('găng tay') || n.includes('gloves')) {
    return 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?w=500&auto=format&fit=crop&q=80'
  }
  // 19. Đồng Hồ
  if (s.includes('DH') || n.includes('đồng hồ') || n.includes('watch')) {
    return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80'
  }
  // 20. Giày / Sneaker
  if (s.includes('SN') || n.includes('giày') || n.includes('sneaker') || n.includes('shoes')) {
    return 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80'
  }

  // Fallback default fashion photo
  return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80'
}

/** Pre-configured 15 fashion items matching the provided design screenshot */
export const initialWarehousePickingItems: WarehousePickingItem[] = [
  {
    id: 'item-01',
    name: 'Áo Khoác Gió Chống Nước Unisex - Size L',
    shortName: 'Áo Khoác Gió Chống Nước Unisex',
    sku: 'AK-2041-GL',
    upc: '893210475823',
    location: 'KỆ 03 - NGĂN 12',
    zone: 'Kho tổng',
    rack: 'KỆ 03',
    bin: 'NGĂN 12',
    qty: 5,
    qtyPicked: 3,
    status: 'picking',
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-02',
    name: 'Quần Jogger Thun Co Giãn - Đen - Size XL',
    shortName: 'Quần Jogger Thun Co Giãn - Đen',
    sku: 'QJ-3052-BK',
    upc: '893210475824',
    location: 'KỆ 02 - NGĂN 08',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 08',
    qty: 2,
    qtyPicked: 2,
    status: 'picked',
    imageUrl: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-03',
    name: 'Túi Đeo Chéo Da Tổng Hợp Cao Cấp - Nâu Vintage',
    shortName: 'Túi Đeo Chéo Da Tổng Hợp',
    sku: 'TX-1087-BR',
    upc: '893210475825',
    location: 'KỆ 01 - NGĂN 04',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 04',
    qty: 4,
    qtyPicked: 4,
    status: 'picked',
    imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-04',
    name: 'Khăn Lụa Họa Tiết Paisley Phong Cách Cổ Điển',
    shortName: 'Khăn Lụa Họa Tiết Paisley',
    sku: 'KL-5520-PS',
    upc: '893210475826',
    location: 'KỆ 04 - NGĂN 02',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 02',
    qty: 1,
    qtyPicked: 1,
    status: 'picked',
    imageUrl: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-05',
    name: 'Mũ Bucket Hat Vải Canvas (Bộ 3 Màu)',
    shortName: 'Mũ Bucket Hat Vải Canvas (Bộ 3)',
    sku: 'MB-7731-CV',
    upc: '893210475827',
    location: 'KỆ 05 - NGĂN 11',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 11',
    qty: 3,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-06',
    name: 'Thắt Lưng Da Bò Khóa Kim Loại Tự Động',
    shortName: 'Thắt Lưng Da Bò Khóa Kim Loại',
    sku: 'TL-6640-LT',
    upc: '893210475828',
    location: 'KỆ 02 - NGĂN 06',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 06',
    qty: 1,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-07',
    name: 'Kính Mát Polarized Tròng Vuông Chống UV400',
    shortName: 'Kính Mát Polarized Tròng Vuông',
    sku: 'KM-2290-PL',
    upc: '893210475829',
    location: 'KỆ 01 - NGĂN 09',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 09',
    qty: 2,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-08',
    name: 'Vớ Thể Thao Cao Cổ Dệt Kim Kháng Khuẩn (Set 5 Đôi)',
    shortName: 'Vớ Thể Thao Cao Cổ (5 Đôi)',
    sku: 'VT-4410-SP',
    upc: '893210475830',
    location: 'KỆ 03 - NGĂN 15',
    zone: 'Kho tổng',
    rack: 'KỆ 03',
    bin: 'NGĂN 15',
    qty: 5,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-09',
    name: 'Balo Laptop Đa Năng 15.6 inch Chống Nước Oxford',
    shortName: 'Balo Laptop Đa Năng 15.6 inch',
    sku: 'BL-8812-BK',
    upc: '893210475831',
    location: 'KỆ 01 - NGĂN 03',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 03',
    qty: 2,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-10',
    name: 'Áo Polo Nam Thể Thao Co Giãn Thoáng Khí',
    shortName: 'Áo Polo Thể Thao Co Giãn',
    sku: 'AP-1120-WT',
    upc: '893210475832',
    location: 'KỆ 04 - NGĂN 07',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 07',
    qty: 4,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-11',
    name: 'Quần Đùi Thể Thao 2 Lớp Chạy Bộ Có Túi Khóa',
    shortName: 'Quần Đùi Chạy Bộ 2 Lớp',
    sku: 'QD-9931-DG',
    upc: '893210475833',
    location: 'KỆ 02 - NGĂN 10',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 10',
    qty: 3,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-12',
    name: 'Ví Nam Da Bò Thật Nhiều Ngăn Đựng Thẻ Khóa Zip',
    shortName: 'Ví Nam Da Bò Khóa Zip',
    sku: 'VN-3321-BR',
    upc: '893210475834',
    location: 'KỆ 03 - NGĂN 05',
    zone: 'Kho tổng',
    rack: 'KỆ 03',
    bin: 'NGĂN 05',
    qty: 1,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-13',
    name: 'Đồng Hồ Thể Thao Điện Tử Dây Silicone Chống Nước',
    shortName: 'Đồng Hồ Thể Thao Chống Nước',
    sku: 'DH-7740-SL',
    upc: '893210475835',
    location: 'KỆ 04 - NGĂN 14',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 14',
    qty: 2,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-14',
    name: 'Găng Tay Đi Xe Máy Chống Nắng Tia UV Co Giãn',
    shortName: 'Găng Tay Đi Xe Chống Nắng',
    sku: 'GT-5501-GY',
    upc: '893210475836',
    location: 'KỆ 05 - NGĂN 01',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 01',
    qty: 3,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-22910',
    customerName: 'Trần Văn An',
  },
  {
    id: 'item-15',
    name: 'Giày Sneaker Thể Thao Nam Nữ Đệm Khí Êm Ái',
    shortName: 'Giày Sneaker Thoáng Khí',
    sku: 'SN-2219-BL',
    upc: '893210475837',
    location: 'KỆ 06 - NGĂN 16',
    zone: 'Kho tổng',
    rack: 'KỆ 06',
    bin: 'NGĂN 16',
    qty: 1,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-10482',
    customerName: 'Trần Văn An',
  },
]

/**
 * Trích xuất danh sách mặt hàng người đặt yêu cầu theo đợt lấy hàng (PickingBatch).
 */
export function getPickingItemsForBatch(batch: PickingBatch): WarehousePickingItem[] {
  // If batch is BTH-20240115-004, return the 15 screenshot items directly
  if (batch.id === 'BTH-20240115-004') {
    return initialWarehousePickingItems
  }

  const result: WarehousePickingItem[] = []

  batch.orders.forEach((order, orderIdx) => {
    order.items.forEach((item, itemIdx) => {
      let zone: string = 'Kho tổng'
      let rack: string = 'KỆ 01'
      let bin: string = 'NGĂN 01'
      let location: string = `KỆ 01 - NGĂN 01`

      if (item.bin && item.bin.includes('-')) {
        const parts = item.bin.split('-')
        const r = parts[1]?.trim() || '01'
        const b = parts[2]?.trim() || '01'
        zone = 'Kho tổng'
        rack = `KỆ ${r.padStart(2, '0')}`
        bin = `NGĂN ${b.padStart(2, '0')}`
        location = `${rack} - ${bin}`
      } else if (item.bin) {
        location = item.bin
      }

      // Generate deterministic 12-digit UPC barcode
      const rawDigits = `${item.sku}${order.orderId}${itemIdx}`.replace(/[^0-9]/g, '')
      const suffix = rawDigits.length >= 9 ? rawDigits.slice(0, 9) : rawDigits.padEnd(9, '3')
      const upc = `893${suffix}`

      // Clean short name
      const shortName = item.name
        .replace(/\s*-\s*Size.*|\s*\(Set.*|\s*\(Bộ.*|\s*Khóa.*|\s*Cao Cấp.*|\s*PD 22\.5W.*|\s*100W.*/gi, '')
        .trim()

      const isPicked = item.picked || batch.status === 'Picked'
      const isPicking = !isPicked && (batch.status === 'Picking' || itemIdx === 0)

      result.push({
        id: `${batch.id}-${order.orderId}-${item.sku}-${orderIdx}-${itemIdx}`,
        name: item.name,
        shortName,
        sku: item.sku,
        upc,
        location,
        zone,
        rack,
        bin,
        qty: item.qty,
        qtyPicked: isPicked ? item.qty : 0,
        status: isPicked ? 'picked' : isPicking ? 'picking' : 'queued',
        imageUrl: getProductImage(item.sku, item.name),
        channel: order.channel,
        orderId: order.orderId,
        customerName: order.customerName,
      })
    })
  })

  if (result.length > 0) {
    // If none is 'picking', make the first unpicked item 'picking' so it appears as active target
    if (!result.some((it) => it.status === 'picking')) {
      const firstQueued = result.find((it) => it.status === 'queued')
      if (firstQueued) {
        firstQueued.status = 'picking'
      } else {
        const firstUnpicked = result.find((it) => it.status !== 'picked')
        if (firstUnpicked) {
          firstUnpicked.status = 'picking'
        }
      }
    }
    return result
  }

  return initialWarehousePickingItems
}

/** Get batch and items given an optional batchId */
export function getBatchAndItems(batchId: string | null): {
  batch: PickingBatch
  items: WarehousePickingItem[]
} {
  const batch =
    (batchId ? initialPickingBatches.find((b) => b.id === batchId) : null) ??
    initialPickingBatches[0]!

  const items = getPickingItemsForBatch(batch)
  return { batch, items }
}

// ==========================================
// REAL-TIME WAREHOUSE INVENTORY MANAGEMENT
// ==========================================

export interface WarehouseStockItem {
  sku: string
  name: string
  shortName: string
  upc: string
  location: string
  zone: string
  rack: string
  bin: string
  initialStock: number
  pickedQuantity: number
  currentStock: number
  safetyThreshold: number
  imageUrl: string
  status: 'optimal' | 'moderate' | 'low'
  lastUpdatedText: string
  recentDeduction?: number | null
}

export const INITIAL_WAREHOUSE_STOCK_LIST: WarehouseStockItem[] = [
  {
    sku: 'AT-POLO-01',
    name: 'Áo Polo Nam Cotton Pique Thoáng Khí',
    shortName: 'Áo Polo Nam Cotton Pique',
    upc: '8938501230001',
    location: 'KỆ 04 - NGĂN 12',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 12',
    initialStock: 68,
    pickedQuantity: 0,
    currentStock: 68,
    safetyThreshold: 15,
    imageUrl: getProductImage('AT-POLO-01', 'Áo Polo Nam'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'QS-KAKI-02',
    name: 'Quần Short Kaki Nam Co Giãn Form Regular',
    shortName: 'Quần Short Kaki Nam',
    upc: '8938501230002',
    location: 'KỆ 04 - NGĂN 15',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 15',
    initialStock: 45,
    pickedQuantity: 0,
    currentStock: 45,
    safetyThreshold: 12,
    imageUrl: getProductImage('QS-KAKI-02', 'Quần Short'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'ML-BASE-03',
    name: 'Mũ Lưỡi Trai Unisex Thêu Chữ Vintage',
    shortName: 'Mũ Lưỡi Trai Unisex',
    upc: '8938501230005',
    location: 'KỆ 02 - NGĂN 08',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 08',
    initialStock: 55,
    pickedQuantity: 0,
    currentStock: 55,
    safetyThreshold: 10,
    imageUrl: getProductImage('ML-BASE-03', 'Mũ Lưỡi Trai'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'SM-OXFD-01',
    name: 'Áo Sơ Mi Nam Công Sở Vải Oxford Chống Nhăn',
    shortName: 'Áo Sơ Mi Oxford Nam',
    upc: '8938501230003',
    location: 'KỆ 01 - NGĂN 05',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 05',
    initialStock: 82,
    pickedQuantity: 0,
    currentStock: 82,
    safetyThreshold: 20,
    imageUrl: getProductImage('SM-OXFD-01', 'Áo Sơ Mi'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'CV-SILK-02',
    name: 'Cà Vạt Lụa Nam Họa Tiết Chấm Bi Cao Cấp',
    shortName: 'Cà Vạt Lụa Nam',
    upc: '8938501230004',
    location: 'KỆ 02 - NGĂN 14',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 14',
    initialStock: 34,
    pickedQuantity: 0,
    currentStock: 34,
    safetyThreshold: 10,
    imageUrl: getProductImage('CV-SILK-02', 'Cà Vạt Lụa'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'TL-AUTO-03',
    name: 'Thắt Lưng Da Nam Khóa Tự Động Hợp Kim Titan',
    shortName: 'Thắt Lưng Da Nam Khóa Tự Động',
    upc: '8938501230005',
    location: 'KỆ 05 - NGĂN 02',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 02',
    initialStock: 56,
    pickedQuantity: 0,
    currentStock: 56,
    safetyThreshold: 15,
    imageUrl: getProductImage('TL-AUTO-03', 'Thắt Lưng Da'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'AK-DOWN-01',
    name: 'Áo Khoác Phao Dáng Dài Lông Vũ Mũ Trùm Chống Nước',
    shortName: 'Áo Khoác Phao Dáng Dài Lông Vũ',
    upc: '8938501230006',
    location: 'KỆ 06 - NGĂN 03',
    zone: 'Kho tổng',
    rack: 'KỆ 06',
    bin: 'NGĂN 03',
    initialStock: 28,
    pickedQuantity: 0,
    currentStock: 28,
    safetyThreshold: 10,
    imageUrl: getProductImage('AK-DOWN-01', 'Áo Khoác Phao'),
    status: 'moderate',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'ML-BEAN-02',
    name: 'Mũ Len Beanie Dệt Kim Giữ Ấm Mùa Đông',
    shortName: 'Mũ Len Beanie Dệt Kim',
    upc: '8938501230007',
    location: 'KỆ 06 - NGĂN 05',
    zone: 'Kho tổng',
    rack: 'KỆ 06',
    bin: 'NGĂN 05',
    initialStock: 40,
    pickedQuantity: 0,
    currentStock: 40,
    safetyThreshold: 12,
    imageUrl: getProductImage('ML-BEAN-02', 'Mũ Len Beanie'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'KO-WOOL-03',
    name: 'Khăn Ống Len Lót Lông Cừu Dày Siêu Ấm',
    shortName: 'Khăn Ống Len Lót Lông Cừu',
    upc: '8938501230008',
    location: 'KỆ 06 - NGĂN 07',
    zone: 'Kho tổng',
    rack: 'KỆ 06',
    bin: 'NGĂN 07',
    initialStock: 35,
    pickedQuantity: 0,
    currentStock: 35,
    safetyThreshold: 10,
    imageUrl: getProductImage('KO-WOOL-03', 'Khăn Ống Len'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'AL-TURT-01',
    name: 'Áo Len Cổ Lọ Nam Dày Dặn Phong Cách Hàn Quốc',
    shortName: 'Áo Len Cổ Lọ Hàn Quốc',
    upc: '8938501230009',
    location: 'KỆ 04 - NGĂN 12',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 12',
    initialStock: 90,
    pickedQuantity: 0,
    currentStock: 90,
    safetyThreshold: 20,
    imageUrl: getProductImage('AL-TURT-01', 'Áo Len Cổ Lọ'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'KQ-CASH-02',
    name: 'Khăn Quàng Cổ Cashmere Unisex Màu Be Ấm Áp',
    shortName: 'Khăn Quàng Cashmere',
    upc: '8938501230010',
    location: 'KỆ 05 - NGĂN 08',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 08',
    initialStock: 42,
    pickedQuantity: 0,
    currentStock: 42,
    safetyThreshold: 12,
    imageUrl: getProductImage('KQ-CASH-02', 'Khăn Quàng Cashmere'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'PJ-SATN-01',
    name: 'Set Đồ Ngủ Pijama Lụa Satin Dài Tay Cao Cấp',
    shortName: 'Set Pijama Lụa Satin',
    upc: '8938501230011',
    location: 'KỆ 01 - NGĂN 02',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 02',
    initialStock: 52,
    pickedQuantity: 0,
    currentStock: 52,
    safetyThreshold: 15,
    imageUrl: getProductImage('PJ-SATN-01', 'Pijama Lụa'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'BD-SILK-02',
    name: 'Băng Đô Cài Tóc Nữ Bằng Lụa Satin Phối Nơ',
    shortName: 'Băng Đô Cài Tóc Lụa',
    upc: '8938501230012',
    location: 'KỆ 01 - NGĂN 04',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 04',
    initialStock: 64,
    pickedQuantity: 0,
    currentStock: 64,
    safetyThreshold: 15,
    imageUrl: getProductImage('BD-SILK-02', 'Băng Đô Lụa'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'AK-2041-GL',
    name: 'Áo Khoác Gió Chống Nước Unisex - Size L',
    shortName: 'Áo Khoác Gió Chống Nước Unisex',
    upc: '893210475823',
    location: 'KỆ 03 - NGĂN 12',
    zone: 'Kho tổng',
    rack: 'KỆ 03',
    bin: 'NGĂN 12',
    initialStock: 75,
    pickedQuantity: 3,
    currentStock: 72,
    safetyThreshold: 15,
    imageUrl: getProductImage('AK-2041-GL', 'Áo Khoác Gió'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'QJ-3052-BK',
    name: 'Quần Jogger Thun Co Giãn - Đen - Size XL',
    shortName: 'Quần Jogger Thun Co Giãn - Đen',
    upc: '893210475824',
    location: 'KỆ 02 - NGĂN 08',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 08',
    initialStock: 50,
    pickedQuantity: 2,
    currentStock: 48,
    safetyThreshold: 12,
    imageUrl: getProductImage('QJ-3052-BK', 'Quần Jogger'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'TX-1087-BR',
    name: 'Túi Đeo Chéo Da Tổng Hợp Cao Cấp - Nâu Vintage',
    shortName: 'Túi Đeo Chéo Da Tổng Hợp',
    upc: '893210475825',
    location: 'KỆ 01 - NGĂN 04',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 04',
    initialStock: 38,
    pickedQuantity: 0,
    currentStock: 38,
    safetyThreshold: 10,
    imageUrl: getProductImage('TX-1087-BR', 'Túi Đeo Chéo'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'SM-9021-WT',
    name: 'Áo Sơ Mi Trắng Oxford Nam Cổ Bẻ - Size M',
    shortName: 'Áo Sơ Mi Trắng Oxford Nam',
    upc: '893210475826',
    location: 'KỆ 04 - NGĂN 02',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 02',
    initialStock: 65,
    pickedQuantity: 0,
    currentStock: 65,
    safetyThreshold: 15,
    imageUrl: getProductImage('SM-9021-WT', 'Áo Sơ Mi Trắng'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'VD-4019-FL',
    name: 'Váy Hoa Nhí Vintage Dáng Dài Nữ Tính - Size S',
    shortName: 'Váy Hoa Nhí Vintage Dáng Dài',
    upc: '893210475827',
    location: 'KỆ 03 - NGĂN 09',
    zone: 'Kho tổng',
    rack: 'KỆ 03',
    bin: 'NGĂN 09',
    initialStock: 42,
    pickedQuantity: 0,
    currentStock: 42,
    safetyThreshold: 12,
    imageUrl: getProductImage('VD-4019-FL', 'Váy Hoa Nhí'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'MB-5012-KH',
    name: 'Mũ Bucket Vải Canvas Màu Be Trẻ Trung',
    shortName: 'Mũ Bucket Vải Canvas Be',
    upc: '893210475828',
    location: 'KỆ 05 - NGĂN 11',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 11',
    initialStock: 55,
    pickedQuantity: 0,
    currentStock: 55,
    safetyThreshold: 15,
    imageUrl: getProductImage('MB-5012-KH', 'Mũ Bucket'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'AL-6031-CR',
    name: 'Áo Len Cổ Lọ Dệt Kim Dày Dặn Mùa Đông',
    shortName: 'Áo Len Cổ Lọ Dệt Kim',
    upc: '893210475829',
    location: 'KỆ 02 - NGĂN 07',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 07',
    initialStock: 40,
    pickedQuantity: 0,
    currentStock: 40,
    safetyThreshold: 12,
    imageUrl: getProductImage('AL-6031-CR', 'Áo Len Cổ Lọ'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'VD-CLUT-88',
    name: 'Ví Da Mini Cầm Tay Khóa Kéo Cao Cấp',
    shortName: 'Ví Da Mini Cầm Tay',
    upc: '893210475830',
    location: 'KỆ 03 - NGĂN 01',
    zone: 'Kho tổng',
    rack: 'KỆ 03',
    bin: 'NGĂN 01',
    initialStock: 30,
    pickedQuantity: 0,
    currentStock: 30,
    safetyThreshold: 10,
    imageUrl: getProductImage('VD-CLUT-88', 'Ví Da Mini'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'VT-7014-GY',
    name: 'Bộ 5 Đôi Vớ Cổ Cao Cotton Khử Mùi Thoáng Khí',
    shortName: 'Bộ 5 Đôi Vớ Cổ Cao Cotton',
    upc: '893210475831',
    location: 'KỆ 01 - NGĂN 03',
    zone: 'Kho tổng',
    rack: 'KỆ 01',
    bin: 'NGĂN 03',
    initialStock: 90,
    pickedQuantity: 0,
    currentStock: 90,
    safetyThreshold: 20,
    imageUrl: getProductImage('VT-7014-GY', 'Bộ Vớ Cổ Cao'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'TL-8023-BK',
    name: 'Thắt Lưng Nam Mặt Khóa Tự Động Da Bò Thật',
    shortName: 'Thắt Lưng Nam Mặt Khóa Tự Động',
    upc: '893210475832',
    location: 'KỆ 05 - NGĂN 02',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 02',
    initialStock: 48,
    pickedQuantity: 0,
    currentStock: 48,
    safetyThreshold: 12,
    imageUrl: getProductImage('TL-8023-BK', 'Thắt Lưng Nam'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'KL-9034-SL',
    name: 'Khăn Lụa Choàng Cổ Vuông Satin Họa Tiết Sang Trọng',
    shortName: 'Khăn Lụa Choàng Cổ Satin',
    upc: '893210475833',
    location: 'KỆ 02 - NGĂN 06',
    zone: 'Kho tổng',
    rack: 'KỆ 02',
    bin: 'NGĂN 06',
    initialStock: 36,
    pickedQuantity: 0,
    currentStock: 36,
    safetyThreshold: 10,
    imageUrl: getProductImage('KL-9034-SL', 'Khăn Lụa Choàng'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'QS-1025-NV',
    name: 'Quần Short Kaki Co Giãn Màu Navy Phong Cách Trẻ',
    shortName: 'Quần Short Kaki Co Giãn Navy',
    upc: '893210475834',
    location: 'KỆ 04 - NGĂN 15',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 15',
    initialStock: 52,
    pickedQuantity: 0,
    currentStock: 52,
    safetyThreshold: 15,
    imageUrl: getProductImage('QS-1025-NV', 'Quần Short Kaki'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'GT-2036-LT',
    name: 'Găng Tay Da Cảm Ứng Lót Lông Ấm Áp Mùa Đông',
    shortName: 'Găng Tay Da Cảm Ứng Lót Lông',
    upc: '893210475835',
    location: 'KỆ 04 - NGĂN 10',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 10',
    initialStock: 25,
    pickedQuantity: 0,
    currentStock: 25,
    safetyThreshold: 10,
    imageUrl: getProductImage('GT-2036-LT', 'Găng Tay Da'),
    status: 'moderate',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'DH-3047-SL',
    name: 'Đồng Hồ Nam Dây Thép Không Gỉ Mặt Xanh Sang Trọng',
    shortName: 'Đồng Hồ Nam Dây Thép Không Gỉ',
    upc: '893210475836',
    location: 'KỆ 05 - NGĂN 04',
    zone: 'Kho tổng',
    rack: 'KỆ 05',
    bin: 'NGĂN 04',
    initialStock: 22,
    pickedQuantity: 0,
    currentStock: 22,
    safetyThreshold: 8,
    imageUrl: getProductImage('DH-3047-SL', 'Đồng Hồ Nam'),
    status: 'moderate',
    lastUpdatedText: 'Thời gian thực',
  },
  {
    sku: 'SN-4058-WH',
    name: 'Giày Sneaker Thể Thao Trắng Trẻ Trung Năng Động',
    shortName: 'Giày Sneaker Thể Thao Trắng',
    upc: '893210475837',
    location: 'KỆ 04 - NGĂN 08',
    zone: 'Kho tổng',
    rack: 'KỆ 04',
    bin: 'NGĂN 08',
    initialStock: 45,
    pickedQuantity: 0,
    currentStock: 45,
    safetyThreshold: 12,
    imageUrl: getProductImage('SN-4058-WH', 'Giày Sneaker Trắng'),
    status: 'optimal',
    lastUpdatedText: 'Thời gian thực',
  },
]

export const WAREHOUSE_STOCK_STORAGE_KEY = 'optipack_warehouse_inventory_stock_v3'

export function computeStockStatus(
  current: number,
  threshold: number,
): 'optimal' | 'moderate' | 'low' {
  if (current <= threshold) return 'low'
  if (current <= threshold * 1.8) return 'moderate'
  return 'optimal'
}

export function getStoredWarehouseStock(
  additionalItems?: WarehousePickingItem[],
): Record<string, WarehouseStockItem> {
  const map: Record<string, WarehouseStockItem> = {}
  INITIAL_WAREHOUSE_STOCK_LIST.forEach((item) => {
    map[item.sku] = { ...item }
  })

  // Ensure any item in the current batch customer orders has a stock record
  if (additionalItems && Array.isArray(additionalItems)) {
    additionalItems.forEach((it) => {
      if (!map[it.sku]) {
        const init = 65
        map[it.sku] = {
          sku: it.sku,
          name: it.name,
          shortName: it.shortName,
          upc: it.upc,
          location: it.location,
          zone: it.zone,
          rack: it.rack,
          bin: it.bin,
          initialStock: init,
          pickedQuantity: it.qtyPicked,
          currentStock: Math.max(0, init - it.qtyPicked),
          safetyThreshold: 15,
          imageUrl: it.imageUrl,
          status: computeStockStatus(Math.max(0, init - it.qtyPicked), 15),
          lastUpdatedText: 'Thời gian thực',
        }
      }
    })
  }

  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(WAREHOUSE_STOCK_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, WarehouseStockItem>
        if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach((sku) => {
            if (map[sku] && parsed[sku]) {
              map[sku] = {
                ...map[sku],
                ...parsed[sku],
              }
            } else if (parsed[sku]) {
              map[sku] = parsed[sku]
            }
          })
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  return map
}

export function saveStoredWarehouseStock(
  stockMap: Record<string, WarehouseStockItem>,
): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WAREHOUSE_STOCK_STORAGE_KEY, JSON.stringify(stockMap))
      window.dispatchEvent(
        new CustomEvent('optipack:warehouse_stock_updated', { detail: stockMap }),
      )
    }
  } catch {
    // Ignore storage save errors
  }
}

export function resetWarehouseStock(
  additionalItems?: WarehousePickingItem[],
): Record<string, WarehouseStockItem> {
  const map: Record<string, WarehouseStockItem> = {}
  INITIAL_WAREHOUSE_STOCK_LIST.forEach((item) => {
    map[item.sku] = { ...item }
  })
  if (additionalItems && Array.isArray(additionalItems)) {
    additionalItems.forEach((it) => {
      if (!map[it.sku]) {
        const init = 65
        map[it.sku] = {
          sku: it.sku,
          name: it.name,
          shortName: it.shortName,
          upc: it.upc,
          location: it.location,
          zone: it.zone,
          rack: it.rack,
          bin: it.bin,
          initialStock: init,
          pickedQuantity: 0,
          currentStock: init,
          safetyThreshold: 15,
          imageUrl: it.imageUrl,
          status: computeStockStatus(init, 15),
          lastUpdatedText: 'Thời gian thực',
        }
      }
    })
  }
  saveStoredWarehouseStock(map)
  return map
}

