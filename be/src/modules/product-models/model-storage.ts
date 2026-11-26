import { HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppException } from '../../common/exceptions/app-exception';
import { readCloudinaryConfig, signCloudinaryParams } from '../proof-photos/proof-photo.util';
import { PRODUCT_MODEL_ERROR_CODES as E } from './product-models.errors';

/** AOFP-352 — file GLB lưu nguyên gốc (resource_type raw) trên Cloudinary; không biến đổi như ảnh. */
export const MODEL_FOLDER = 'optipack/models';
const UPLOAD_TIMEOUT_MS = 60_000;
const logger = new Logger('ProductModelStorage');

function config(): NonNullable<ReturnType<typeof readCloudinaryConfig>> {
  const cfg = readCloudinaryConfig(process.env);
  if (!cfg) {
    throw new AppException(
      E.STORAGE_NOT_CONFIGURED,
      'Chưa cấu hình nơi lưu file (CLOUDINARY_*). Vẫn chọn được mô hình có sẵn hoặc dựng từ hình cơ bản.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  return cfg;
}

export async function uploadModelFile(buffer: Buffer): Promise<{ url: string; publicId: string; bytes: number }> {
  const cfg = config();
  const params = { folder: MODEL_FOLDER, timestamp: String(Math.floor(Date.now() / 1000)) };
  const body = new URLSearchParams({
    ...params,
    api_key: cfg.apiKey,
    signature: signCloudinaryParams(params, cfg.apiSecret),
    file: `data:model/gltf-binary;base64,${buffer.toString('base64')}`,
  });
  try {
    const res = await axios.post<{ secure_url?: unknown; public_id?: unknown; bytes?: unknown }>(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/raw/upload`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: UPLOAD_TIMEOUT_MS, maxBodyLength: Infinity },
    );
    const { secure_url: url, public_id: publicId, bytes } = res.data;
    if (typeof url !== 'string' || typeof publicId !== 'string') throw new Error('Cloudinary không trả secure_url');
    return { url, publicId, bytes: typeof bytes === 'number' ? bytes : buffer.length };
  } catch (error: unknown) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    logger.warn(`Gửi mô hình lên Cloudinary thất bại: ${String(status ?? '')} ${error instanceof Error ? error.message : String(error)}`);
    throw new AppException(E.UPLOAD_FAILED, 'Không gửi được file mô hình lên nơi lưu trữ, thử lại sau.', HttpStatus.BAD_GATEWAY);
  }
}

/** Dọn file khi lưu bản ghi thất bại (spec R15). Best-effort: lỗi chỉ ghi log để dọn tay. */
export async function deleteModelFile(publicId: string): Promise<void> {
  try {
    const cfg = config();
    const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
    const body = new URLSearchParams({ ...params, api_key: cfg.apiKey, signature: signCloudinaryParams(params, cfg.apiSecret) });
    await axios.post(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/raw/destroy`, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });
  } catch (error: unknown) {
    logger.error(`Không xoá được file mô hình mồ côi ${publicId} — cần xoá tay: ${error instanceof Error ? error.message : String(error)}`);
  }
}
