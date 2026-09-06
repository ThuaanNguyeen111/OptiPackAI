import type { PickingBatch } from './picking-batches-mock'
import type {
  PickStatus,
  WarehouseChannel,
  WarehousePickLine,
  WarehouseWave,
} from '../types/warehouse'

/** Mock picking floor — fulfillment API chưa có. */
export const warehousePickerName = 'Lê Quang Huy · NV Kho'

export const warehouseWave: WarehouseWave = {
  id: 'WAVE-2408-A',
  label: 'Wave 2408-A',
  shift: 'Ca sáng 06:00–14:00',
  zone: 'Khu A–B · Kệ 01–18',
}

export const warehousePickLines: WarehousePickLine[] = [
  {
    id: 'pl-01',
    bin: 'A-04-12',
    zone: 'A',
    packageId: 'PKG-8801',
    productName: 'Áo thun Polo Nam Cotton Pique',
    sku: 'AT-POLO-01',
    barcode: '8938501230001',
    orderCodes: ['SP-10482', 'TT-2291'],
    channels: ['shopee', 'tiktok'],
    qty: 2,
    qtyPicked: 0,
    slaMinutes: 25,
    fragile: false,
    status: 'queued',
  },
  {
    id: 'pl-02',
    bin: 'A-07-03',
    zone: 'A',
    packageId: 'PKG-8802',
    productName: 'Kính râm phân cực gọng kim loại',
    sku: 'KM-POLAR-02',
    barcode: '8938501230002',
    orderCodes: ['ORD-2042'],
    channels: ['shopee'],
    qty: 1,
    qtyPicked: 0,
    slaMinutes: 18,
    fragile: true,
    status: 'picking',
  },
  {
    id: 'pl-03',
    bin: 'B-02-09',
    zone: 'B',
    packageId: 'PKG-8803',
    productName: 'Đồng hồ nam dây da Classic',
    sku: 'DH-CLASS-03',
    barcode: '8938501230003',
    orderCodes: ['SP-10510'],
    channels: ['shopee'],
    qty: 1,
    qtyPicked: 0,
    slaMinutes: 12,
    fragile: true,
    status: 'queued',
  },
  {
    id: 'pl-04',
    bin: 'B-11-01',
    zone: 'B',
    packageId: 'PKG-8804',
    productName: 'Áo thun oversize unisex basic',
    sku: 'AT-OVS-04',
    barcode: '8938501230004',
    orderCodes: ['TT-2318', 'TT-2319'],
    channels: ['tiktok'],
    qty: 3,
    qtyPicked: 3,
    slaMinutes: 40,
    fragile: false,
    status: 'picked',
  },
  {
    id: 'pl-05',
    bin: 'A-15-06',
    zone: 'A',
    packageId: 'PKG-8805',
    productName: 'Ví cầm tay da nữ Mini thời trang',
    sku: 'VD-MINI-05',
    barcode: '8938501230005',
    orderCodes: ['SP-10544'],
    channels: ['shopee'],
    qty: 2,
    qtyPicked: 1,
    slaMinutes: 8,
    fragile: false,
    status: 'picking',
  },
  {
    id: 'pl-06',
    bin: 'C-01-02',
    zone: 'C',
    packageId: 'PKG-8806',
    productName: 'Quần jeans ống suông lưng cao',
    sku: 'QJ-JEAN-06',
    barcode: '8938501230006',
    orderCodes: ['TT-2401'],
    channels: ['tiktok'],
    qty: 4,
    qtyPicked: 0,
    slaMinutes: 30,
    fragile: false,
    status: 'short',
  },
  {
    id: 'pl-07',
    bin: 'B-08-14',
    zone: 'B',
    packageId: 'PKG-8807',
    productName: 'Thắt lưng da bò khóa kim loại',
    sku: 'TL-BELT-07',
    barcode: '8938501230007',
    orderCodes: ['SP-10561'],
    channels: ['shopee'],
    qty: 2,
    qtyPicked: 0,
    slaMinutes: 22,
    fragile: false,
    status: 'queued',
  },
]

/**
 * Sinh danh sách các mặt hàng người đặt yêu cầu theo đợt lấy hàng (PickingBatch).
 */
export function getPickLinesForBatch(batch: PickingBatch): WarehousePickLine[] {
  return batch.orders.flatMap((order, orderIdx) =>
    order.items.map((item, itemIdx) => {
      const rawDigits = `${item.sku}${order.orderId}${itemIdx}`.replace(/[^0-9]/g, '')
      const suffix = rawDigits.length >= 6 ? rawDigits.slice(0, 6) : rawDigits.padEnd(6, '1')
      const barcode = `893850${suffix}`

      const fragile = /kính|đồng hồ|dây chuyền|trang sức|ngọc trai|bạc|pha lê/i.test(item.name)

      let status: PickStatus = 'queued'
      if (item.picked) {
        status = 'picked'
      } else if (batch.status === 'Picking') {
        status = itemIdx === 0 ? 'picking' : 'queued'
      }

      const zoneCode = item.bin.split('-')[0] ?? batch.zone.replace('Zone ', '')

      return {
        id: `${batch.id}-${order.orderId}-${item.sku}-${orderIdx}-${itemIdx}`,
        bin: item.bin,
        zone: zoneCode,
        packageId: order.orderId,
        productName: item.name,
        sku: item.sku,
        barcode,
        orderCodes: [order.orderId],
        channels: [order.channel as WarehouseChannel],
        qty: item.qty,
        qtyPicked: item.picked ? item.qty : 0,
        slaMinutes: batch.priority === 'Urgent' ? 10 : batch.priority === 'High' ? 15 : 25,
        fragile,
        status,
        customerName: order.customerName,
        customerPhone: order.phone,
        customerAddress: order.address,
        customerNotes: order.notes,
        price: item.price,
        orderId: order.orderId,
        batchId: batch.id,
      }
    }),
  )
}
