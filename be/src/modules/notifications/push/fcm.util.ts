import { createSign } from 'crypto';
import { readFileSync } from 'fs';

/**
 * 10/11/2026 — Gửi push qua FCM HTTP v1 bằng service account (không thêm thư viện
 * firebase-admin): tự ký JWT RS256 → đổi lấy access token OAuth2 → gọi messages:send.
 * Tài liệu: firebase.google.com/docs/cloud-messaging/send/v1-api,
 * developers.google.com/identity/protocols/oauth2/service-account#httprest
 */
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Kênh thông báo Android — app phải tạo kênh cùng id (MOBILE_UPDATE_CHECKLIST). */
export const ANDROID_CHANNEL_ID = 'optipack_alerts';

export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Đọc file JSON service account (đường dẫn trong FCM_SERVICE_ACCOUNT_FILE; tương đối thì tính từ thư mục
 * chạy BE — be/; nhóm để file ở `mobile/keys/`, đã .gitignore). Thiếu / sai → null.
 */
export function readFcmServiceAccount(env: NodeJS.ProcessEnv, readFile: (path: string) => string = (p) => readFileSync(p, 'utf8')): FcmServiceAccount | null {
  const path = env.FCM_SERVICE_ACCOUNT_FILE?.trim();
  if (!path) return null;
  try {
    const raw = JSON.parse(readFile(path)) as Record<string, unknown>;
    const projectId = raw.project_id;
    const clientEmail = raw.client_email;
    const privateKey = raw.private_key;
    if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

const base64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

/** JWT (RS256) để đổi lấy access token — hạn 1 giờ (tối đa Google cho phép). */
export function buildServiceAccountJwt(account: FcmServiceAccount, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: account.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${base64url(signer.sign(account.privateKey))}`;
}

export interface PushContent {
  title: string;
  body: string;
  /** FCM chỉ nhận giá trị chuỗi trong `data`. */
  data: Record<string, string>;
  highPriority: boolean;
}

export function buildFcmMessage(token: string, content: PushContent): Record<string, unknown> {
  return {
    message: {
      token,
      notification: { title: content.title, body: content.body },
      data: content.data,
      android: {
        priority: content.highPriority ? 'HIGH' : 'NORMAL',
        notification: { channel_id: ANDROID_CHANNEL_ID },
      },
    },
  };
}

/**
 * Token không còn dùng được → xoá khỏi DB. FCM v1: 404 UNREGISTERED (gỡ app / token hết hạn),
 * 400 INVALID_ARGUMENT kèm lỗi token. Lỗi khác (5xx, 429, mất mạng) → giữ token.
 */
export function isDeadTokenError(status: number | undefined, body: unknown): boolean {
  if (status !== 404 && status !== 400) return false;
  const error = (body as { error?: { status?: unknown; details?: { errorCode?: unknown }[] } } | undefined)?.error;
  const codes = (error?.details ?? []).map((d) => d.errorCode);
  if (status === 404) return codes.includes('UNREGISTERED') || error?.status === 'NOT_FOUND';
  return codes.includes('INVALID_ARGUMENT') || error?.status === 'INVALID_ARGUMENT';
}

/** Cắt nội dung cho vừa màn hình khoá (FCM tối đa 4 KB toàn bộ payload). */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
