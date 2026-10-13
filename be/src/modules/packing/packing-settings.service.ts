import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { DEFAULT_FRAGILE_CUSHION_MM } from '../packaging/engine';
import { PackingSettings, PackingSettingsDocument } from './schemas/packing-settings.schema';
import { PACKING_ERROR_CODES } from './packing.errors';
import type { UpdatePackingSettingsDto } from './dto/packing-session.dto';

export interface ActivePackingSettings {
  /** null = đang dùng mặc định trong code (chưa ai lưu). */
  version: number | null;
  abnormalWeightThreshold: number;
  fragileCushionMm: number;
  defaultPrefer: 'fewest_parcels' | 'cheapest';
  maxParcelsPerOrder: number | null;
  allowReusedBoxForFragile: boolean;
  requireScan: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export const DEFAULT_PACKING_SETTINGS: ActivePackingSettings = {
  version: null,
  abnormalWeightThreshold: 0.2,
  fragileCushionMm: DEFAULT_FRAGILE_CUSHION_MM,
  defaultPrefer: 'fewest_parcels',
  maxParcelsPerOrder: null,
  allowReusedBoxForFragile: false,
  requireScan: false,
  updatedBy: null,
  updatedAt: null,
};

@Injectable()
export class PackingSettingsService {
  constructor(
    @InjectModel(PackingSettings.name) private readonly settingsModel: Model<PackingSettingsDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async get(): Promise<ActivePackingSettings> {
    const doc = await this.settingsModel.findOne({ is_active: true }).sort({ version: -1 }).lean();
    if (!doc) return { ...DEFAULT_PACKING_SETTINGS };
    return {
      version: doc.version,
      abnormalWeightThreshold: doc.abnormal_weight_threshold,
      fragileCushionMm: doc.fragile_cushion_mm,
      defaultPrefer: doc.default_prefer,
      maxParcelsPerOrder: doc.max_parcels_per_order,
      allowReusedBoxForFragile: doc.allow_reused_box_for_fragile,
      requireScan: doc.require_scan,
      updatedBy: doc.updated_by?.toString() ?? null,
      updatedAt: doc.created_at ?? null,
    };
  }

  /** Lưu bản MỚI: trường không gửi giữ giá trị hiện tại. `max_parcels_per_order: null` = bỏ giới hạn. */
  async update(dto: UpdatePackingSettingsDto, userId: string): Promise<ActivePackingSettings> {
    const current = await this.get();
    if (dto.expected_version !== undefined && dto.expected_version !== current.version) {
      throw this.conflict(current.version);
    }
    const latest = await this.settingsModel.findOne().sort({ version: -1 }).select('version').lean();
    const version = (latest?.version ?? 0) + 1;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.settingsModel.create(
          [
            {
              version,
              abnormal_weight_threshold: dto.abnormal_weight_threshold ?? current.abnormalWeightThreshold,
              fragile_cushion_mm: dto.fragile_cushion_mm ?? current.fragileCushionMm,
              default_prefer: dto.default_prefer ?? current.defaultPrefer,
              max_parcels_per_order:
                dto.max_parcels_per_order === undefined ? current.maxParcelsPerOrder : dto.max_parcels_per_order,
              allow_reused_box_for_fragile: dto.allow_reused_box_for_fragile ?? current.allowReusedBoxForFragile,
              require_scan: dto.require_scan ?? current.requireScan,
              updated_by: new Types.ObjectId(userId),
              is_active: true,
            },
          ],
          { session },
        );
        await this.settingsModel.updateMany(
          { version: { $ne: version }, is_active: true },
          { $set: { is_active: false } },
          { session },
        );
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000) {
        throw this.conflict(current.version);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return this.get();
  }

  private conflict(version: number | null): AppException {
    return new AppException(
      PACKING_ERROR_CODES.SETTINGS_CONFLICT,
      'Cài đặt đóng gói vừa được người khác lưu — tải lại rồi lưu lại.',
      HttpStatus.CONFLICT,
      { version },
    );
  }
}
