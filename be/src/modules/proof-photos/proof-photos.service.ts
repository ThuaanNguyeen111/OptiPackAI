import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { createHash } from 'crypto';
import type { ClientSession, Model } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { RECEIPT_OCR_ERROR_CODES } from '../receipt-ocr/receipt-ocr.errors';
import { PROOF_PHOTO_ERROR_CODES as E } from './proof-photos.errors';
import { ReceiptPhoto, type ReceiptPhotoDocument, type ReceiptPhotoUsage } from './schemas/receipt-photo.schema';
import {
  MAX_PROOF_PHOTO_BYTES,
  MAX_PROOF_PHOTOS,
  PHASH_SUSPECT_DISTANCE,
  PROOF_PHOTO_FOLDER,
  PROOF_PHOTO_TRANSFORMATION,
  RECEIPT_PHOTO_FOLDER,
  type PhotoFolder,
  isOwnProofPhotoUrl,
  isPdf,
  phashDistance,
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
  phash?: unknown;
}

/** Ảnh phiếu nghi chụp lại một phiếu đã dùng (pHash gần), không chặn. */
export interface ReceiptPhotoCheck {
  suspect: boolean;
  similarTo: { url: string; usedBy: ReceiptPhotoUsage; distance: number }[];
}

/** shortcut: so pHash với N ảnh đã dùng gần nhất trong RAM; kho lớn hơn thì cần chỉ mục BK-tree / LSH. */
const PHASH_SCAN_LIMIT = 2000;

const UPLOAD_TIMEOUT_MS = 30_000;
const LIST_TIMEOUT_MS = 15_000;
export const RECENT_PHOTOS_PAGE = 24;

export interface StoredPhoto {
  url: string;
  createdAt: string | null;
  width: number | null;
  height: number | null;
}

interface CloudinarySearchResponse {
  resources?: { secure_url?: unknown; created_at?: unknown; width?: unknown; height?: unknown }[];
  next_cursor?: unknown;
}

/** 10/11/2026 — Gửi ảnh bằng chứng lên Cloudinary (BE_MOBILE_CHECKLIST mục 4). */
@Injectable()
export class ProofPhotosService {
  private readonly logger = new Logger(ProofPhotosService.name);

