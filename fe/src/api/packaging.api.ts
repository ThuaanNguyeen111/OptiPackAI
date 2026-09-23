import { apiRequest } from '../lib/api'
import type {
  AdjustmentReason,
  BoxStockMovement,
  OrderGroupSummary,
  PackagingBag,
  PackagingBox,
  PackagingPlan,
  PackagingRecommendation,
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

export async function getPackagingPlan(groupId: string): Promise<PackagingPlan> {
  return apiRequest<PackagingPlan>(`/order-groups/${groupId}/packaging`, { auth: true })
}

export async function generatePackagingPlan(groupId: string): Promise<PackagingPlan> {
  return apiRequest<PackagingPlan>(`/order-groups/${groupId}/packaging/generate`, {
    method: 'POST',
    auth: true,
  })
}

export async function approvePackagingPlan(groupId: string, expectedGroupVersion: number): Promise<PackagingPlan> {
  return apiRequest<PackagingPlan>(`/order-groups/${groupId}/packaging/approve`, {
    method: 'POST',
    auth: true,
    body: { expected_group_version: expectedGroupVersion },
  })
}

export async function adjustPackagingPlan(
  groupId: string,
  body: {
    orderId: string
    boxCode: string
    reason: AdjustmentReason
    note?: string
    expectedGroupVersion: number
  },
): Promise<PackagingPlan> {
  return apiRequest<PackagingPlan>(`/order-groups/${groupId}/packaging/adjust`, {
    method: 'POST',
    auth: true,
    body: {
      order_id: body.orderId,
      box_code: body.boxCode,
      adjustment_reason: body.reason,
      adjustment_note: body.note,
      expected_group_version: body.expectedGroupVersion,
    },
  })
}

export async function rejectPackagingPlan(groupId: string, expectedGroupVersion: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/order-groups/${groupId}/packaging/reject`, {
    method: 'POST',
    auth: true,
    body: { expected_group_version: expectedGroupVersion },
  })
}

/** Lấy (hoặc tạo lần đầu) hướng dẫn đóng gói từng bước cho 1 đơn. */
export async function requestPackingGuide(
  groupId: string,
  recommendationId: string,
  regenerate = false,
): Promise<PackagingRecommendation> {
  return apiRequest<PackagingRecommendation>(
    `/order-groups/${groupId}/packaging/${recommendationId}/guide`,
    { method: 'POST', auth: true, body: { regenerate } },
  )
}

export async function packOrderGroup(
  groupId: string,
  packages: { orderId: string; actualWeightKg: number }[],
  expectedVersion: number,
): Promise<{ fulfillmentStatus: string; version: number; recommendations: PackagingRecommendation[] }> {
  return apiRequest(`/order-groups/${groupId}/fulfillment/pack`, {
    method: 'POST',
    auth: true,
    body: {
      packages: packages.map((p) => ({ order_id: p.orderId, actual_weight_kg: p.actualWeightKg })),
      expected_version: expectedVersion,
    },
  })
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
