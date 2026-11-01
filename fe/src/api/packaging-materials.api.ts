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

export type PackagingMaterialKind = 'box' | 'cushioning' | 'mailer'

export type PackagingMaterialStock = {
  code: string
  name: string
  kind: string
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  matchMaterialType: string | null
  unitCostVnd: number
  reusable: boolean
  maxReuseCycles: number
  qtyNew: number
  qtyReused: number
  qtyInternal: number
  isActive: boolean
}

export type PackagingMaterialMovement = {
  materialCode: string
  condition: string
  type: string
  delta: number
  savingVnd: number
  followedRecommendation: boolean | null
  refType: string | null
  refId: string | null
  note: string | null
  createdAt: string | null
}

export type CreatePackagingMaterialInput = {
  code: string
  name: string
  kind: PackagingMaterialKind
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  matchMaterialType?: string
  /** Túi niêm phong: khối lượng túi (g), bắt buộc. */
  tareG?: number
  /** Túi niêm phong: tải hàng tối đa (g). Trống = mặc định của BE. */
  maxLoadG?: number
  unitCostVnd: number
  reusable?: boolean
  maxReuseCycles?: number
}

export type UpdatePackagingMaterialInput = {
  name?: string
  unitCostVnd?: number
  reusable?: boolean
  maxReuseCycles?: number
}

function pickNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function mapMaterial(raw: unknown): PackagingMaterialStock | null {
  const row = asRecord(raw)
  if (!row) return null
  const code = typeof row.code === 'string' ? row.code : ''
  if (!code) return null
  return {
    code,
    name: typeof row.name === 'string' ? row.name : code,
    kind: typeof row.kind === 'string' ? row.kind : '',
    lengthCm: pickNullableNumber(row.lengthCm ?? row.length_cm),
    widthCm: pickNullableNumber(row.widthCm ?? row.width_cm),
    heightCm: pickNullableNumber(row.heightCm ?? row.height_cm),
    matchMaterialType: pickString(row.matchMaterialType ?? row.match_material_type),
    unitCostVnd: pickNumber(row.unitCostVnd, row.unit_cost_vnd),
    reusable: row.reusable !== false,
    maxReuseCycles: pickNumber(row.maxReuseCycles, row.max_reuse_cycles) || 3,
    qtyNew: pickNumber(row.qtyNew, row.qty_new),
    qtyReused: pickNumber(row.qtyReused, row.qty_reused),
    qtyInternal: pickNumber(row.qtyInternal, row.qty_internal),
    isActive: row.isActive !== false && row.is_active !== false,
  }
}

/** GET /packaging-materials — Admin, Store Owner, Warehouse, Packaging. */
export async function listPackagingMaterials(
  includeInactive = false,
): Promise<PackagingMaterialStock[]> {
  const query = includeInactive ? '?include_inactive=true' : ''
  const res = await apiRequest<unknown>(`/packaging-materials${query}`, {
    auth: true,
  })
  const rows = Array.isArray(res) ? res : []
  return rows.flatMap((raw) => {
    const item = mapMaterial(raw)
    return item ? [item] : []
  })
}

export async function getPackagingMaterial(
  code: string,
): Promise<PackagingMaterialStock> {
  const res = await apiRequest<unknown>(
    `/packaging-materials/${encodeURIComponent(code)}`,
    { auth: true },
  )
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được vật liệu.')
  return item
}

