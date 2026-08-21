import { useCallback, useState } from 'react'
import type {
  AdminUser,
  AiPackagingParams,
  CreateUserInput,
  UpdateUserInput,
} from '../types/admin'
import { LoginType } from '../types/admin'
import { adminUsersMock, defaultAiPackagingParams } from '../data/admin-mock'

function mockTempPassword() {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

type UseAdminUsersApi = {
  users: AdminUser[]
  loading: boolean
  updateUser: (id: string, patch: UpdateUserInput) => Promise<void>
  resetPassword: (id: string) => Promise<{ temporaryPassword: string }>
  deactivate: (id: string) => Promise<void>
  reactivate: (id: string) => Promise<void>
  disableMfa: (id: string) => Promise<void>
  createUser: (
    user: CreateUserInput,
  ) => Promise<{ temporaryPassword: string }>
  aiParams: AiPackagingParams
  updateAiParams: (next: Partial<AiPackagingParams>) => void
}

export function useAdminUsers(): UseAdminUsersApi {
  const [users, setUsers] = useState<AdminUser[]>(() => adminUsersMock)
  const [loading, setLoading] = useState(false)
  const [aiParams, setAiParams] = useState<AiPackagingParams>(
    () => defaultAiPackagingParams,
  )

  const updateUser = useCallback(async (id: string, patch: UpdateUserInput) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 300))
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
    setLoading(false)
  }, [])

  const resetPassword = useCallback(async (id: string) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 300))
    const temporaryPassword = mockTempPassword()
    const until = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              mustChangePassword: true,
              mustChangePasswordBy: until,
              lockedUntil: undefined,
              active: true,
            }
          : u,
      ),
    )
    setLoading(false)
    return { temporaryPassword }
  }, [])

  const deactivate = useCallback(async (id: string) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 250))
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, active: false } : u)),
    )
    setLoading(false)
  }, [])

  const reactivate = useCallback(async (id: string) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 250))
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, active: true } : u)),
    )
    setLoading(false)
  }, [])

  const disableMfa = useCallback(async (id: string) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 250))
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, mfaEnabled: false } : u)),
    )
    setLoading(false)
  }, [])

  const createUser = useCallback(async (input: CreateUserInput) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 350))
    const temporaryPassword = mockTempPassword()
    const newUser: AdminUser = {
      ...input,
      id: `u-${Math.floor(Math.random() * 10000)}`,
      mfaEnabled: false,
      active: true,
      loginType: LoginType.LOCAL,
      mustChangePassword: true,
      mustChangePasswordBy: new Date(
        Date.now() + 72 * 60 * 60 * 1000,
      ).toISOString(),
      createdAt: new Date().toISOString(),
    }
    setUsers((prev) => [newUser, ...prev])
    setLoading(false)
    return { temporaryPassword }
  }, [])

  const updateAiParams = useCallback((next: Partial<AiPackagingParams>) => {
    setAiParams((p) => ({ ...p, ...next }))
  }, [])

  return {
    users,
    loading,
    updateUser,
    resetPassword,
    deactivate,
    reactivate,
    disableMfa,
    createUser,
    aiParams,
    updateAiParams,
  }
}
