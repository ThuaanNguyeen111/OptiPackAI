import { apiRequest } from '../lib/api'
import type {
  BoxStockMovement,
  MaterialRules,
  MaterialType,
  OrderGroupSummary,
  PackagingBag,
  PackagingBox,
  PackagingMaterial,
  ProductCategory,
  ProductProfile,
} from '../types/packaging'

export async function listOrderGroups(fulfillmentStatus?: string): Promise<OrderGroupSummary[]> {
  const query = fulfillmentStatus ? `?fulfillment_status=${encodeURIComponent(fulfillmentStatus)}` : ''
  return apiRequest<OrderGroupSummary[]>(`/order-groups${query}`, { auth: true })
}

export async function getOrderGroup(groupId: string): Promise<OrderGroupSummary> {
  return apiRequest<OrderGroupSummary>(`/order-groups/${groupId}`, { auth: true })
}

export async function listPackagingBoxes(): Promise<PackagingBox[]> {
  return apiRequest<PackagingBox[]>('/packaging/boxes', { auth: true })
}

export type BoxInput = {
  code?: string
  name?: string
  inner?: { length_mm: number; width_mm: number; height_mm: number }
  outer?: { length_mm: number; width_mm: number; height_mm: number }
  tare_g?: number
  max_load_g?: number
  price_vnd?: number | null
  is_active?: boolean
  reorder_level?: number
  storage_location?: string | null
}

export async function listAllPackagingBoxes(): Promise<PackagingBox[]> {
  return apiRequest<PackagingBox[]>('/packaging/boxes?active=false', { auth: true })
}

export async function createPackagingBox(body: BoxInput): Promise<PackagingBox> {
  return apiRequest<PackagingBox>('/packaging/boxes', { method: 'POST', auth: true, body })
}

export async function updatePackagingBox(id: string, body: BoxInput): Promise<PackagingBox> {
  return apiRequest<PackagingBox>(`/packaging/boxes/${id}`, { method: 'PATCH', auth: true, body })
}

/** Nhập thêm thùng vào kho (ghi 1 dòng sổ). */
export async function stockInPackagingBox(id: string, quantity: number, note?: string): Promise<PackagingBox> {
  return apiRequest<PackagingBox>(`/packaging/boxes/${id}/stock-in`, {
    method: 'POST',
    auth: true,
    body: { quantity, note },
  })
}

export async function listBoxMovements(id: string): Promise<BoxStockMovement[]> {
  return apiRequest<BoxStockMovement[]>(`/packaging/boxes/${id}/movements`, { auth: true })
}

export async function listProductProfiles(status?: 'needs_measurement' | 'ready'): Promise<ProductProfile[]> {
  const query = status ? `?status=${status}` : ''
  return apiRequest<ProductProfile[]>(`/product-master${query}`, { auth: true })
}

export async function confirmProductProfile(
  id: string,
  body: {
    length_cm: number
    width_cm: number
    height_cm: number
    weight_kg: number
    is_fragile: boolean
    orientation_rule: 'any' | 'upright_only'
    max_stack_load_kg?: number | null
    product_category: ProductCategory
    zip_bag_code?: string | null
    zip_bag_folded?: boolean
    can_fold_in_half?: boolean
  },
): Promise<ProductProfile> {
  return apiRequest<ProductProfile>(`/product-master/${id}/packaging-profile`, { method: 'PUT', auth: true, body })
}

export type BagInput = {
  code?: string
  name?: string
  width_mm?: number
  length_mm?: number
  price_vnd?: number | null
  is_active?: boolean
}

export async function listPackagingBags(activeOnly = true): Promise<PackagingBag[]> {
  return apiRequest<PackagingBag[]>(`/packaging/bags${activeOnly ? '' : '?active=false'}`, { auth: true })
}

export async function createPackagingBag(body: BagInput): Promise<PackagingBag> {
  return apiRequest<PackagingBag>('/packaging/bags', { method: 'POST', auth: true, body })
}

export async function updatePackagingBag(id: string, body: BagInput): Promise<PackagingBag> {
  return apiRequest<PackagingBag>(`/packaging/bags/${id}`, { method: 'PATCH', auth: true, body })
}

export type MaterialInput = {
  code?: string
  name?: string
  type?: MaterialType
  unit?: string
  weight_g_per_unit?: number
  price_vnd_per_unit?: number
  is_active?: boolean
  reorder_level?: number
  storage_location?: string | null
}

export async function listPackagingMaterials(activeOnly = true): Promise<PackagingMaterial[]> {
  return apiRequest<PackagingMaterial[]>(`/packaging/materials${activeOnly ? '' : '?active=false'}`, { auth: true })
}

export async function createPackagingMaterial(body: MaterialInput): Promise<PackagingMaterial> {
  return apiRequest<PackagingMaterial>('/packaging/materials', { method: 'POST', auth: true, body })
}

export async function updatePackagingMaterial(id: string, body: MaterialInput): Promise<PackagingMaterial> {
  return apiRequest<PackagingMaterial>(`/packaging/materials/${id}`, { method: 'PATCH', auth: true, body })
}

/** Nhập thêm vật tư vào kho (ghi 1 dòng sổ). */
export async function stockInPackagingMaterial(id: string, quantity: number, note?: string): Promise<PackagingMaterial> {
  return apiRequest<PackagingMaterial>(`/packaging/materials/${id}/stock-in`, {
    method: 'POST',
    auth: true,
    body: { quantity, note },
  })
}

export async function listMaterialMovements(id: string): Promise<BoxStockMovement[]> {
  return apiRequest<BoxStockMovement[]>(`/packaging/materials/${id}/movements`, { auth: true })
}

export async function getMaterialRules(): Promise<MaterialRules> {
  return apiRequest<MaterialRules>('/packaging/materials/rules', { auth: true })
}
