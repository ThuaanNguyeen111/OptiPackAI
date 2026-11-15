import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isOwnProofPhotoUrl, MAX_PROOF_PHOTOS, PROOF_PHOTO_FOLDER, RECEIPT_PHOTO_FOLDER, type PhotoFolder } from './proof-photo.util';

function photoUrlsDecorator(name: string, folder: PhotoFolder, message: string, options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message, ...options },
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null) return true;
          if (!Array.isArray(value) || value.length > MAX_PROOF_PHOTOS) return false;
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
          if (value.length > 0 && !cloudName) return false;
          return value.every((u) => typeof u === 'string' && isOwnProofPhotoUrl(u, cloudName ?? '', folder));
        },
      },
    });
  };
}

/**
 * 10/11/2026 — field `photo_urls`: mảng tối đa 3 URL lấy từ POST /proof-photos.
 * Mảng rỗng / không gửi luôn hợp lệ (bắt buộc ảnh hay không do service quyết).
 */
export function IsProofPhotoUrls(options?: ValidationOptions): PropertyDecorator {
  return photoUrlsDecorator(
    'isProofPhotoUrls',
    PROOF_PHOTO_FOLDER,
    `photo_urls tối đa ${String(MAX_PROOF_PHOTOS)} ảnh, mỗi URL phải lấy từ POST /proof-photos`,
    options,
  );
}

/** 11/11/2026 — ảnh phiếu NCC: tối đa 3 URL lấy từ POST /proof-photos?purpose=receipt. Bắt buộc hay không do service quyết. */
export function IsReceiptPhotoUrls(options?: ValidationOptions): PropertyDecorator {
  return photoUrlsDecorator(
    'isReceiptPhotoUrls',
    RECEIPT_PHOTO_FOLDER,
    `document_photo_urls tối đa ${String(MAX_PROOF_PHOTOS)} ảnh, mỗi URL phải lấy từ POST /proof-photos?purpose=receipt`,
    options,
  );
}
