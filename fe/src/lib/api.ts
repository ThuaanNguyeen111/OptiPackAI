import { embedApiBase, isEmbedMode } from './embed-session'
import { getAccessToken, getRefreshToken, updateTokens } from './auth-storage'
import { isWaitingForReLogin, waitForReLogin } from './session-expiry'
import { MARKETPLACE_ORDERS_ERROR_MESSAGES } from '../types/marketplace-orders'
import { ORDER_GROUPS_ERROR_MESSAGES } from '../types/order-groups'
import { RETURNS_ERROR_MESSAGES } from '../types/returns'
import { SHIPMENT_ERROR_MESSAGES } from '../types/shipments'
import { WAREHOUSE_ERROR_MESSAGES } from '../types/warehouse-admin'

// Trang nhúng (WebView trong app mobile) dùng địa chỉ API do app truyền vào.
export const API_BASE_URL =
  embedApiBase() || import.meta.env.VITE_API_URL || 'http://localhost:3000'

/** JwtStrategy đọc Redis trước Mongo — Redis chậm/treo thì fetch không bao giờ settle. */
const REQUEST_TIMEOUT_MS = 12_000

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

/**
 * (13/11/2026) Request bị người gọi huỷ (VD đổi bộ lọc khi danh sách cũ chưa về).
 * Màn hình bắt bằng `isRequestCanceled(err)` và bỏ qua, không hiện lỗi.
 */
export class RequestCanceledError extends Error {
  constructor() {
    super('Đã huỷ yêu cầu.')
    this.name = 'RequestCanceledError'
  }
}

export function isRequestCanceled(err: unknown): boolean {
  return err instanceof RequestCanceledError
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  if (signal?.aborted) throw new RequestCanceledError()
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    timeoutMs,
  )
  const onCancel = () => controller.abort()
  signal?.addEventListener('abort', onCancel)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: unknown) {
    if (signal?.aborted) throw new RequestCanceledError()
    if (isAbortError(err)) {
      throw new ApiError(0, [
        'Máy chủ không phản hồi kịp. Kiểm tra backend và Redis đang chạy, rồi tải lại trang.',
      ])
    }
    throw err
  } finally {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onCancel)
  }
}

export class ApiError extends Error {
  status: number
  messages: string[]
  errorCode: string | null
  details: Record<string, unknown> | null

  constructor(
    status: number,
    messages: string[],
    errorCode: string | null = null,
    details: Record<string, unknown> | null = null,
  ) {
    super(messages[0] ?? 'Có lỗi xảy ra, thử lại sau.')
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
    this.errorCode = errorCode
    this.details = details
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

function parseErrorCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const code = (payload as { error_code?: unknown }).error_code
  return typeof code === 'string' && code.length > 0 ? code : null
}

function parseDetails(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null
  const details = (payload as { details?: unknown }).details
  if (typeof details !== 'object' || details === null || Array.isArray(details)) {
    return null
  }
  return details as Record<string, unknown>
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

/** ok = có token mới; expired = refresh trả 401 (phiên chết thật); failed = lỗi khác (mạng, 500) — giữ phiên. */
type RefreshOutcome = 'ok' | 'expired' | 'failed'

let refreshInFlight: Promise<RefreshOutcome> | null = null

/** AOFP-334 — các tab dùng chung refresh token trong localStorage: chỉ 1 tab xoay một lúc. */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request('optipack-refresh', fn) : fn()
}

async function rotateRefreshToken(sentAccess: string | null): Promise<RefreshOutcome> {
  // Trang nhúng không tự làm mới token (xem embed-session.ts) — để app cấp token mới.
  if (isEmbedMode()) return 'failed'
  return withRefreshLock(async () => {
    // Tab khác vừa xoay xong trong lúc chờ khoá → dùng luôn token mới, không gửi token cũ (sẽ bị REUSED).
    const current = getAccessToken()
    if (current && current !== sentAccess) return 'ok'
    const refreshToken = getRefreshToken()
    // Tab khác đã đăng xuất (localStorage dùng chung bị xoá) → phiên hết thật: hiện hộp đăng nhập lại.
    if (!refreshToken) return 'expired'

    let res: Response
    try {
      res = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    } catch {
      return 'failed'
    }
    // Chỉ 401 mới là phiên hết; 500 / 429 thì giữ phiên, lần sau thử lại.
    if (res.status === 401) return 'expired'
    if (!res.ok) return 'failed'

    const data = (await parseJson(res)) as {
      access_token?: string
      refresh_token?: string
    } | null
    if (!data?.access_token || !data?.refresh_token) return 'failed'

    updateTokens(data.access_token, data.refresh_token)
    return 'ok'
  })
}

function ensureRefreshed(sentAccess: string | null): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = rotateRefreshToken(sentAccess).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Sau 401: làm mới token, hoặc chờ người dùng đăng nhập lại trên hộp thoại. true = gửi lại request. */
async function recoverFrom401(sentAccess: string | null): Promise<boolean> {
  if (isWaitingForReLogin()) return waitForReLogin()
  const outcome = await ensureRefreshed(sentAccess)
  if (outcome === 'ok') return true
  return outcome === 'expired' ? waitForReLogin() : false
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  skipRefresh?: boolean
  /** Đồng bộ catalog Lazada có thể lâu hơn 12 giây mặc định. */
  timeoutMs?: number
  /** (13/11/2026) Huỷ request (VD đổi bộ lọc) — ném `RequestCanceledError`. */
  signal?: AbortSignal
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = false, skipRefresh = false, timeoutMs, signal } = options

