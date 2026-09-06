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
  location: string // e.g. ZONE A - RACK 03 - BIN 12
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
    location: 'ZONE A - RACK 03 - BIN 12',
    zone: 'ZONE A',
    rack: 'RACK 03',
    bin: 'BIN 12',
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
    location: 'ZONE A - RACK 02 - BIN 08',
    zone: 'ZONE A',
    rack: 'RACK 02',
    bin: 'BIN 08',
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
    location: 'ZONE B - RACK 01 - BIN 04',
    zone: 'ZONE B',
    rack: 'RACK 01',
    bin: 'BIN 04',
    qty: 4,
    qtyPicked: 4,
    status: 'picked',
    imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-88219',
    customerName: 'Lê Hoàng Yến',
  },
  {
    id: 'item-04',
    name: 'Khăn Lụa Họa Tiết Paisley Phong Cách Cổ Điển',
    shortName: 'Khăn Lụa Họa Tiết Paisley',
    sku: 'KL-5520-PS',
    upc: '893210475826',
    location: 'ZONE B - RACK 04 - BIN 02',
    zone: 'ZONE B',
    rack: 'RACK 04',
    bin: 'BIN 02',
    qty: 1,
    qtyPicked: 1,
    status: 'picked',
    imageUrl: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=500&auto=format&fit=crop&q=80',
    channel: 'lazada',
    orderId: 'LZ-55102',
    customerName: 'Nguyễn Bích Ngọc',
  },
  {
    id: 'item-05',
    name: 'Mũ Bucket Hat Vải Canvas (Bộ 3 Màu)',
    shortName: 'Mũ Bucket Hat Vải Canvas (Bộ 3)',
    sku: 'MB-7731-CV',
    upc: '893210475827',
    location: 'ZONE A - RACK 05 - BIN 11',
    zone: 'ZONE A',
    rack: 'RACK 05',
    bin: 'BIN 11',
    qty: 3,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-33419',
    customerName: 'Đặng Quốc Huy',
  },
  {
    id: 'item-06',
    name: 'Thắt Lưng Da Bò Khóa Kim Loại Tự Động',
    shortName: 'Thắt Lưng Da Bò Khóa Kim Loại',
    sku: 'TL-6640-LT',
    upc: '893210475828',
    location: 'ZONE C - RACK 02 - BIN 06',
    zone: 'ZONE C',
    rack: 'RACK 02',
    bin: 'BIN 06',
    qty: 1,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-99201',
    customerName: 'Vũ Đức Thắng',
  },
  {
    id: 'item-07',
    name: 'Kính Mát Polarized Tròng Vuông Chống UV400',
    shortName: 'Kính Mát Polarized Tròng Vuông',
    sku: 'KM-2290-PL',
    upc: '893210475829',
    location: 'ZONE C - RACK 01 - BIN 09',
    zone: 'ZONE C',
    rack: 'RACK 01',
    bin: 'BIN 09',
    qty: 2,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&auto=format&fit=crop&q=80',
    channel: 'facebook',
    orderId: 'FB-99014',
    customerName: 'Phạm Thu Hương',
  },
  {
    id: 'item-08',
    name: 'Vớ Thể Thao Cao Cổ Dệt Kim Kháng Khuẩn (Set 5 Đôi)',
    shortName: 'Vớ Thể Thao Cao Cổ (5 Đôi)',
    sku: 'VT-4410-SP',
    upc: '893210475830',
    location: 'ZONE B - RACK 03 - BIN 15',
    zone: 'ZONE B',
    rack: 'RACK 03',
    bin: 'BIN 15',
    qty: 5,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-77123',
    customerName: 'Mai Phương Trang',
  },
  {
    id: 'item-09',
    name: 'Balo Laptop Đa Năng 15.6 inch Chống Nước Oxford',
    shortName: 'Balo Laptop Đa Năng 15.6 inch',
    sku: 'BL-8812-BK',
    upc: '893210475831',
    location: 'ZONE A - RACK 01 - BIN 03',
    zone: 'ZONE A',
    rack: 'RACK 01',
    bin: 'BIN 03',
    qty: 2,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-33012',
    customerName: 'Lý Kiến Thành',
  },
  {
    id: 'item-10',
    name: 'Áo Polo Nam Thể Thao Co Giãn Thoáng Khí',
    shortName: 'Áo Polo Thể Thao Co Giãn',
    sku: 'AP-1120-WT',
    upc: '893210475832',
    location: 'ZONE A - RACK 04 - BIN 07',
    zone: 'ZONE A',
    rack: 'RACK 04',
    bin: 'BIN 07',
    qty: 4,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80',
    channel: 'lazada',
    orderId: 'LZ-11849',
    customerName: 'Hoàng Kim Liên',
  },
  {
    id: 'item-11',
    name: 'Quần Đùi Thể Thao 2 Lớp Chạy Bộ Có Túi Khóa',
    shortName: 'Quần Đùi Chạy Bộ 2 Lớp',
    sku: 'QD-9931-DG',
    upc: '893210475833',
    location: 'ZONE B - RACK 02 - BIN 10',
    zone: 'ZONE B',
    rack: 'RACK 02',
    bin: 'BIN 10',
    qty: 3,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&auto=format&fit=crop&q=80',
    channel: 'facebook',
    orderId: 'FB-44120',
    customerName: 'Trịnh Mai Khanh',
  },
  {
    id: 'item-12',
    name: 'Ví Nam Da Bò Thật Nhiều Ngăn Đựng Thẻ Khóa Zip',
    shortName: 'Ví Nam Da Bò Khóa Zip',
    sku: 'VN-3321-BR',
    upc: '893210475834',
    location: 'ZONE C - RACK 03 - BIN 05',
    zone: 'ZONE C',
    rack: 'RACK 03',
    bin: 'BIN 05',
    qty: 1,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=500&auto=format&fit=crop&q=80',
    channel: 'lazada',
    orderId: 'LZ-77821',
    customerName: 'Nguyễn Tấn Đạt',
  },
  {
    id: 'item-13',
    name: 'Đồng Hồ Thể Thao Điện Tử Dây Silicone Chống Nước',
    shortName: 'Đồng Hồ Thể Thao Chống Nước',
    sku: 'DH-7740-SL',
    upc: '893210475835',
    location: 'ZONE C - RACK 04 - BIN 14',
    zone: 'ZONE C',
    rack: 'RACK 04',
    bin: 'BIN 14',
    qty: 2,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    channel: 'shopee',
    orderId: 'SP-33015',
    customerName: 'Lý Kiến Thành',
  },
  {
    id: 'item-14',
    name: 'Găng Tay Đi Xe Máy Chống Nắng Tia UV Co Giãn',
    shortName: 'Găng Tay Đi Xe Chống Nắng',
    sku: 'GT-5501-GY',
    upc: '893210475836',
    location: 'ZONE B - RACK 05 - BIN 01',
    zone: 'ZONE B',
    rack: 'RACK 05',
    bin: 'BIN 01',
    qty: 3,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=500&auto=format&fit=crop&q=80',
    channel: 'tiktok',
    orderId: 'TT-77123',
    customerName: 'Mai Phương Trang',
  },
  {
    id: 'item-15',
    name: 'Giày Sneaker Thể Thao Nam Nữ Đệm Khí Êm Ái',
    shortName: 'Giày Sneaker Thoáng Khí',
    sku: 'SN-2219-BL',
    upc: '893210475837',
    location: 'ZONE A - RACK 06 - BIN 16',
    zone: 'ZONE A',
    rack: 'RACK 06',
    bin: 'BIN 16',
    qty: 1,
    qtyPicked: 0,
    status: 'queued',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80',
    channel: 'lazada',
    orderId: 'LZ-99120',
    customerName: 'Bùi Thế Hiển',
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
      let zone: string = batch.zone
      let rack: string = 'RACK 01'
      let bin: string = 'BIN 01'
      let location: string = `${batch.zone} - RACK 01 - BIN 01`

      if (item.bin && item.bin.includes('-')) {
        const parts = item.bin.split('-')
        const z = parts[0]?.trim() || 'A'
        const r = parts[1]?.trim() || '01'
        const b = parts[2]?.trim() || '01'
        zone = `ZONE ${z.toUpperCase()}`
        rack = `RACK ${r.padStart(2, '0')}`
        bin = `BIN ${b.padStart(2, '0')}`
        location = `${zone} - ${rack} - ${bin}`
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
    // If none is 'picking', make the first item 'picking' so it appears as active target
    if (!result.some((it) => it.status === 'picking')) {
      const firstQueued = result.find((it) => it.status === 'queued')
      if (firstQueued) {
        firstQueued.status = 'picking'
      } else if (result[0]) {
        result[0].status = 'picking'
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
