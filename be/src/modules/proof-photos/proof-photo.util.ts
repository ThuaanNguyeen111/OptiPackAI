import { createHash } from 'crypto';

/**
 * ===================================================================
 * 10/11/2026 — Ảnh bằng chứng (BE_MOBILE_CHECKLIST mục 4)
 * ===================================================================
 * Ảnh lưu trên Cloudinary (gói Free: ảnh ≤ 10 MB). Luồng: app gửi ảnh lên
 * POST /proof-photos → nhận lại URL → gửi kèm `photo_urls` khi giao hàng,
 * giao thất bại, kiểm hàng hoàn, báo lỗi kiện. BE chỉ nhận URL nằm đúng thư
 * mục ảnh bằng chứng của cloud mình (không cho gắn ảnh từ nơi khác).
 * ===================================================================
 */
export const MAX_PROOF_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PROOF_PHOTOS = 3;
export const PROOF_PHOTO_FOLDER = 'optipack/proof';
/** Thu nhỏ cạnh dài về ≤ 1600 px, nén tự động, lưu dạng JPG (ảnh HEIC iPhone cũng đổi sang JPG). */
export const PROOF_PHOTO_TRANSFORMATION = 'c_limit,w_1600,h_1600/q_auto';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function readCloudinaryConfig(env: Record<string, string | undefined>): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/** Nhận diện định dạng theo byte đầu file (không tin `mimetype` client gửi). */
export function proofPhotoFormat(data: Buffer): 'jpeg' | 'png' | 'webp' | 'heic' | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp') {
    const brand = data.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
  }
  return null;
}

/** Chữ ký Cloudinary: sắp tham số theo tên, nối `k=v` bằng `&`, thêm API secret, SHA-1. */
export function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ''}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/** URL có đúng là ảnh bằng chứng trên cloud của mình không (https, đúng cloud, đúng thư mục). */
export function isOwnProofPhotoUrl(url: string, cloudName: string): boolean {
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!url.startsWith(prefix) || url.length > 500) return false;
  const rest = url.slice(prefix.length);
  // Cloudinary có thể chèn `v<số>/` (phiên bản) trước thư mục.
  return /^(v\d+\/)?optipack\/proof\/[A-Za-z0-9_\-./]+$/.test(rest) && !rest.includes('..');
}