export async function listPackagingMaterialMovements(
  materialCode?: string,
  limit = 100,
): Promise<PackagingMaterialMovement[]> {
  const params = new URLSearchParams()
  if (materialCode) params.set('material_code', materialCode)
  params.set('limit', String(limit))
  const res = await apiRequest<unknown>(
    `/packaging-materials/movements?${params.toString()}`,
    { auth: true },
  )
  const rows = Array.isArray(res) ? res : []
  return rows.flatMap((raw) => {
    const row = asRecord(raw)
    if (!row) return []
    const followed = row.followedRecommendation ?? row.followed_recommendation
    return [
      {
        materialCode: pickString(row.materialCode ?? row.material_code) ?? '',
        condition: pickString(row.condition) ?? '',
        type: pickString(row.type) ?? '',
        delta: pickNumber(row.delta),
        savingVnd: pickNumber(row.savingVnd, row.saving_vnd),
        followedRecommendation: typeof followed === 'boolean' ? followed : null,
        refType: pickString(row.refType ?? row.ref_type),
        refId: pickString(row.refId ?? row.ref_id),
        note: pickString(row.note),
        createdAt: pickString(row.createdAt ?? row.created_at),
      },
    ]
  })
}

export async function createPackagingMaterial(
  input: CreatePackagingMaterialInput,
): Promise<PackagingMaterialStock> {
  const body: Record<string, unknown> = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    kind: input.kind,
    unit_cost_vnd: input.unitCostVnd,
    reusable: input.reusable ?? true,
    max_reuse_cycles: input.maxReuseCycles ?? 3,
  }
  if (input.kind === 'box') {
    body.length_cm = input.lengthCm
    body.width_cm = input.widthCm
    body.height_cm = input.heightCm
  } else if (input.kind === 'mailer') {
    body.length_cm = input.lengthCm
    body.width_cm = input.widthCm
    body.tare_g = input.tareG
    if (input.maxLoadG !== undefined) body.max_load_g = input.maxLoadG
    body.reusable = false
  } else if (input.matchMaterialType) {
    body.match_material_type = input.matchMaterialType.trim()
  }
  const res = await apiRequest<unknown>('/packaging-materials', {
    method: 'POST',
    auth: true,
    body,
  })
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được vật liệu vừa tạo.')
  return item
}

export async function updatePackagingMaterial(
  code: string,
  input: UpdatePackagingMaterialInput,
): Promise<PackagingMaterialStock> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name.trim()
  if (input.unitCostVnd !== undefined) body.unit_cost_vnd = input.unitCostVnd
  if (input.reusable !== undefined) body.reusable = input.reusable
  if (input.maxReuseCycles !== undefined) {
    body.max_reuse_cycles = input.maxReuseCycles
  }
  const res = await apiRequest<unknown>(
    `/packaging-materials/${encodeURIComponent(code)}`,
    { method: 'PATCH', auth: true, body },
  )
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được vật liệu vừa sửa.')
  return item
}

export async function deactivatePackagingMaterial(
  code: string,
): Promise<PackagingMaterialStock> {
  const res = await apiRequest<unknown>(
    `/packaging-materials/${encodeURIComponent(code)}`,
    { method: 'DELETE', auth: true },
  )
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được vật liệu.')
  return item
}

export async function reactivatePackagingMaterial(
  code: string,
): Promise<PackagingMaterialStock> {
  const res = await apiRequest<unknown>(
    `/packaging-materials/${encodeURIComponent(code)}/reactivate`,
    { method: 'POST', auth: true },
  )
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được vật liệu.')
  return item
}

export async function purchasePackagingMaterial(
  code: string,
  quantity: number,
  note?: string,
): Promise<PackagingMaterialStock> {
  const res = await apiRequest<unknown>(
    `/packaging-materials/${encodeURIComponent(code)}/purchase`,
    {
      method: 'POST',
      auth: true,
      body: { quantity, note: note?.trim() || undefined },
    },
  )
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được tồn sau khi nhập.')
  return item
}

export async function internalUsePackagingMaterial(
  code: string,
  quantity: number,
  purpose: string,
): Promise<PackagingMaterialStock> {
  const res = await apiRequest<unknown>(
    `/packaging-materials/${encodeURIComponent(code)}/internal-use`,
    {
      method: 'POST',
      auth: true,
      body: { quantity, purpose: purpose.trim() },
    },
  )
  const item = mapMaterial(res)
  if (!item) throw new Error('Không đọc được tồn sau khi xuất nội bộ.')
  return item
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
