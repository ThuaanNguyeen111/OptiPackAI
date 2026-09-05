import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * ===================================================================
 * 2. MÃ HÓA TOKEN — CÙNG NGUYÊN TẮC ĐÃ ÁP DỤNG CHO mfaSecret
 * ===================================================================
 * LÝ DO tồn tại riêng file này (không nhét thẳng logic vào service):
 * accessToken/refreshToken của Shopee & TikTok là "chìa khóa" gọi
 * thẳng vào tài khoản shop thật của người dùng cuối — lộ ra là mất
 * quyền kiểm soát shop của họ. Do đó KHÔNG BAO GIỜ lưu thô vào Mongo,
 * dù đây "chỉ là" đồ án — đây là bài học kế thừa từ audit EDUMEE.
 *
 * Thuật toán: AES-256-GCM (authenticated encryption — vừa mã hóa vừa
 * chống bị sửa đổi dữ liệu mã hóa, khác với AES-CBC thường chỉ mã hóa).
 * ===================================================================
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 byte là chuẩn khuyến nghị cho GCM (không phải 16 như CBC)
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;

  if (keyHex?.length !== 64) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng trong .env — cần chuỗi hex 64 ký tự (32 byte).',
    );
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Mã hóa 1 chuỗi token thô → chuỗi lưu được vào MongoDB.
 * Format lưu: "iv:authTag:ciphertext" (tất cả hex) — gộp 3 phần vào
 * 1 field string cho gọn, thay vì tách 3 field riêng trong schema.
 */
export function encryptToken(plainToken: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainToken, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Giải mã ngược lại — dùng ngay trước khi gọi API thật sang Shopee/TikTok.
 * KHÔNG BAO GIỜ log ra giá trị trả về của hàm này.
 */
export function decryptToken(encryptedValue: string): string {
  const [ivHex, authTagHex, cipherTextHex] = encryptedValue.split(':');

  if (!ivHex || !authTagHex || !cipherTextHex) {
    throw new Error('Định dạng token đã mã hóa không hợp lệ — có thể dữ liệu bị hỏng.');
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherTextHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// Giữ hằng số này export ra để test unit có thể assert độ dài, không hard-code lại số.
export const TOKEN_ENCRYPTION_AUTH_TAG_LENGTH = AUTH_TAG_LENGTH;
