import { apiRequest } from '../lib/api'
import type {
  AssignSkuInput,
  BinLocationRecord,
  CreateWarehouseInput,
  CreateZoneInput,
  GenerateBinsInput,
  SkuBinAssignmentRecord,
  UnassignedSku,
  WarehousePickingListItem,
  WarehouseRecord,
  WarehouseZoneRecord,
} from '../types/warehouse-admin'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
    if (value != null && typeof value === 'object' && 'toString' in value) {
      const text = String(value)
      if (text && text !== '[object Object]') return text
    }
  }
  return ''
}

function parseMarketplacePlatform(value: string): 'tiktok' | 'lazada' | 'tiki' {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'tiktok' || normalized === 'lazada' || normalized === 'tiki') {
    return normalized
  }
  return 'lazada'
}

function mapUnassignedSku(raw: unknown): UnassignedSku | null {
  const row = asRecord(raw)
  if (!row) return null
  const shop_id = pickString(row.shop_id, row.shopId)
  const seller_sku = pickString(row.seller_sku, row.sellerSku)
  if (!shop_id || !seller_sku) return null
  return {
    platform: parseMarketplacePlatform(pickString(row.platform)),
    shop_id,
    seller_sku,
  }
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function mapWarehouse(raw: unknown): WarehouseRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    warehouseCode: pickString(row.warehouseCode, row.warehouse_code),
    warehouseName: pickString(row.warehouseName, row.warehouse_name),
    address: pickString(row.address),
    isActive: row.isActive !== false && row.is_active !== false,
  }
}

function mapZone(raw: unknown): WarehouseZoneRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    warehouseId: pickString(row.warehouseId, row.warehouse_id),
    zoneCode: pickString(row.zoneCode, row.zone_code),
    zoneName: pickString(row.zoneName, row.zone_name),
    description: pickString(row.description),
  }
}

function mapBin(raw: unknown): BinLocationRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    warehouseId: pickString(row.warehouseId, row.warehouse_id),
    zoneId: pickString(row.zoneId, row.zone_id),
    binCode: pickString(row.binCode, row.bin_code),
    aisle: pickString(row.aisle),
    rack: pickNumber(row.rack),
    level: pickNumber(row.level),
  }
}

function mapAssignment(raw: unknown): SkuBinAssignmentRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    warehouseId: pickString(row.warehouseId, row.warehouse_id),
    platform: pickString(row.platform),
    shopId: pickString(row.shopId, row.shop_id),
    sellerSku: pickString(row.sellerSku, row.seller_sku),
    binLocationId: pickString(row.binLocationId, row.bin_location_id),
    quantityOnHand: pickNumber(row.quantityOnHand, row.quantity_on_hand),
    binCode: pickString(row.binCode, row.bin_code) || undefined,
  }
}

export async function listWarehouses(): Promise<WarehouseRecord[]> {
  const res = await apiRequest<unknown>('/warehouse/warehouses', {
    auth: true,
  })
  if (!Array.isArray(res)) return []
  return res.map(mapWarehouse).filter((row): row is WarehouseRecord => row !== null)
}

export async function createWarehouse(
  input: CreateWarehouseInput,
): Promise<WarehouseRecord> {
  const created = mapWarehouse(
    await apiRequest<unknown>('/warehouse/warehouses', {
      method: 'POST',
      body: input,
      auth: true,
    }),
  )
  if (!created) {
    throw new Error('Tạo kho thành công nhưng server không trả id.')
  }
  return created
}

export async function listWarehouseZones(
  warehouseId: string,
): Promise<WarehouseZoneRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/zones`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapZone).filter((row): row is WarehouseZoneRecord => row !== null)
}

export async function createWarehouseZone(
  warehouseId: string,
  input: CreateZoneInput,
): Promise<WarehouseZoneRecord> {
  const created = mapZone(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/zones`,
      { method: 'POST', body: input, auth: true },
    ),
  )
  if (!created) {
    throw new Error('Tạo khu thành công nhưng server không trả id.')
  }
  return created
}

export async function generateBinLocations(
  zoneId: string,
  input: GenerateBinsInput,
): Promise<{ created: number }> {
  return apiRequest<{ created: number }>(
    `/warehouse/zones/${zoneId}/bin-locations/generate`,
    { method: 'POST', body: input, auth: true },
  )
}

export async function listBinLocations(
  zoneId: string,
): Promise<BinLocationRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/zones/${zoneId}/bin-locations`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapBin).filter((row): row is BinLocationRecord => row !== null)
}

export async function listWarehouseBinLocations(
  warehouseId: string,
): Promise<BinLocationRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/bin-locations`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapBin).filter((row): row is BinLocationRecord => row !== null)
}

export async function assignSkuToBin(
  warehouseId: string,
  input: AssignSkuInput,
): Promise<SkuBinAssignmentRecord> {
  const created = mapAssignment(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/sku-bin-assignments`,
      {
        method: 'POST',
        body: {
          ...input,
          platform: parseMarketplacePlatform(input.platform),
        },
        auth: true,
      },
    ),
  )
  if (!created) {
    throw new Error('Gán SKU thành công nhưng server không trả id.')
  }
  return created
}

export async function listSkuBinAssignments(
  warehouseId: string,
): Promise<SkuBinAssignmentRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/sku-bin-assignments`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res
    .map(mapAssignment)
    .filter((row): row is SkuBinAssignmentRecord => row !== null)
}

export async function restockSkuAssignment(
  warehouseId: string,
  assignmentId: string,
  quantity: number,
): Promise<SkuBinAssignmentRecord> {
  const updated = mapAssignment(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}/restock`,
      { method: 'POST', body: { quantity }, auth: true },
    ),
  )
  if (!updated) {
    throw new Error('Nhập hàng thành công nhưng server không trả dữ liệu.')
  }
  return updated
}

export async function listUnassignedSkus(): Promise<UnassignedSku[]> {
  const res = await apiRequest<unknown>(
    '/warehouse/sku-bin-assignments/unassigned',
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapUnassignedSku).filter((row): row is UnassignedSku => row !== null)
}

export async function getWarehousePickingList(
  warehouseId: string,
  groupId: string,
): Promise<WarehousePickingListItem[]> {
  const res = await apiRequest<WarehousePickingListItem[]>(
    `/warehouse/${warehouseId}/picking-list/${groupId}`,
    { auth: true },
  )
  return Array.isArray(res) ? res : []
}
