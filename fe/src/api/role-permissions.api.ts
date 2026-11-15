import { apiRequest } from '../lib/api'
import { FEATURE_VALUES, type Feature } from '../lib/rbac'
import { isUserRole, type UserRole } from '../types/auth'

export type RoleFeatureMatrix = Partial<Record<UserRole, Feature[]>>

export type RolePermissions = {
  roles: UserRole[]
  matrix: RoleFeatureMatrix
  defaults: RoleFeatureMatrix
}

function toFeatures(value: unknown): Feature[] {
  if (!Array.isArray(value)) return []
  return FEATURE_VALUES.filter((f) => value.includes(f))
}

function toMatrix(value: unknown): RoleFeatureMatrix {
  if (typeof value !== 'object' || value === null) return {}
  const out: RoleFeatureMatrix = {}
  for (const [key, list] of Object.entries(value)) {
    const role = Number(key)
    if (isUserRole(role)) out[role] = toFeatures(list)
  }
  return out
}

function toPermissions(raw: unknown): RolePermissions {
  const row = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const roles = Array.isArray(row.roles) ? row.roles.filter(isUserRole) : []
  return { roles, matrix: toMatrix(row.matrix), defaults: toMatrix(row.defaults) }
}

/** Trang role của tôi được vào (Admin: tất cả). */
export async function fetchMyFeatures(): Promise<Feature[]> {
  const raw = await apiRequest<{ features?: unknown }>('/role-permissions/me', { auth: true })
  return toFeatures(raw.features)
}

export async function fetchRolePermissions(): Promise<RolePermissions> {
  return toPermissions(await apiRequest<unknown>('/role-permissions', { auth: true }))
}

export async function updateRolePermissions(role: UserRole, features: Feature[]): Promise<RolePermissions> {
  return toPermissions(
    await apiRequest<unknown>(`/role-permissions/${String(role)}`, {
      method: 'PUT',
      auth: true,
      body: { features },
    }),
  )
}
