import { apiRequest } from '../lib/api'
import type {
  AdjustStockInput,
  AssignSkuInput,
  BinDesignation,
  BinLocationRecord,
  CategoryRecord,
  CreateRackInput,
  CreateWarehouseInput,
  CreateZoneInput,
  GenerateBinsInput,
  InventoryMovementRecord,
  OtherBin,
  SkuBinAssignmentRecord,
  TransferStockInput,
  UnassignedSku,
  UpdateWarehouseInput,
  UpdateZoneInput,
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
    isActive: row.isActive !== false && row.is_active !== false,
  }
}

function mapDesignated(raw: unknown): BinDesignation | null {
  const row = asRecord(raw)
  if (!row) return null
  return {
    categoryCode: pickString(row.categoryCode, row.category_code) || null,
    size: pickString(row.size) || null,
    colorCode: pickString(row.colorCode, row.color_code) || null,
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
    isActive: row.isActive !== false && row.is_active !== false,
    layoutVersion: row.layoutVersion === 2 || row.layout_version === 2 ? 2 : 1,
    side: row.side === 'T' || row.side === 'P' ? row.side : null,
    cell: typeof row.cell === 'number' ? row.cell : null,
    capacity: typeof row.capacity === 'number' ? row.capacity : null,
    designated: mapDesignated(row.designated),
    pickSequence:
      typeof row.pickSequence === 'number'
        ? row.pickSequence
        : typeof row.pick_sequence === 'number'
          ? row.pick_sequence
          : null,
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
    masterSku: pickString(row.masterSku, row.master_sku) || null,
    binCode: pickString(row.binCode, row.bin_code) || undefined,
  }
}

function inactiveQuery(includeInactive?: boolean): string {
  return includeInactive ? '?include_inactive=true' : ''
}

