import { apiRequest } from '../lib/api'
import type {
  AdjustmentReason,
  OrderGroupSummary,
  PackagingBox,
  PackagingPlan,
  PackagingRecommendation,
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
