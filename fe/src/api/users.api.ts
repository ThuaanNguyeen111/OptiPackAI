import { apiRequest } from '../lib/api'
import type { AdminUser, CreateUserInput, Role, UpdateUserInput } from '../types/admin'
import { LoginType } from '../types/admin'
import { isUserRole, type UserRole } from '../types/auth'

export type UserProfile = {
  id: string
  name: string
  email: string
  role: UserRole
  phone?: string
  address?: string
  avatar?: string
  employeeCode?: string
  department?: string
  mfaEnabled: boolean
  createdAt?: string
}

export type UpdateProfileInput = {
  phone?: string
  address?: string
  avatar?: string
}

export type BeUserRecord = {
  _id?: string
  id?: string
  name: string
  email: string
  role: number
  phone?: string
  address?: string
  avatar?: string
  employee_code?: string
  department?: string
  mfa_enabled?: boolean
  is_active?: boolean
  login_type?: string
  must_change_password?: boolean
  must_change_password_by?: string
  locked_until?: string
  last_login_at?: string
  created_at?: string
}

type PaginatedUsersResponse = {
  data: BeUserRecord[]
  total: number
  page: number
  limit: number
}

type CreateUserResponse = {
  message: string
  user: { id: string; name: string; email: string; role: number }
  temporary_password: string
}

type ResetPasswordResponse = {
  message: string
  temporary_password: string
}

type MessageResponse = {
  message: string
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value
}

function resolveUserId(record: BeUserRecord): string {
  return record.id ?? record._id ?? ''
}

function toLoginType(value: string | undefined): LoginType {
  if (value === LoginType.GOOGLE) return LoginType.GOOGLE
  return LoginType.LOCAL
}

export function mapBeUserToProfile(record: BeUserRecord): UserProfile {
  const role = Number(record.role)
  if (!isUserRole(role)) {
    throw new Error('Role người dùng không hợp lệ.')
  }

  return {
    id: resolveUserId(record),
    name: record.name,
    email: record.email,
    role,
    phone: record.phone,
    address: record.address,
    avatar: record.avatar,
    employeeCode: record.employee_code,
    department: record.department,
    mfaEnabled: Boolean(record.mfa_enabled),
    createdAt: toIso(record.created_at),
  }
}

export function mapBeUserToAdminUser(record: BeUserRecord): AdminUser {
  const role = Number(record.role)
  if (!isUserRole(role)) {
    throw new Error('Role người dùng không hợp lệ.')
  }

  return {
    id: resolveUserId(record),
    name: record.name,
    email: record.email,
    role: role as Role,
    phone: record.phone,
    address: record.address,
    employeeCode: record.employee_code,
    department: record.department,
    mfaEnabled: Boolean(record.mfa_enabled),
    active: record.is_active !== false,
    loginType: toLoginType(record.login_type),
    mustChangePassword: Boolean(record.must_change_password),
    mustChangePasswordBy: toIso(record.must_change_password_by),
    lockedUntil: toIso(record.locked_until),
    lastLoginAt: toIso(record.last_login_at),
    createdAt: toIso(record.created_at) ?? new Date().toISOString(),
  }
}

function toAdminUpdateBody(patch: UpdateUserInput): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.role !== undefined) body.role = patch.role
  if (patch.phone !== undefined) body.phone = patch.phone
  if (patch.address !== undefined) body.address = patch.address
  if (patch.employeeCode !== undefined) body.employee_code = patch.employeeCode
  if (patch.department !== undefined) body.department = patch.department
  return body
}

export async function fetchMyProfile(): Promise<UserProfile> {
  const res = await apiRequest<BeUserRecord>('/users/me', { auth: true })
  return mapBeUserToProfile(res)
}

export async function updateMyProfile(
  patch: UpdateProfileInput,
): Promise<UserProfile> {
  const body: Record<string, string> = {}
  if (patch.phone !== undefined) body.phone = patch.phone
  if (patch.address !== undefined) body.address = patch.address
  if (patch.avatar !== undefined) body.avatar = patch.avatar

  const res = await apiRequest<BeUserRecord>('/users/me', {
    method: 'PATCH',
    body,
    auth: true,
  })
  return mapBeUserToProfile(res)
}

export type FetchUsersParams = {
  page?: number
  limit?: number
  role?: Role
}

export type FetchUsersResult = {
  users: AdminUser[]
  total: number
  page: number
  limit: number
}

export async function fetchUsers(
  params: FetchUsersParams = {},
): Promise<FetchUsersResult> {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (params.role !== undefined) {
    qs.set('role', String(params.role))
  }

  const res = await apiRequest<PaginatedUsersResponse>(`/users?${qs}`, {
    auth: true,
  })

  return {
    users: res.data.map(mapBeUserToAdminUser),
    total: res.total,
    page: res.page,
    limit: res.limit,
  }
}

export async function createUserApi(
  input: CreateUserInput,
): Promise<{ user: AdminUser; temporaryPassword: string }> {
  const res = await apiRequest<CreateUserResponse>('/users', {
    method: 'POST',
    body: {
      name: input.name,
      email: input.email,
      role: input.role,
    },
    auth: true,
  })

  const user = mapBeUserToAdminUser({
    id: res.user.id,
    name: res.user.name,
    email: res.user.email,
    role: res.user.role,
    mfa_enabled: false,
    is_active: true,
    login_type: LoginType.LOCAL,
    must_change_password: true,
    must_change_password_by: new Date(
      Date.now() + 72 * 60 * 60 * 1000,
    ).toISOString(),
    created_at: new Date().toISOString(),
  })

  return { user, temporaryPassword: res.temporary_password }
}

export async function updateUserApi(
  id: string,
  patch: UpdateUserInput,
): Promise<AdminUser> {
  const res = await apiRequest<BeUserRecord>(`/users/${id}`, {
    method: 'PATCH',
    body: toAdminUpdateBody(patch),
    auth: true,
  })
  return mapBeUserToAdminUser(res)
}

export async function resetPasswordApi(
  id: string,
): Promise<{ temporaryPassword: string }> {
  const res = await apiRequest<ResetPasswordResponse>(
    `/users/${id}/reset-password`,
    { method: 'POST', auth: true },
  )
  return { temporaryPassword: res.temporary_password }
}

export async function deactivateUserApi(id: string): Promise<void> {
  await apiRequest<MessageResponse>(`/users/${id}`, {
    method: 'DELETE',
    auth: true,
  })
}

export async function reactivateUserApi(id: string): Promise<void> {
  await apiRequest<MessageResponse>(`/users/${id}/reactivate`, {
    method: 'POST',
    auth: true,
  })
}

export async function disableMfaApi(id: string): Promise<void> {
  await apiRequest<MessageResponse>(`/users/${id}/disable-mfa`, {
    method: 'POST',
    auth: true,
  })
}
