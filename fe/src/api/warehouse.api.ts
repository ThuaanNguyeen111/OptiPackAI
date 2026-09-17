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

export async function listWarehouses(): Promise<WarehouseRecord[]> {
  const res = await apiRequest<WarehouseRecord[]>('/warehouse/warehouses', {
    auth: true,
  })
  return Array.isArray(res) ? res : []
}

export async function createWarehouse(
  input: CreateWarehouseInput,
): Promise<WarehouseRecord> {
  return apiRequest<WarehouseRecord>('/warehouse/warehouses', {
    method: 'POST',
    body: input,
    auth: true,
  })
}

export async function listWarehouseZones(
  warehouseId: string,
): Promise<WarehouseZoneRecord[]> {
  const res = await apiRequest<WarehouseZoneRecord[]>(
    `/warehouse/warehouses/${warehouseId}/zones`,
    { auth: true },
  )
  return Array.isArray(res) ? res : []
}

export async function createWarehouseZone(
  warehouseId: string,
  input: CreateZoneInput,
): Promise<WarehouseZoneRecord> {
  return apiRequest<WarehouseZoneRecord>(
    `/warehouse/warehouses/${warehouseId}/zones`,
    { method: 'POST', body: input, auth: true },
  )
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
  const res = await apiRequest<BinLocationRecord[]>(
    `/warehouse/zones/${zoneId}/bin-locations`,
    { auth: true },
  )
  return Array.isArray(res) ? res : []
}

export async function assignSkuToBin(
  warehouseId: string,
  input: AssignSkuInput,
): Promise<SkuBinAssignmentRecord> {
  return apiRequest<SkuBinAssignmentRecord>(
    `/warehouse/warehouses/${warehouseId}/sku-bin-assignments`,
    { method: 'POST', body: input, auth: true },
  )
}

export async function listSkuBinAssignments(
  warehouseId: string,
): Promise<SkuBinAssignmentRecord[]> {
  const res = await apiRequest<SkuBinAssignmentRecord[]>(
    `/warehouse/warehouses/${warehouseId}/sku-bin-assignments`,
    { auth: true },
  )
  return Array.isArray(res) ? res : []
}

export async function restockSkuAssignment(
  warehouseId: string,
  assignmentId: string,
  quantity: number,
): Promise<SkuBinAssignmentRecord> {
  return apiRequest<SkuBinAssignmentRecord>(
    `/warehouse/warehouses/${warehouseId}/sku-bin-assignments/${assignmentId}/restock`,
    { method: 'POST', body: { quantity }, auth: true },
  )
}

export async function listUnassignedSkus(): Promise<UnassignedSku[]> {
  const res = await apiRequest<UnassignedSku[]>(
    '/warehouse/sku-bin-assignments/unassigned',
    { auth: true },
  )
  return Array.isArray(res) ? res : []
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
