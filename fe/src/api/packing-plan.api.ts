import { apiRequest } from '../lib/api'
import type {
  AdjustmentReason,
  PackingFeedbackReport,
  PackingPlan,
  PackingPlanSummary,
  PackingReport,
  PackingSettings,
  PackingStaffMember,
  ParcelReviewReason,
  RejectReason,
} from '../types/packing-plan'

function groupPath(groupId: string, suffix = ''): string {
  return `/order-groups/${encodeURIComponent(groupId)}/packing-plan${suffix}`
}

export async function getPackingPlan(
  groupId: string,
): Promise<PackingPlan | null> {
  const res = await apiRequest<{ plan: PackingPlan | null }>(groupPath(groupId), {
    auth: true,
  })
  return res.plan ?? null
}

export async function recomputePackingPlan(
  groupId: string,
  expectedVersion?: number,
): Promise<PackingPlan> {
  const res = await apiRequest<{ plan: PackingPlan }>(groupPath(groupId, '/recompute'), {
    method: 'POST',
    auth: true,
    body: expectedVersion != null ? { expected_version: expectedVersion } : {},
  })
  return res.plan
}

export async function approvePackingPlan(
  groupId: string,
  expectedVersion: number,
  overrideReason?: string,
): Promise<PackingPlan> {
  const res = await apiRequest<{ plan: PackingPlan }>(groupPath(groupId, '/approve'), {
    method: 'POST',
    auth: true,
    body: {
      expected_version: expectedVersion,
      ...(overrideReason ? { override_reason: overrideReason } : {}),
    },
  })
  return res.plan
}

export async function undoApprovePackingPlan(
  groupId: string,
  expectedVersion: number,
): Promise<PackingPlan> {
  const res = await apiRequest<{ plan: PackingPlan }>(groupPath(groupId, '/undo-approve'), {
    method: 'POST',
    auth: true,
    body: { expected_version: expectedVersion },
  })
  return res.plan
}

export async function changeParcelBox(
  groupId: string,
  parcelNo: number,
  input: {
    expectedVersion: number
    boxCode: string
    reason: AdjustmentReason
    note?: string
  },
): Promise<PackingPlan> {
  const res = await apiRequest<{ plan: PackingPlan }>(
    groupPath(groupId, `/parcels/${String(parcelNo)}/change-box`),
    {
      method: 'POST',
      auth: true,
      body: {
        expected_version: input.expectedVersion,
        box_code: input.boxCode,
        reason: input.reason,
        ...(input.note ? { note: input.note } : {}),
      },
    },
  )
  return res.plan
}

export async function rejectPackingPlan(
  groupId: string,
  input: {
    expectedVersion: number
    reason: RejectReason
    note?: string
  },
): Promise<PackingPlan> {
  const res = await apiRequest<{ plan: PackingPlan }>(groupPath(groupId, '/reject'), {
    method: 'POST',
    auth: true,
    body: {
      expected_version: input.expectedVersion,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
    },
  })
  return res.plan
}

async function readPlan(
  groupId: string,
  suffix: string,
  body: Record<string, unknown>,
): Promise<PackingPlan> {
  const res = await apiRequest<{ plan: PackingPlan }>(groupPath(groupId, suffix), {
    method: 'POST',
    auth: true,
    body,
  })
  return res.plan
}

export function startPackingSession(
  groupId: string,
  expectedVersion: number,
): Promise<PackingPlan> {
  return readPlan(groupId, '/start', { expected_version: expectedVersion })
}

export function scanParcelItem(
  groupId: string,
  parcelNo: number,
  input: { code: string; quantity: number; clientEventId: string },
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/scan`, {
    code: input.code,
    quantity: input.quantity,
    scan_method: 'manual',
    client_event_id: input.clientEventId,
  })
}

export function unscanParcelItem(
  groupId: string,
  parcelNo: number,
  input: { expectedVersion: number; itemKey: string; reason: string },
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/unscan`, {
    expected_version: input.expectedVersion,
    item_key: input.itemKey,
    reason: input.reason,
  })
}

export function sealParcel(
  groupId: string,
  parcelNo: number,
  expectedVersion: number,
  weightKg: number,
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/seal`, {
    expected_version: expectedVersion,
    weight_kg: weightKg,
  })
}

export function reviewParcel(
  groupId: string,
  parcelNo: number,
  input: {
    expectedVersion: number
    action: 'accept' | 'reweigh' | 'reopen'
    reason: ParcelReviewReason
    weightKg?: number
    note?: string
  },
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/review`, {
    expected_version: input.expectedVersion,
    action: input.action,
    reason: input.reason,
    ...(input.weightKg != null ? { weight_kg: input.weightKg } : {}),
    ...(input.note ? { note: input.note } : {}),
  })
}

export function finishPackingSession(
  groupId: string,
  expectedVersion: number,
): Promise<PackingPlan> {
  return readPlan(groupId, '/finish', { expected_version: expectedVersion })
}

