import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppException } from '../../common/exceptions/app-exception';
import { PROOF_PHOTO_ERROR_CODES as E } from './proof-photos.errors';
import {
  MAX_PROOF_PHOTO_BYTES,
  MAX_PROOF_PHOTOS,
  PROOF_PHOTO_FOLDER,
  PROOF_PHOTO_TRANSFORMATION,
  type PhotoFolder,
  proofPhotoFormat,
  readCloudinaryConfig,
  signCloudinaryParams,
} from './proof-photo.util';

export interface ProofPhotoFile {
  buffer: Buffer;
  size: number;
}

export interface UploadedProofPhoto {
  url: string;
  publicId: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

interface CloudinaryUploadResponse {
  secure_url?: unknown;
  public_id?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
}

const UPLOAD_TIMEOUT_MS = 30_000;

/** 10/11/2026 — Gửi ảnh bằng chứng lên Cloudinary (BE_MOBILE_CHECKLIST mục 4). */
@Injectable()
export class ProofPhotosService {
  private readonly logger = new Logger(ProofPhotosService.name);

  async upload(files: ProofPhotoFile[], folder: PhotoFolder = PROOF_PHOTO_FOLDER): Promise<UploadedProofPhoto[]> {
    const config = readCloudinaryConfig(process.env);
    if (!config) {
      throw new AppException(
        E.NOT_CONFIGURED,
        'Chưa cấu hình nơi lưu ảnh (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET trong be/.env).',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (files.length === 0) throw new AppException(E.NO_FILE, 'Chọn ít nhất 1 ảnh (field "files").');
    if (files.length > MAX_PROOF_PHOTOS) {
      throw new AppException(E.TOO_MANY, `Tối đa ${String(MAX_PROOF_PHOTOS)} ảnh mỗi lần.`, HttpStatus.BAD_REQUEST, { max: MAX_PROOF_PHOTOS });
    }
    const prepared = files.map((file, index) => {
      if (file.size === 0 || file.size > MAX_PROOF_PHOTO_BYTES) {
        throw new AppException(E.TOO_LARGE, 'Mỗi ảnh tối đa 10 MB.', HttpStatus.BAD_REQUEST, { index, maxBytes: MAX_PROOF_PHOTO_BYTES });
      }
      const format = proofPhotoFormat(file.buffer);
      if (!format) {
        throw new AppException(E.INVALID_TYPE, 'Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.', HttpStatus.BAD_REQUEST, { index });
      }
      return { file, format };
    });

    return Promise.all(
      prepared.map(async ({ file, format }) => {
        const params: Record<string, string> = {
          folder,
          format: 'jpg',
          timestamp: String(Math.floor(Date.now() / 1000)),
          transformation: PROOF_PHOTO_TRANSFORMATION,
        };
        const body = new URLSearchParams({
          ...params,
          api_key: config.apiKey,
          signature: signCloudinaryParams(params, config.apiSecret),
          file: `data:image/${format};base64,${file.buffer.toString('base64')}`,
        });
        try {
          const res = await axios.post<CloudinaryUploadResponse>(
            `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: UPLOAD_TIMEOUT_MS, maxBodyLength: Infinity },
          );
          const { secure_url: url, public_id: publicId, width, height, bytes } = res.data;
          if (typeof url !== 'string' || typeof publicId !== 'string') throw new Error('Cloudinary không trả secure_url');
          return {
            url,
            publicId,
            width: typeof width === 'number' ? width : null,
            height: typeof height === 'number' ? height : null,
            bytes: typeof bytes === 'number' ? bytes : null,
          };
        } catch (error: unknown) {
          // Không log body/secret — chỉ mã HTTP và thông điệp lỗi của Cloudinary.
          const status = axios.isAxiosError(error) ? error.response?.status : undefined;
          const detail = axios.isAxiosError(error) ? (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message : undefined;
          this.logger.warn(`Gửi ảnh lên Cloudinary thất bại: ${String(status ?? '')} ${detail ?? (error instanceof Error ? error.message : String(error))}`);
          throw new AppException(E.UPLOAD_FAILED, 'Không gửi được ảnh lên nơi lưu trữ, thử lại sau.', HttpStatus.BAD_GATEWAY);
        }
      }),
    );
  }
}
