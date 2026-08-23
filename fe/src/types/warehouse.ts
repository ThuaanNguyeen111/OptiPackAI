export type PickStatus = 'queued' | 'picking' | 'picked' | 'short'

export type WarehouseChannel = 'shopee' | 'tiktok'

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
}

export type WarehouseWave = {
  id: string
  label: string
  shift: string
  zone: string
}
