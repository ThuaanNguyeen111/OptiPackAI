import { useCallback, useEffect, useState } from 'react'
import {
  createUserApi,
  deactivateUserApi,
  disableMfaApi,
  fetchUsers,
  reactivateUserApi,
  resetPasswordApi,
  updateUserApi,
} from '../api/users.api'
import type {
  AdminUser,
  AiPackagingParams,
  CreateUserInput,
  Role,
  UpdateUserInput,
} from '../types/admin'
import { defaultAiPackagingParams } from '../data/admin-mock'

const USERS_PAGE_LIMIT = 100

type UseAdminUsersApi = {
  users: AdminUser[]
  loading: boolean
  usersLoading: boolean
  page: number
  total: number
  limit: number
  roleFilter: Role | 'all'
  setRoleFilter: (role: Role | 'all') => void
  setPage: (page: number) => void
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
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [page, setPageState] = useState(1)
  const [total, setTotal] = useState(0)
  const [roleFilter, setRoleFilterState] = useState<Role | 'all'>('all')
  const [aiParams, setAiParams] = useState<AiPackagingParams>(
    () => defaultAiPackagingParams,
  )

  const loadUsers = useCallback(async (nextPage: number, nextRole: Role | 'all') => {
    setUsersLoading(true)
    try {
      const result = await fetchUsers({
        page: nextPage,
        limit: USERS_PAGE_LIMIT,
        role: nextRole === 'all' ? undefined : nextRole,
      })
      setUsers(result.users)
      setTotal(result.total)
    } catch {
      setUsers([])
      setTotal(0)
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers(page, roleFilter)
  }, [loadUsers, page, roleFilter])

  const setRoleFilter = useCallback((role: Role | 'all') => {
    setRoleFilterState(role)
    setPageState(1)
  }, [])

  const setPage = useCallback((nextPage: number) => {
    setPageState(Math.max(1, nextPage))
  }, [])

  const updateUser = useCallback(async (id: string, patch: UpdateUserInput) => {
    setLoading(true)
    try {
      const updated = await updateUserApi(id, patch)
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                ...patch,
                ...updated,
              }
            : u,
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const resetPassword = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const { temporaryPassword } = await resetPasswordApi(id)
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
      return { temporaryPassword }
    } finally {
      setLoading(false)
    }
  }, [])

  const deactivate = useCallback(async (id: string) => {
    setLoading(true)
    try {
      await deactivateUserApi(id)
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, active: false } : u)),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const reactivate = useCallback(async (id: string) => {
    setLoading(true)
    try {
      await reactivateUserApi(id)
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, active: true } : u)),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const disableMfa = useCallback(async (id: string) => {
    setLoading(true)
    try {
      await disableMfaApi(id)
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, mfaEnabled: false } : u)),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const createUser = useCallback(async (input: CreateUserInput) => {
    setLoading(true)
    try {
      const { user, temporaryPassword } = await createUserApi(input)
      setUsers((prev) => [user, ...prev])
      setTotal((prev) => prev + 1)
      return { temporaryPassword }
    } finally {
      setLoading(false)
    }
  }, [])

  const updateAiParams = useCallback((next: Partial<AiPackagingParams>) => {
    setAiParams((p) => ({ ...p, ...next }))
  }, [])

  return {
    users,
    loading,
    usersLoading,
    page,
    total,
    limit: USERS_PAGE_LIMIT,
    roleFilter,
    setRoleFilter,
    setPage,
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
