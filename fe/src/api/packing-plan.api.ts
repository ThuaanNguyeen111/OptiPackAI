import { apiRequest } from '../lib/api'
import type { AdjustmentReason } from '../types/packaging'
import type { PackingPlan, PackingPlanSummary } from '../types/packing-plan'

/** Kế hoạch đóng gói của nhóm (04/10/2026). Mọi thao tác đổi dữ liệu gửi `version` đang xem. */
const base = (groupId: string): string => `/order-groups/${groupId}/packing-plan`

type PlanEnvelope = { plan: PackingPlan }

export async function getPackingPlan(groupId: string): Promise<PackingPlan | null> {
  const res = await apiRequest<{ plan: PackingPlan | null }>(base(groupId), { auth: true })
  return res.plan
}

export async function listPlanSummaries(groupIds: string[]): Promise<PackingPlanSummary[]> {
  if (groupIds.length === 0) return []
  const res = await apiRequest<{ summaries: PackingPlanSummary[] }>(
    `/packing-plans/summary?group_ids=${encodeURIComponent(groupIds.join(','))}`,
    { auth: true },
  )
  return res.summaries
}

export async function recomputePlan(
  groupId: string,
  body: { expectedVersion?: number; excludeBoxCodes?: string[]; prefer?: 'fewest_parcels' | 'cheapest' },
): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/recompute`, {
    method: 'POST',
    auth: true,
    body: {
      expected_version: body.expectedVersion,
      exclude_box_codes: body.excludeBoxCodes,
      prefer: body.prefer,
    },
  })
  return res.plan
}

export async function approvePlan(groupId: string, expectedVersion: number): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/approve`, {
    method: 'POST',
    auth: true,
    body: { expected_version: expectedVersion },
  })
  return res.plan
}

export async function rejectPlan(groupId: string, expectedVersion: number, reason: string): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/reject`, {
    method: 'POST',
    auth: true,
    body: { expected_version: expectedVersion, reason },
  })
  return res.plan
}

export async function changeParcelBox(
  groupId: string,
  parcelNo: number,
  body: { boxCode: string; reason: AdjustmentReason; note?: string; expectedVersion: number },
): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/parcels/${String(parcelNo)}/change-box`, {
    method: 'POST',
    auth: true,
    body: { box_code: body.boxCode, reason: body.reason, note: body.note, expected_version: body.expectedVersion },
  })
  return res.plan
}

export async function moveParcelItem(
  groupId: string,
  parcelNo: number,
  body: { itemKey: string; toParcelNo: number | null; reason: AdjustmentReason; note?: string; expectedVersion: number },
): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/parcels/${String(parcelNo)}/move-item`, {
    method: 'POST',
    auth: true,
    body: {
      item_key: body.itemKey,
      to_parcel_no: body.toParcelNo,
      reason: body.reason,
      note: body.note,
      expected_version: body.expectedVersion,
    },
  })
  return res.plan
}

export async function requestParcelGuide(groupId: string, parcelNo: number, regenerate = false): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/parcels/${String(parcelNo)}/guide`, {
    method: 'POST',
    auth: true,
    body: { regenerate },
  })
  return res.plan
}

export async function packPlan(
  groupId: string,
  expectedVersion: number,
  parcels: { parcelNo: number; weightKg: number }[],
): Promise<PackingPlan> {
  const res = await apiRequest<PlanEnvelope>(`${base(groupId)}/pack`, {
    method: 'POST',
    auth: true,
    body: {
      expected_version: expectedVersion,
      parcels: parcels.map((p) => ({ parcel_no: p.parcelNo, weight_kg: p.weightKg })),
    },
  })
  return res.plan
}
