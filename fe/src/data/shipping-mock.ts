export interface CarrierTab {
  id: string
  name: string
  count: number
}

export interface CarrierAccount {
  id: string
  name: string
  hub: string
}

export type PackageShippingStatus = 'scanned' | 'pending'

export interface ShippingPackageItem {
  id: string
  trackingCode: string
  orderCode: string
  weightKg: number
  destination: string
  status: PackageShippingStatus
}

export interface HandoverBatchInfo {
  batchCode: string
  carrierName: string
  scannedCount: number
  totalCount: number
  remainingNoteVi: string
  remainingNoteEn: string
  totalWeightKg: number
  estimatedVolumeCbm: number
  driverName: string
  driverPhone: string
  driverPlate: string
  driverVerified: boolean
}

export const CARRIER_TABS: CarrierTab[] = [
  { id: 'all', name: 'Tất cả hãng vận chuyển', count: 142 },
  { id: 'spx', name: 'SPX Express', count: 42 },
  { id: 'ninjavan', name: 'NinjaVan', count: 35 },
  { id: 'ghn', name: 'GHN', count: 28 },
  { id: 'jtexpress', name: 'J&T Express', count: 22 },
  { id: 'grabexpress', name: 'GrabExpress', count: 15 },
]

export const CARRIER_ACCOUNTS: CarrierAccount[] = [
  {
    id: 'spx-sea',
    name: 'SPX Express',
    hub: 'Trung tâm hàng hóa Đông Nam Á',
  },
  {
    id: 'spx-hn',
    name: 'SPX Express',
    hub: 'Kho phân loại Hà Nội SOC',
  },
  {
    id: 'spx-sg',
    name: 'SPX Express',
    hub: 'Kho phân loại Tân Bình SOC',
  },
]

export const INITIAL_SCANNED_PACKAGES: ShippingPackageItem[] = [
  {
    id: 'pkg-01',
    trackingCode: 'SPX982310492',
    orderCode: 'ORD-2026-9021',
    weightKg: 0.45,
    destination: 'Ho Chi Minh City, VN',
    status: 'scanned',
  },
  {
    id: 'pkg-02',
    trackingCode: 'SPX982310488',
    orderCode: 'ORD-2026-8994',
    weightKg: 0.30,
    destination: 'Bangkok, TH',
    status: 'scanned',
  },
  {
    id: 'pkg-03',
    trackingCode: 'SPX982310471',
    orderCode: 'ORD-2026-8910',
    weightKg: 1.20,
    destination: 'Manila, PH',
    status: 'scanned',
  },
  {
    id: 'pkg-04',
    trackingCode: 'SPX982310466',
    orderCode: 'ORD-2026-8840',
    weightKg: 0.15,
    destination: 'Jakarta, ID',
    status: 'scanned',
  },
  {
    id: 'pkg-05',
    trackingCode: 'SPX982310452',
    orderCode: 'ORD-2026-8812',
    weightKg: 2.50,
    destination: 'Kuala Lumpur, MY',
    status: 'scanned',
  },
  {
    id: 'pkg-06',
    trackingCode: 'SPX982310449',
    orderCode: 'ORD-2026-8791',
    weightKg: 0.80,
    destination: 'Singapore, SG',
    status: 'scanned',
  },
  {
    id: 'pkg-07',
    trackingCode: 'SPX982310433',
    orderCode: 'ORD-2026-8742',
    weightKg: 0.25,
    destination: 'Ho Chi Minh City, VN',
    status: 'pending',
  },
  {
    id: 'pkg-08',
    trackingCode: 'SPX982310421',
    orderCode: 'ORD-2026-8703',
    weightKg: 0.60,
    destination: 'Bangkok, TH',
    status: 'pending',
  },
  {
    id: 'pkg-09',
    trackingCode: 'SPX982310410',
    orderCode: 'ORD-2026-8699',
    weightKg: 0.35,
    destination: 'Hanoi, VN',
    status: 'scanned',
  },
]

export const DEFAULT_HANDOVER_BATCH: HandoverBatchInfo = {
  batchCode: 'SPX Handover Batch #0942',
  carrierName: 'SPX Express',
  scannedCount: 42,
  totalCount: 50,
  remainingNoteVi: '* 8 kiện hàng còn lại trên dây chuyền phân loại 04',
  remainingNoteEn: '* 8 remaining packages on sorting line 04',
  totalWeightKg: 28.5,
  estimatedVolumeCbm: 1.85,
  driverName: 'Minh Tran Nguyen',
  driverPhone: '+84 908-112-901',
  driverPlate: '59C-992.81',
  driverVerified: true,
}