  // FormData (tải ảnh): để trình duyệt tự đặt Content-Type kèm boundary.
  const isForm = body instanceof FormData
  const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' }

  const sentAccess = auth ? getAccessToken() : null
  if (sentAccess) headers.Authorization = `Bearer ${sentAccess}`

  const res = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    },
    timeoutMs,
    signal,
  )

  if (res.status === 401 && auth && !skipRefresh) {
    if (await recoverFrom401(sentAccess)) {
      return apiRequest<T>(path, { ...options, skipRefresh: true })
    }
  }

  const payload = await parseJson(res)

  if (!res.ok) {
    throw new ApiError(
      res.status,
      parseMessage(payload),
      parseErrorCode(payload),
      parseDetails(payload),
    )
  }

  return payload as T
}

/**
 * (14/10/2026) Tải file nhị phân (PDF phiếu đóng gói / nhãn kiện / bảng kê chuyến
 * `GET /documents/*`, nhãn A5 của hãng…). Cùng cơ chế token + tự refresh khi 401
 * như `apiRequest`; lỗi BE (JSON) ném `ApiError` như thường.
 *
 * Dùng: `const url = URL.createObjectURL(await apiRequestBlob('/documents/shipping-label/' + groupId))`
 * rồi `window.open(url)`; nhớ `URL.revokeObjectURL(url)` khi đóng.
 */
export async function apiRequestBlob(
  path: string,
  options: { auth?: boolean; skipRefresh?: boolean; timeoutMs?: number } = {},
): Promise<Blob> {
  const { auth = true, skipRefresh = false, timeoutMs } = options
  const headers: Record<string, string> = {}
  const sentAccess = auth ? getAccessToken() : null
  if (sentAccess) headers.Authorization = `Bearer ${sentAccess}`
  const res = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    { method: 'GET', headers },
    timeoutMs ?? 30_000,
  )
  if (res.status === 401 && auth && !skipRefresh) {
    if (await recoverFrom401(sentAccess)) return apiRequestBlob(path, { ...options, skipRefresh: true })
  }
  if (!res.ok) {
    const payload = await parseJson(res)
    throw new ApiError(
      res.status,
      parseMessage(payload),
      parseErrorCode(payload),
      parseDetails(payload),
    )
  }
  return res.blob()
}

/**
 * (14/10/2026) Thời gian chờ gợi ý cho các route gọi API hãng vận chuyển
 * (báo giá GHN, đặt GHN, so phương án đóng gói) — truyền vào `timeoutMs`.
 */
export const CARRIER_REQUEST_TIMEOUT_MS = 60_000

/**
 * AOFP-323 — lệnh ghi có thể ĐÃ tới máy chủ nhưng không nhận được trả lời (mất mạng, hết giờ,
 * gateway lỗi) → không biết đã lưu hay chưa, phải tải lại dữ liệu. Huỷ chủ động thì không tính.
 */
export function isUncertainWrite(err: unknown): boolean {
  if (err instanceof RequestCanceledError) return false
  if (err instanceof ApiError) return err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504
  return err instanceof TypeError
}

export function getApiErrorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.errorCode : null
}

export function getApiErrorDetailString(
  err: unknown,
  key: string,
): string | null {
  if (!(err instanceof ApiError) || !err.details) return null
  const value = err.details[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function getApiErrorDetailList(err: unknown, key: string): string[] {
  if (!(err instanceof ApiError) || !err.details) return []
  const value = err.details[key]
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.errorCode && MARKETPLACE_ORDERS_ERROR_MESSAGES[err.errorCode]) {
      return MARKETPLACE_ORDERS_ERROR_MESSAGES[err.errorCode]
    }
    if (err.errorCode && ORDER_GROUPS_ERROR_MESSAGES[err.errorCode]) {
      return ORDER_GROUPS_ERROR_MESSAGES[err.errorCode]
    }
    if (err.errorCode && WAREHOUSE_ERROR_MESSAGES[err.errorCode]) {
      return WAREHOUSE_ERROR_MESSAGES[err.errorCode]
    }
    if (err.errorCode && SHIPMENT_ERROR_MESSAGES[err.errorCode]) {
      return SHIPMENT_ERROR_MESSAGES[err.errorCode]
    }
    if (err.errorCode && RETURNS_ERROR_MESSAGES[err.errorCode]) {
      return RETURNS_ERROR_MESSAGES[err.errorCode]
    }
    if (err.status === 429) {
      return 'Quá nhiều yêu cầu trong 1 phút. Đợi rồi tải lại trang.'
    }
    return err.messages.join(' ')
  }
  if (isAbortError(err)) {
    return 'Máy chủ không phản hồi kịp. Kiểm tra backend và Redis đang chạy, rồi tải lại trang.'
  }
  if (err instanceof TypeError) {
    return 'Không kết nối được máy chủ. Hãy chạy backend (cổng 3000) rồi thử lại.'
  }
  if (err instanceof Error) return err.message
  return 'Không kết nối được máy chủ. Kiểm tra backend đang chạy.'
}
