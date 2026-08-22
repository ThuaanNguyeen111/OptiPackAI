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
  UpdateUserInput,
} from '../types/admin'
import { defaultAiPackagingParams } from '../data/admin-mock'

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
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [aiParams, setAiParams] = useState<AiPackagingParams>(
    () => defaultAiPackagingParams,
  )

  useEffect(() => {
    let cancelled = false
    void fetchUsers()
      .then((data) => {
        if (!cancelled) setUsers(data)
      })
      .catch(() => {
        if (!cancelled) setUsers([])
      })
    return () => {
      cancelled = true
    }
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
