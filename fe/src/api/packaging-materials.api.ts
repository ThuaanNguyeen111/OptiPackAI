import { apiRequest } from '../lib/api'

export type PackagingMaterialsSavings = {
  totalSavingVnd: number
  unitsConsumedNew: number
  unitsConsumedReused: number
  unitsRecovered: number
  reuseRate: number
  unitsRecoveredInternal: number
  unitsInternalUsed: number
  unitsDiscarded: number
  groupsPacked: number
  groupsFollowedRecommendation: number
  recommendationFollowRate: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

export type PackagingMaterialStock = {
  code: string
  name: string
  kind: string
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  qtyNew: number
  qtyReused: number
  isActive: boolean
}

function pickNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** GET /packaging-materials — Packaging Staff được xem tồn mới / tái sử dụng. */
export async function listPackagingMaterials(): Promise<PackagingMaterialStock[]> {
  const res = await apiRequest<unknown>('/packaging-materials', { auth: true })
  const rows = Array.isArray(res) ? res : []
  return rows.flatMap((raw) => {
    const row = asRecord(raw)
    if (!row) return []
    const code = typeof row.code === 'string' ? row.code : ''
    if (!code) return []
    return [
      {
        code,
        name: typeof row.name === 'string' ? row.name : code,
        kind: typeof row.kind === 'string' ? row.kind : '',
        lengthCm: pickNullableNumber(row.lengthCm ?? row.length_cm),
        widthCm: pickNullableNumber(row.widthCm ?? row.width_cm),
        heightCm: pickNullableNumber(row.heightCm ?? row.height_cm),
        qtyNew: pickNumber(row.qtyNew, row.qty_new),
        qtyReused: pickNumber(row.qtyReused, row.qty_reused),
        isActive: row.isActive !== false && row.is_active !== false,
      },
    ]
  })
}

/** GET /packaging-materials/savings — Admin + Store Owner. */
export async function getPackagingMaterialsSavings(): Promise<PackagingMaterialsSavings> {
  const res = await apiRequest<unknown>('/packaging-materials/savings', {
    auth: true,
  })
  const row = asRecord(res) ?? {}
  return {
    totalSavingVnd: pickNumber(row.totalSavingVnd, row.total_saving_vnd),
    unitsConsumedNew: pickNumber(row.unitsConsumedNew, row.units_consumed_new),
    unitsConsumedReused: pickNumber(
      row.unitsConsumedReused,
      row.units_consumed_reused,
    ),
    unitsRecovered: pickNumber(row.unitsRecovered, row.units_recovered),
    reuseRate: pickNumber(row.reuseRate, row.reuse_rate),
    unitsRecoveredInternal: pickNumber(
      row.unitsRecoveredInternal,
      row.units_recovered_internal,
    ),
    unitsInternalUsed: pickNumber(
      row.unitsInternalUsed,
      row.units_internal_used,
    ),
    unitsDiscarded: pickNumber(row.unitsDiscarded, row.units_discarded),
    groupsPacked: pickNumber(row.groupsPacked, row.groups_packed),
    groupsFollowedRecommendation: pickNumber(
      row.groupsFollowedRecommendation,
      row.groups_followed_recommendation,
    ),
    recommendationFollowRate: pickNumber(
      row.recommendationFollowRate,
      row.recommendation_follow_rate,
    ),
  }
}
