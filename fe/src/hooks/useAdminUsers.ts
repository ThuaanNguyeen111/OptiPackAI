import { useCallback, useState } from 'react'
import type { AdminUser, AiPackagingParams } from '../types/admin'
import { adminUsersMock, defaultAiPackagingParams } from '../data/admin-mock'

type UseAdminUsersApi = {
  users: AdminUser[]
  loading: boolean
  fetchUsers: () => Promise<AdminUser[]>
  updateUser: (id: string, patch: Partial<Pick<AdminUser, 'role' | 'employeeCode' | 'department'>>) => Promise<void>
  resetPassword: (id: string) => Promise<void>
  setActive: (id: string, active: boolean) => Promise<void>
  createUser: (user: Omit<AdminUser, 'id' | 'createdAt'>) => Promise<void>
  aiParams: AiPackagingParams
  updateAiParams: (next: Partial<AiPackagingParams>) => void
}

export function useAdminUsers(): UseAdminUsersApi {
  const [users, setUsers] = useState<AdminUser[]>(() => adminUsersMock)
  const [loading, setLoading] = useState(false)
  const [aiParams, setAiParams] = useState<AiPackagingParams>(() => defaultAiPackagingParams)

  const fetchUsers = useCallback(async (): Promise<AdminUser[]> => {
    setLoading(true)
    // simulate network latency
    await new Promise((r) => setTimeout(r, 300))
    setLoading(false)
    return users
  }, [users])

  const updateUser = useCallback(
    async (
      id: string,
      patch: Partial<Pick<AdminUser, 'role' | 'employeeCode' | 'department'>>,
    ): Promise<void> => {
      setLoading(true)
      await new Promise((r) => setTimeout(r, 300))
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
      setLoading(false)
    },
    [],
  )

  const resetPassword = useCallback(async (id: string): Promise<void> => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 300))
    // For mock: set mustChangePassword true and active true (server may lock/unlock)
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, mustChangePassword: true, active: true } : u)))
    setLoading(false)
  }, [])

  const setActive = useCallback(async (id: string, active: boolean): Promise<void> => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 250))
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)))
    setLoading(false)
  }, [])

  const createUser = useCallback(async (user: Omit<AdminUser, 'id' | 'createdAt'>): Promise<void> => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 350))
    const newUser: AdminUser = {
      ...user,
      id: `u-${Math.floor(Math.random() * 10000)}`,
      createdAt: new Date().toISOString(),
    }
    setUsers((prev) => [newUser, ...prev])
    setLoading(false)
  }, [])

  const updateAiParams = useCallback((next: Partial<AiPackagingParams>) => {
    setAiParams((p) => ({ ...p, ...next }))
  }, [])

  return {
    users,
    loading,
    fetchUsers,
    updateUser,
    resetPassword,
    setActive,
    createUser,
    aiParams,
    updateAiParams,
  }
}