export function unsealParcel(
  groupId: string,
  parcelNo: number,
  input: {
    expectedVersion: number
    reason: AdjustmentReason
    boxCondition: 'reusable' | 'damaged'
    note?: string
  },
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/unseal`, {
    expected_version: input.expectedVersion,
    reason: input.reason,
    box_condition: input.boxCondition,
    ...(input.note ? { note: input.note } : {}),
  })
}

export function changeParcelBoxInSession(
  groupId: string,
  parcelNo: number,
  input: {
    expectedVersion: number
    boxCode: string
    reason: AdjustmentReason
    oldBoxOutcome: 'unused' | 'damaged'
    note?: string
  },
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/change-box-in-session`, {
    expected_version: input.expectedVersion,
    box_code: input.boxCode,
    reason: input.reason,
    old_box_outcome: input.oldBoxOutcome,
    ...(input.note ? { note: input.note } : {}),
  })
}

export function reportPackingIssue(
  groupId: string,
  input: {
    expectedVersion: number
    parcelNo: number
    itemKey: string
    issue: 'damaged' | 'missing' | 'wrong_item'
    resolution: 'replace' | 'back_to_picking'
    warehouseId?: string
    note?: string
  },
): Promise<PackingPlan> {
  return readPlan(groupId, '/report-issue', {
    expected_version: input.expectedVersion,
    parcel_no: input.parcelNo,
    item_key: input.itemKey,
    issue: input.issue,
    resolution: input.resolution,
    ...(input.warehouseId ? { warehouse_id: input.warehouseId } : {}),
    ...(input.note ? { note: input.note } : {}),
  })
}

export function unpackParcel(
  groupId: string,
  parcelNo: number,
  input: {
    expectedVersion: number
    boxCondition: 'reusable' | 'damaged'
    note?: string
  },
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/unpack`, {
    expected_version: input.expectedVersion,
    box_condition: input.boxCondition,
    ...(input.note ? { note: input.note } : {}),
  })
}

export async function packPlan(
  groupId: string,
  expectedVersion: number,
  parcels: { parcel_no: number; weight_kg: number }[],
): Promise<{ plan: PackingPlan; completed: boolean }> {
  return apiRequest<{ plan: PackingPlan; completed: boolean }>(
    groupPath(groupId, '/pack'),
    {
      method: 'POST',
      auth: true,
      body: { expected_version: expectedVersion, parcels },
    },
  )
}

export async function listPackingPlanSummaries(
  groupIds: string[],
): Promise<PackingPlanSummary[]> {
  if (groupIds.length === 0) return []
  const query = encodeURIComponent(groupIds.slice(0, 200).join(','))
  const res = await apiRequest<{ summaries: PackingPlanSummary[] }>(
    `/packing-plans/summary?group_ids=${query}`,
    { auth: true },
  )
  return res.summaries ?? []
}

export async function listPackingStaff(q?: string): Promise<PackingStaffMember[]> {
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const res = await apiRequest<{ staff: PackingStaffMember[] }>(`/packing/staff${query}`, {
    auth: true,
  })
  return res.staff ?? []
}

export function assignPacker(
  groupId: string,
  mode: 'auto' | 'manual',
  staffId?: string,
): Promise<PackingPlan> {
  return readPlan(groupId, '/assign', {
    mode,
    ...(mode === 'manual' && staffId ? { staff_id: staffId } : {}),
  })
}

export function requestParcelGuide(
  groupId: string,
  parcelNo: number,
  regenerate = false,
): Promise<PackingPlan> {
  return readPlan(groupId, `/parcels/${String(parcelNo)}/guide`, {
    ...(regenerate ? { regenerate: true } : {}),
  })
}

export function backToPicking(
  groupId: string,
  input: {
    expectedVersion: number
    items: { sku: string; quantity: number; restock?: boolean }[]
    note?: string
  },
): Promise<PackingPlan> {
  return readPlan(groupId, '/back-to-picking', {
    expected_version: input.expectedVersion,
    items: input.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      ...(item.restock ? { restock: true } : {}),
    })),
    ...(input.note ? { note: input.note } : {}),
  })
}

export async function getPackingSettings(): Promise<PackingSettings> {
  const res = await apiRequest<{ settings: PackingSettings }>('/packing/settings', {
    auth: true,
  })
  return res.settings
}

export async function updatePackingSettings(
  body: Record<string, unknown>,
): Promise<PackingSettings> {
  const res = await apiRequest<{ settings: PackingSettings }>('/packing/settings', {
    method: 'PUT',
    auth: true,
    body,
  })
  return res.settings
}

export async function getPackingReport(): Promise<PackingReport> {
  const res = await apiRequest<{ report: PackingReport }>('/packing/reports/summary', {
    auth: true,
  })
  return res.report
}

export async function getPackingFeedback(): Promise<PackingFeedbackReport> {
  const res = await apiRequest<{ report: PackingFeedbackReport }>(
    '/packing/reports/feedback',
    { auth: true },
  )
  return res.report
}