export async function listWarehouses(options?: {
  includeInactive?: boolean
}): Promise<WarehouseRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses${inactiveQuery(options?.includeInactive)}`,
    { auth: true },
  )
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

export async function updateWarehouse(
  warehouseId: string,
  input: UpdateWarehouseInput,
): Promise<WarehouseRecord> {
  const updated = mapWarehouse(
    await apiRequest<unknown>(`/warehouse/warehouses/${warehouseId}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  )
  if (!updated) throw new Error('Sửa kho thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function deactivateWarehouse(
  warehouseId: string,
): Promise<WarehouseRecord> {
  const updated = mapWarehouse(
    await apiRequest<unknown>(`/warehouse/warehouses/${warehouseId}`, {
      method: 'DELETE',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Tắt kho thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function reactivateWarehouse(
  warehouseId: string,
): Promise<WarehouseRecord> {
  const updated = mapWarehouse(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/reactivate`,
      { method: 'POST', auth: true },
    ),
  )
  if (!updated) throw new Error('Bật kho thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function listWarehouseZones(
  warehouseId: string,
  options?: { includeInactive?: boolean },
): Promise<WarehouseZoneRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/zones${inactiveQuery(options?.includeInactive)}`,
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

export async function updateWarehouseZone(
  zoneId: string,
  input: UpdateZoneInput,
): Promise<WarehouseZoneRecord> {
  const updated = mapZone(
    await apiRequest<unknown>(`/warehouse/zones/${zoneId}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  )
  if (!updated) throw new Error('Sửa khu thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function deactivateWarehouseZone(
  zoneId: string,
): Promise<WarehouseZoneRecord> {
  const updated = mapZone(
    await apiRequest<unknown>(`/warehouse/zones/${zoneId}`, {
      method: 'DELETE',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Tắt khu thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function reactivateWarehouseZone(
  zoneId: string,
): Promise<WarehouseZoneRecord> {
  const updated = mapZone(
    await apiRequest<unknown>(`/warehouse/zones/${zoneId}/reactivate`, {
      method: 'POST',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Bật khu thành công nhưng server không trả dữ liệu.')
  return updated
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

export async function createRack(
  zoneId: string,
  input: CreateRackInput,
): Promise<BinLocationRecord[]> {
  const res = await apiRequest<unknown>(`/warehouse/zones/${zoneId}/racks`, {
    method: 'POST',
    body: input,
    auth: true,
  })
  if (!Array.isArray(res)) return []
  return res.map(mapBin).filter((row): row is BinLocationRecord => row !== null)
}

export async function deactivateBin(binId: string): Promise<BinLocationRecord> {
  const updated = mapBin(
    await apiRequest<unknown>(`/warehouse/bin-locations/${binId}`, {
      method: 'DELETE',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Tắt kệ thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function reactivateBin(binId: string): Promise<BinLocationRecord> {
  const updated = mapBin(
    await apiRequest<unknown>(`/warehouse/bin-locations/${binId}/reactivate`, {
      method: 'POST',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Bật kệ thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function listBinLocations(
  zoneId: string,
  options?: { includeInactive?: boolean },
): Promise<BinLocationRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/zones/${zoneId}/bin-locations${inactiveQuery(options?.includeInactive)}`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapBin).filter((row): row is BinLocationRecord => row !== null)
}

export async function listWarehouseBinLocations(
  warehouseId: string,
  options?: { includeInactive?: boolean },
): Promise<BinLocationRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/bin-locations${inactiveQuery(options?.includeInactive)}`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapBin).filter((row): row is BinLocationRecord => row !== null)
}

function mergeBinLocations(
  ...lists: BinLocationRecord[][]
): BinLocationRecord[] {
  const byId = new Map<string, BinLocationRecord>()
  for (const list of lists) {
    for (const row of list) {
      if (row.id) byId.set(row.id, row)
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.binCode.localeCompare(b.binCode, 'en'),
  )
}

/**
 * GET kệ theo kho + theo từng khu, rồi gộp theo id.
 * `generate` có thể không ghi `warehouse_id` nên GET theo kho trống,
 * trong khi GET theo khu (lọc `zone_id`) vẫn trả được.
 */
export async function listAllWarehouseBins(
  warehouseId: string,
  zoneIds: string[],
  options?: { includeInactive?: boolean },
): Promise<BinLocationRecord[]> {
  const results = await Promise.allSettled([
    listWarehouseBinLocations(warehouseId, options),
    ...zoneIds.map((zoneId) => listBinLocations(zoneId, options)),
  ])
  const lists: BinLocationRecord[][] = []
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') lists.push(result.value)
    else errors.push(result.reason)
  }
  const merged = mergeBinLocations(...lists)
  if (merged.length === 0 && errors.length > 0) {
    throw errors[0]
  }
  return merged
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
  force = false,
): Promise<SkuBinAssignmentRecord> {
  const updated = mapAssignment(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}/restock`,
      { method: 'POST', body: { quantity, force }, auth: true },
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

export async function adjustStockAssignment(
  warehouseId: string,
  assignmentId: string,
  input: AdjustStockInput,
): Promise<SkuBinAssignmentRecord> {
  const updated = mapAssignment(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}/adjust`,
      { method: 'POST', body: input, auth: true },
    ),
  )
  if (!updated) throw new Error('Kiểm kê thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function transferStockAssignment(
  warehouseId: string,
  assignmentId: string,
  input: TransferStockInput,
): Promise<{ from: SkuBinAssignmentRecord; to: SkuBinAssignmentRecord }> {
  const res = asRecord(
    await apiRequest<unknown>(
      `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}/transfer`,
      { method: 'POST', body: input, auth: true },
    ),
  )
  const from = mapAssignment(res?.from)
  const to = mapAssignment(res?.to)
  if (!from || !to) throw new Error('Chuyển ô thành công nhưng server không trả đủ dữ liệu.')
  return { from, to }
}

export async function unassignSkuFromBin(
  warehouseId: string,
  assignmentId: string,
): Promise<void> {
  await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}`,
    { method: 'DELETE', auth: true },
  )
}

function mapMovement(raw: unknown): InventoryMovementRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    type: pickString(row.type),
    masterSku: pickString(row.masterSku, row.master_sku) || null,
    delta: pickNumber(row.delta),
    quantityBefore: pickNumber(row.quantityBefore, row.quantity_before),
    quantityAfter: pickNumber(row.quantityAfter, row.quantity_after),
    reasonCode: pickString(row.reasonCode, row.reason_code) || null,
    note: pickString(row.note) || null,
    refType: pickString(row.refType, row.ref_type) || null,
    refId: pickString(row.refId, row.ref_id) || null,
    actorId: pickString(row.actorId, row.actor_id) || null,
    createdAt: pickString(row.createdAt, row.created_at),
  }
}

export async function listStockMovements(
  warehouseId: string,
  assignmentId: string,
): Promise<InventoryMovementRecord[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}/movements`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res
    .map(mapMovement)
    .filter((row): row is InventoryMovementRecord => row !== null)
}

function mapCategory(raw: unknown): CategoryRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const code = pickString(row.code)
  if (!code) return null
  const childrenRaw = row.children
  return {
    code,
    name: pickString(row.name),
    parentCode: pickString(row.parentCode, row.parent_code) || null,
    level: pickNumber(row.level),
    sizeScale: Array.isArray(row.sizeScale)
      ? row.sizeScale.filter((item): item is string => typeof item === 'string')
      : Array.isArray(row.size_scale)
        ? row.size_scale.filter((item): item is string => typeof item === 'string')
        : [],
    isActive: row.isActive !== false && row.is_active !== false,
    children: Array.isArray(childrenRaw)
      ? childrenRaw
          .map(mapCategory)
          .filter((item): item is CategoryRecord => item !== null)
      : undefined,
  }
}

export async function listCategories(includeInactive = false): Promise<CategoryRecord[]> {
  const query = includeInactive ? '?include_inactive=true' : ''
  const res = await apiRequest<unknown>(`/categories${query}`, { auth: true })
  if (!Array.isArray(res)) return []
  return res.map(mapCategory).filter((row): row is CategoryRecord => row !== null)
}

export type CreateCategoryInput = {
  code: string
  name: string
  parent_code?: string
  size_scale?: string[]
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryRecord> {
  const created = mapCategory(
    await apiRequest<unknown>('/categories', { method: 'POST', body: input, auth: true }),
  )
  if (!created) throw new Error('Tạo danh mục thành công nhưng server không trả dữ liệu.')
  return created
}

export async function updateCategory(
  code: string,
  input: { name?: string; size_scale?: string[] },
): Promise<CategoryRecord> {
  const updated = mapCategory(
    await apiRequest<unknown>(`/categories/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  )
  if (!updated) throw new Error('Sửa danh mục thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function deactivateCategory(code: string): Promise<CategoryRecord> {
  const updated = mapCategory(
    await apiRequest<unknown>(`/categories/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Tắt danh mục thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function reactivateCategory(code: string): Promise<CategoryRecord> {
  const updated = mapCategory(
    await apiRequest<unknown>(`/categories/${encodeURIComponent(code)}/reactivate`, {
      method: 'POST',
      auth: true,
    }),
  )
  if (!updated) throw new Error('Bật danh mục thành công nhưng server không trả dữ liệu.')
  return updated
}

function mapOtherBins(raw: unknown): OtherBin[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const binLocationId = pickString(row.bin_location_id, row.binLocationId)
    if (!binLocationId) return []
    return [
      {
        bin_location_id: binLocationId,
        bin_code: pickString(row.bin_code, row.binCode),
        quantity_on_hand: pickNumber(row.quantity_on_hand, row.quantityOnHand),
      },
    ]
  })
}

function mapPickingListItem(raw: unknown): WarehousePickingListItem | null {
  const row = asRecord(raw)
  const sku = pickString(row?.sku)
  if (!row || !sku) return null
  return {
    sku,
    quantity: pickNumber(row.quantity),
    length_cm: pickNumber(row.length_cm),
    width_cm: pickNumber(row.width_cm),
    height_cm: pickNumber(row.height_cm),
    weight_kg: pickNumber(row.weight_kg),
    is_fragile: row.is_fragile === true,
    zone_code: pickString(row.zone_code),
    bin_code: pickString(row.bin_code),
    pick_sequence: typeof row.pick_sequence === 'number' ? row.pick_sequence : null,
    master_sku: pickString(row.master_sku) || null,
    bin_location_id: pickString(row.bin_location_id) || null,
    other_bins: mapOtherBins(row.other_bins),
  }
}

export async function getWarehousePickingList(
  warehouseId: string,
  groupId: string,
): Promise<WarehousePickingListItem[]> {
  const res = await apiRequest<unknown>(
    `/warehouse/${encodeURIComponent(warehouseId)}/picking-list/${encodeURIComponent(groupId)}`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res
    .map(mapPickingListItem)
    .filter((row): row is WarehousePickingListItem => row !== null)
}

const WAREHOUSE_ID_STORAGE_KEY = 'optipack.warehouseId'

export function readStoredWarehouseId(): string {
  try {
    return localStorage.getItem(WAREHOUSE_ID_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeStoredWarehouseId(id: string): void {
  try {
    if (id) localStorage.setItem(WAREHOUSE_ID_STORAGE_KEY, id)
    else localStorage.removeItem(WAREHOUSE_ID_STORAGE_KEY)
  } catch {
    // ignore quota / private mode
  }
}
