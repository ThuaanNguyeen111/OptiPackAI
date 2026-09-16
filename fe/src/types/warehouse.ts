export type PickStatus = 'queued' | 'picking' | 'picked' | 'short'

export type WarehouseChannel = 'shopee' | 'tiktok' | 'lazada' | 'facebook'

export type WarehousePickLine = {
  id: string
  bin: string
  zone: string
  packageId: string
  productName: string
  sku: string
  barcode: string
  orderCodes: string[]
  channels: WarehouseChannel[]
  qty: number
  qtyPicked: number
  slaMinutes: number
  fragile: boolean
  status: PickStatus
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  customerNotes?: string
  price?: number
  orderId?: string
  batchId?: string
}

export type WarehouseWave = {
  id: string
  label: string
  shift: string
  zone: string
}