  constructor(@Optional() @InjectModel(ReceiptPhoto.name) private readonly receiptPhotoModel?: Model<ReceiptPhotoDocument>) {}

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
      // Phiếu NCC nhận cả PDF (hoá đơn điện tử, phiếu qua email): Cloudinary đổi trang đầu sang JPG như ảnh.
      const pdfAllowed = folder === RECEIPT_PHOTO_FOLDER;
      const format = proofPhotoFormat(file.buffer) ?? (pdfAllowed && isPdf(file.buffer) ? 'pdf' : null);
      if (!format) {
        const message = pdfAllowed ? 'Chỉ nhận ảnh JPG, PNG, WebP, HEIC hoặc file PDF.' : 'Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.';
        throw new AppException(E.INVALID_TYPE, message, HttpStatus.BAD_REQUEST, { index });
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
          ...(folder === RECEIPT_PHOTO_FOLDER ? { phash: 'true' } : {}),
        };
        const body = new URLSearchParams({
          ...params,
          api_key: config.apiKey,
          signature: signCloudinaryParams(params, config.apiSecret),
          // shortcut: PDF chỉ lấy trang đầu (mặc định Cloudinary); phiếu nhiều trang thì tải thêm ảnh trang sau.
          file: `data:${format === 'pdf' ? 'application/pdf' : `image/${format}`};base64,${file.buffer.toString('base64')}`,
        });
        try {
          const res = await axios.post<CloudinaryUploadResponse>(
            `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: UPLOAD_TIMEOUT_MS, maxBodyLength: Infinity },
          );
          const { secure_url: url, public_id: publicId, width, height, bytes, phash } = res.data;
          if (typeof url !== 'string' || typeof publicId !== 'string') throw new Error('Cloudinary không trả secure_url');
          if (folder === RECEIPT_PHOTO_FOLDER) {
            await this.recordReceiptPhoto(url, createHash('md5').update(file.buffer).digest('hex'), typeof phash === 'string' ? phash : null);
          }
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

  /** Lỗi ghi dấu vân tay không làm hỏng lần tải (ảnh vẫn dùng được, chỉ mất khả năng bắt trùng file). */
  private async recordReceiptPhoto(url: string, md5: string, phash: string | null): Promise<void> {
    if (!this.receiptPhotoModel) return;
    try {
      await this.receiptPhotoModel.updateOne(
        { url },
        { $setOnInsert: { url, md5, phash, used_by: null, created_at: new Date() } },
        { upsert: true },
      );
    } catch (error: unknown) {
      this.logger.warn(`Không ghi được dấu vân tay ảnh phiếu: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * (AOFP-311) Kiểm ảnh phiếu TRƯỚC khi lưu phiếu: cùng URL hoặc cùng file (md5) với ảnh đã dùng → 409
   * WH_RECEIPT_PHOTO_REUSED. pHash cách ≤ PHASH_SUSPECT_DISTANCE bit với ảnh đã dùng → `suspect`, không chặn.
   */
  async checkReceiptPhotos(urls: string[]): Promise<ReceiptPhotoCheck> {
    const none: ReceiptPhotoCheck = { suspect: false, similarTo: [] };
    if (!this.receiptPhotoModel || urls.length === 0) return none;
    const mine = await this.receiptPhotoModel.find({ url: { $in: urls } }).select({ url: 1, md5: 1, phash: 1, used_by: 1 }).lean();
    const md5s = mine.flatMap((p) => (p.md5 ? [p.md5] : []));
    const reused =
      mine.find((p) => p.used_by) ??
      (md5s.length > 0
        ? await this.receiptPhotoModel.findOne({ md5: { $in: md5s }, used_by: { $ne: null } }).select({ url: 1, used_by: 1 }).lean()
        : null);
    if (reused?.used_by) throw this.reusedError(reused.url, reused.used_by);

    const phashes = mine.flatMap((p) => (p.phash ? [p.phash] : []));
    if (phashes.length === 0) return none;
    const used = await this.receiptPhotoModel
      .find({ phash: { $type: 'string' }, used_by: { $ne: null } })
      .sort({ 'used_by.at': -1 })
      .limit(PHASH_SCAN_LIMIT)
      .select({ url: 1, phash: 1, used_by: 1 })
      .lean();
    const similarTo = used.flatMap((u) => {
      const usedBy = u.used_by;
      if (!u.phash || !usedBy) return [];
      const distances = phashes.map((h) => phashDistance(h, u.phash ?? '')).filter((d): d is number => d !== null);
      if (distances.length === 0) return [];
      const distance = Math.min(...distances);
      return distance <= PHASH_SUSPECT_DISTANCE ? [{ url: u.url, usedBy, distance }] : [];
    });
    return { suspect: similarTo.length > 0, similarTo };
  }

  /**
   * Gắn ảnh vào phiếu vừa lưu. Có điều kiện `used_by: null` nên 2 phiếu lưu cùng lúc chỉ 1 phiếu thắng
   * (phiếu kia: E11000 trên `url` → 409). Ảnh không có bản ghi (tải trước AOFP-311) được tạo bản ghi md5 = null.
   */
  async markReceiptPhotosUsed(urls: string[], usage: { kind: ReceiptPhotoUsage['kind']; ref: string }, session?: ClientSession): Promise<void> {
    if (!this.receiptPhotoModel) return;
    const usedBy: ReceiptPhotoUsage = { ...usage, at: new Date() };
    for (const url of urls) {
      try {
        await this.receiptPhotoModel.updateOne(
          { url, used_by: null },
          { $set: { used_by: usedBy }, $setOnInsert: { url, md5: null, phash: null, created_at: new Date() } },
          { upsert: true, session },
        );
      } catch (error: unknown) {
        if (!isDuplicateKey(error)) throw error;
        const other = await this.receiptPhotoModel.findOne({ url }).select({ used_by: 1 }).session(session ?? null).lean();
        throw this.reusedError(url, other?.used_by ?? usedBy);
      }
    }
  }

  private reusedError(url: string, usedBy: ReceiptPhotoUsage): AppException {
    const where = usedBy.kind === 'stock_receipt' ? 'phiếu nhập kho khác' : `lần nhập vật tư ${usedBy.ref}`;
    return new AppException(
      RECEIPT_OCR_ERROR_CODES.PHOTO_REUSED,
      `Ảnh phiếu đã được sử dụng trên ${where} — chụp phiếu của lần nhập này.`,
      HttpStatus.CONFLICT,
      { url, usedBy: { kind: usedBy.kind, ref: usedBy.ref, at: usedBy.at } },
    );
  }

  /**
   * 16/11/2026 — ảnh đã tải trong 1 thư mục, mới nhất trước (Cloudinary Search API), để chọn lại
   * ảnh phiếu chụp trước đó (VD chụp bằng điện thoại, chọn trên máy tính). Chỉ trả URL đúng cloud + thư mục.
   */
  async listRecent(folder: PhotoFolder, cursor?: string): Promise<{ photos: StoredPhoto[]; nextCursor: string | null }> {
    const config = readCloudinaryConfig(process.env);
    if (!config) {
      throw new AppException(E.NOT_CONFIGURED, 'Chưa cấu hình nơi lưu ảnh (CLOUDINARY_* trong be/.env).', HttpStatus.SERVICE_UNAVAILABLE);
    }
    try {
      const res = await axios.post<CloudinarySearchResponse>(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/resources/search`,
        {
          expression: `resource_type:image AND public_id:${folder}/*`,
          sort_by: [{ created_at: 'desc' }],
          max_results: RECENT_PHOTOS_PAGE,
          ...(cursor ? { next_cursor: cursor } : {}),
        },
        { auth: { username: config.apiKey, password: config.apiSecret }, timeout: LIST_TIMEOUT_MS },
      );
      const photos = (res.data.resources ?? []).flatMap((r): StoredPhoto[] => {
        const url = r.secure_url;
        if (typeof url !== 'string' || !isOwnProofPhotoUrl(url, config.cloudName, folder)) return [];
        return [{
          url,
          createdAt: typeof r.created_at === 'string' ? r.created_at : null,
          width: typeof r.width === 'number' ? r.width : null,
          height: typeof r.height === 'number' ? r.height : null,
        }];
      });
      const next = res.data.next_cursor;
      return { photos, nextCursor: typeof next === 'string' && next.length > 0 ? next : null };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(`Liệt kê ảnh Cloudinary thất bại: ${String(status ?? '')} ${error instanceof Error ? error.message : String(error)}`);
      throw new AppException(E.LIST_FAILED, 'Không tải được danh sách ảnh đã lưu, thử lại sau.', HttpStatus.BAD_GATEWAY);
    }
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}
