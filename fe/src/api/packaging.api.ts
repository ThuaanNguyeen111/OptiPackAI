import { apiRequest } from '../lib/api'
import type {
  AdjustPackagingInput,
  ApprovePackagingInput,
  PackagingRecommendation,
  RejectPackagingInput,
} from '../types/packaging'

export async function getPackagingRecommendation(
  groupId: string,
): Promise<PackagingRecommendation | null> {
  const res = await apiRequest<PackagingRecommendation | null>(
    `/order-groups/${groupId}/packaging`,
    { auth: true },
  )
  return res ?? null
}

export async function approvePackaging(
  groupId: string,
  input: ApprovePackagingInput,
): Promise<PackagingRecommendation> {
  return apiRequest<PackagingRecommendation>(
    `/order-groups/${groupId}/packaging/approve`,
    {
      method: 'POST',
      body: {
        actual_measured_weight_kg: input.actual_measured_weight_kg,
        expected_group_version: input.expected_group_version,
      },
      auth: true,
    },
  )
}

export async function adjustPackaging(
  groupId: string,
  input: AdjustPackagingInput,
): Promise<PackagingRecommendation> {
  return apiRequest<PackagingRecommendation>(
    `/order-groups/${groupId}/packaging/adjust`,
    {
      method: 'POST',
      body: input,
      auth: true,
    },
  )
}

export async function rejectPackaging(
  groupId: string,
  input: RejectPackagingInput,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(
    `/order-groups/${groupId}/packaging/reject`,
    {
      method: 'POST',
      body: {
        expected_group_version: input.expected_group_version,
        rejection_reason: input.rejection_reason,
      },
      auth: true,
    },
  )
}

/** Admin — chốt kế hoạch đóng gói (fallback/AI tạm) khi group `picked`. */
export async function generatePackaging(
  groupId: string,
): Promise<PackagingRecommendation> {
  return apiRequest<PackagingRecommendation>(
    `/order-groups/${groupId}/packaging/generate`,
    {
      method: 'POST',
      auth: true,
    },
  )
}
