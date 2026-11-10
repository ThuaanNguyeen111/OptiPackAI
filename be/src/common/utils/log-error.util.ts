import { isAxiosError } from 'axios';
import { AppException } from '../exceptions/app-exception';

/**
 * 10/11/2026 — Mô tả lỗi 1 dòng để ghi log, KHÔNG lộ bí mật.
 *
 * Trước đây các chỗ gọi API sàn (Lazada, AURELLE, Tiki) ghi nguyên object lỗi axios
 * (`logger.error(msg, error)`) → log dài hàng nghìn dòng (socket, agent, bảng mã HTTP) và
 * chứa `access_token`, `sign` trong URL, header `Authorization`, body có `client_secret`.
 *
 * - Lỗi axios: `GET http://host/rest/orders/get → HTTP 400 (code=..., message=...)` hoặc
 *   `→ ECONNREFUSED`. Chỉ giữ origin + path (bỏ query), không ghi header / body gửi đi;
 *   từ body trả về chỉ lấy `code` / `message` dạng chuỗi ngắn.
 * - AppException: `ERROR_CODE: message`.
 * - Error khác: `Name: message` (không kèm stack — gọi `error.stack` riêng nếu cần).
 */
export function describeError(error: unknown): string {
  if (isAxiosError(error)) {
    const method = (error.config?.method ?? 'request').toUpperCase();
    const where = safeUrl(error.config?.baseURL, error.config?.url);
    const status = error.response?.status;
    const outcome = status !== undefined ? `HTTP ${String(status)}` : (error.code ?? error.message);
    const detail = responseDetail(error.response?.data);
    return `${method} ${where} → ${outcome}${detail ? ` (${detail})` : ''}`;
  }
  if (error instanceof AppException) return `${error.errorCode}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function safeUrl(baseURL: string | undefined, url: string | undefined): string {
  const raw = url ?? '';
  try {
    const parsed = new URL(raw, baseURL);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split('?')[0] ?? '';
  }
}

function responseDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const nested = typeof d.error === 'object' && d.error !== null ? (d.error as Record<string, unknown>) : {};
  const parts: string[] = [];
  for (const [key, value] of [
    ['code', d.code ?? nested.code ?? nested.status],
    ['message', d.message ?? nested.message ?? d.error_description],
  ] as const) {
    if (typeof value === 'string' || typeof value === 'number') parts.push(`${key}=${String(value).slice(0, 120)}`);
  }
  return parts.join(', ');
}
