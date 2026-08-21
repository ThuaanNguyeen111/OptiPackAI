import { clearSession, getAccessToken, getRefreshToken, updateTokens } from './auth-storage'

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000'

export class ApiError extends Error {
  status: number
  messages: string[]

  constructor(status: number, messages: string[]) {
    super(messages[0] ?? 'Có lỗi xảy ra, thử lại sau.')
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }
}

function parseMessage(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) {
    return ['Có lỗi xảy ra, thử lại sau.']
  }
  const message = (payload as { message?: unknown }).message
  if (typeof message === 'string') return [message]
  if (Array.isArray(message)) {
    return message.filter((m): m is string => typeof m === 'string')
  }
  return ['Có lỗi xảy ra, thử lại sau.']
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

let refreshInFlight: Promise<boolean> | null = null

async function rotateRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!res.ok) {
    clearSession()
    return false
  }

  const data = (await parseJson(res)) as {
    access_token?: string
    refresh_token?: string
  } | null

  if (!data?.access_token || !data?.refresh_token) {
    clearSession()
    return false
  }

  updateTokens(data.access_token, data.refresh_token)
  return true
}

async function ensureRefreshed(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = rotateRefreshToken().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  skipRefresh?: boolean
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = false, skipRefresh = false } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && auth && !skipRefresh) {
    const ok = await ensureRefreshed()
    if (ok) {
      return apiRequest<T>(path, { ...options, skipRefresh: true })
    }
  }

  const payload = await parseJson(res)

  if (!res.ok) {
    throw new ApiError(res.status, parseMessage(payload))
  }

  return payload as T
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) return err.messages.join(' ')
  if (err instanceof Error) return err.message
  return 'Không kết nối được máy chủ. Kiểm tra backend đang chạy.'
}
