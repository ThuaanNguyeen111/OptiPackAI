import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { Order, OrderDocument } from './schemas/order.schema';
import { OrderSyncSettings, OrderSyncSettingsDocument } from './schemas/order-sync-settings.schema';
import { OrderStatus, UNFULFILLED_ORDER_STATUSES } from './enums/order-status.enum';
import {
  ConsolidationKeyField,
  ConsolidationRule,
  ConsolidationRuleField,
  ConsolidationRuleMatch,
  DEFAULT_ORDER_SYNC_POLICY,
  NORMAL_FLOW_ORDER_STATUSES,
  OpenGroupStatus,
  OrderSyncPolicy,
  SYNC_PLATFORMS,
  setOrderSyncPolicy,
} from './order-sync-policy';
import { UpdateOrderSyncSettingsDto } from './dto/order-sync-settings.dto';
import { ORD_ERROR_CODES } from './orders.errors';
import { computeConsolidationKeyFor, expressConsolidationKey } from './utils/consolidation-key.util';
import { computeRuleKeys, ruleKeySignature, validateConsolidationRules } from './utils/consolidation-rule.util';

/** Bản tiêu chí được nạp lại từ DB định kỳ — các instance khác thấy thay đổi trong ≤ 30 giây. */
const REFRESH_INTERVAL_MS = 30_000;
const RECOMPUTE_BATCH = 500;

/** Đơn đọc ra để tính lại khoá gom (28/10/2026 — thêm shop + mã đơn cho G4: SĐT bị che). */
interface RecomputeRow {
  _id: Types.ObjectId;
  platform: string;
  shop_id: string;
  platform_order_id: string;
  recipient: Order['recipient'];
  consolidation_key: string;
  consolidation_keys?: string[];
  delivery_option?: 'standard' | 'express';
}

export interface OrderSyncSettingsHistoryItem {
  version: number;
  isActive: boolean;
  updatedBy: string | null;
  createdAt: Date | null;
  note: string | null;
}

/**
 * ===================================================================
 * Tiêu chí đồng bộ & gom đơn do Admin cấu hình (15/10/2026)
 * ===================================================================
 * Lưu nhiều phiên bản (giống packing_settings). Bản hiệu lực được đẩy vào
 * `order-sync-policy.ts` để mọi module đọc đồng bộ, không gọi DB mỗi lần.
 * Đổi trường dùng để gom → tính lại `consolidation_key` cho đơn CHƯA xử lý
 * xong (chạy nền); nhóm đã tạo giữ nguyên.
 * ===================================================================
 */
@Injectable()
export class OrderSyncSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSyncSettingsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(OrderSyncSettings.name) private readonly settingsModel: Model<OrderSyncSettingsDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh().catch((error: unknown) => {
      this.logger.warn(`Không nạp được tiêu chí đồng bộ, dùng mặc định: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.timer = setInterval(() => {
      void this.refresh().catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Đọc bản mới nhất từ DB và đẩy vào policy dùng chung. */
  async refresh(): Promise<OrderSyncPolicy> {
    const doc = await this.settingsModel.findOne({ is_active: true }).sort({ version: -1 }).lean();
    const policy = doc ? this.toPolicy(doc) : this.clonePolicy(DEFAULT_ORDER_SYNC_POLICY);
    setOrderSyncPolicy(policy);
    return policy;
  }

  async get(): Promise<OrderSyncPolicy> {
    return this.refresh();
  }

  async history(limit = 20): Promise<OrderSyncSettingsHistoryItem[]> {
    const docs = await this.settingsModel
      .find()
      .sort({ version: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .select('version is_active updated_by created_at note')
      .lean();
    return docs.map((d) => ({
      version: d.version,
      isActive: d.is_active,
      updatedBy: d.updated_by?.toString() ?? null,
      createdAt: d.created_at ?? null,
      note: d.note,
    }));
  }

  async update(dto: UpdateOrderSyncSettingsDto, userId: string): Promise<{ settings: OrderSyncPolicy; recomputingKeys: boolean }> {
    const current = await this.refresh();
    if (dto.expected_version !== undefined && dto.expected_version !== current.version) {
      throw this.conflict(current.version);
    }
    return this.saveVersion(current, this.merge(current, dto), dto.note, userId);
  }

  /**
   * Lưu `next` thành phiên bản mới (bản cũ tắt is_active), rồi tính lại khoá gom nền nếu
   * trường gom cơ bản hoặc phần quy tắc ảnh hưởng tới khoá thay đổi. Dùng chung cho
   * PUT /order-sync-settings và các API quy tắc gộp (31/10/2026).
   */
  async saveVersion(
    current: OrderSyncPolicy,
    next: OrderSyncPolicy,
    note: string | null | undefined,
    userId: string,
  ): Promise<{ settings: OrderSyncPolicy; recomputingKeys: boolean }> {
    this.validate(next);

    const latest = await this.settingsModel.findOne().sort({ version: -1 }).select('version').lean();
    const version = (latest?.version ?? 0) + 1;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.settingsModel.create(
          [
            {
              version,
              platforms: SYNC_PLATFORMS.map((p) => ({ platform: p, auto_sync_enabled: next.sync.autoSyncEnabled[p] !== false })),
              interval_minutes: next.sync.intervalMinutes,
              first_sync_lookback_days: next.sync.firstSyncLookbackDays,
              sync_failed_cooldown_minutes: next.sync.syncFailedCooldownMinutes,
              consolidation_enabled: next.consolidation.enabled,
              consolidation_key_fields: next.consolidation.keyFields,
              consolidation_time_window_hours: next.consolidation.timeWindowHours,
              open_group_statuses: next.consolidation.openGroupStatuses,
              consolidation_rules: next.consolidation.rules.map((r) => ({
                rule_id: r.id,
                name: r.name.trim(),
                source_text: r.sourceText,
                fields: r.fields.map((f) => ({ field: f.field, match: f.match })),
                platforms: r.platforms,
                max_window_hours: r.maxWindowHours,
                enabled: r.enabled,
              })),
              consolidatable_statuses: next.statuses.consolidatable,
              not_packable_statuses: next.statuses.notPackable,
              note: note?.trim() ? note.trim() : null,
              updated_by: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null,
              is_active: true,
            },
          ],
          { session },
        );
        await this.settingsModel.updateMany({ version: { $ne: version }, is_active: true }, { $set: { is_active: false } }, { session });
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000) {
        throw this.conflict(current.version);
      }
      throw error;
    } finally {
      await session.endSession();
    }

    const saved = await this.refresh();
    const keysChanged =
      !sameSet(current.consolidation.keyFields, saved.consolidation.keyFields) ||
      ruleKeySignature(current.consolidation.rules) !== ruleKeySignature(saved.consolidation.rules);
    if (keysChanged) {
      void this.recomputeConsolidationKeys(saved.consolidation.keyFields, saved.consolidation.rules)
        .then((n) => { this.logger.log(`Đã tính lại khoá gom cho ${String(n)} đơn chưa xử lý xong (trường gom: ${saved.consolidation.keyFields.join(', ')}; ${String(saved.consolidation.rules.filter((r) => r.enabled).length)} quy tắc bổ sung).`); })
        .catch((error: unknown) => { this.logger.error('Tính lại khoá gom thất bại', error); });
    }
    return { settings: saved, recomputingKeys: keysChanged };
  }

  /**
   * Tính lại `consolidation_key` + `consolidation_keys` (quy tắc bổ sung, 31/10/2026) của đơn
   * CHƯA xử lý xong. Chỉ ảnh hưởng việc gom đơn MỚI về sau; nhóm đã tạo giữ nguyên.
   */
  async recomputeConsolidationKeys(keyFields: ConsolidationKeyField[], rules: readonly ConsolidationRule[] = []): Promise<number> {
    let lastId: Types.ObjectId | null = null;
    let updated = 0;
    for (;;) {
      const orders: RecomputeRow[] = await this.orderModel
        .find({ status: { $in: UNFULFILLED_ORDER_STATUSES }, ...(lastId ? { _id: { $gt: lastId } } : {}) })
        .sort({ _id: 1 })
        .limit(RECOMPUTE_BATCH)
        .select('platform shop_id platform_order_id recipient consolidation_key consolidation_keys delivery_option')
        .lean<RecomputeRow[]>();
      if (orders.length === 0) break;
      lastId = orders[orders.length - 1]?._id ?? null;
      const ops: AnyBulkWriteOperation<OrderDocument>[] = [];
      for (const o of orders) {
        const ref = `${o.shop_id}:${o.platform_order_id}`;
        // 29/10/2026 — đơn hỏa tốc giữ khoá riêng (không gộp) dù Admin đổi trường gom.
        const key = o.delivery_option === 'express'
          ? expressConsolidationKey(o.platform, ref)
          : computeConsolidationKeyFor(o.platform, o.recipient, keyFields, ref);
        const ruleKeys = computeRuleKeys(o, rules);
        const oldRuleKeys = o.consolidation_keys ?? [];
        const ruleKeysChanged = ruleKeys.length !== oldRuleKeys.length || ruleKeys.some((k, i) => k !== oldRuleKeys[i]);
        if (key !== o.consolidation_key || ruleKeysChanged) {
          ops.push({ updateOne: { filter: { _id: o._id }, update: { $set: { consolidation_key: key, consolidation_keys: ruleKeys } } } });
        }
      }
      if (ops.length > 0) {
        await this.orderModel.bulkWrite(ops);
        updated += ops.length;
      }
    }
    return updated;
  }

  // ------------------------------------------------------------------

  private merge(current: OrderSyncPolicy, dto: UpdateOrderSyncSettingsDto): OrderSyncPolicy {
    const next = this.clonePolicy(current);
    for (const t of dto.platforms ?? []) next.sync.autoSyncEnabled[t.platform] = t.auto_sync_enabled;
    if (dto.interval_minutes !== undefined) next.sync.intervalMinutes = dto.interval_minutes;
    if (dto.first_sync_lookback_days !== undefined) next.sync.firstSyncLookbackDays = dto.first_sync_lookback_days;
    if (dto.sync_failed_cooldown_minutes !== undefined) next.sync.syncFailedCooldownMinutes = dto.sync_failed_cooldown_minutes;
    if (dto.consolidation_enabled !== undefined) next.consolidation.enabled = dto.consolidation_enabled;
    if (dto.consolidation_key_fields !== undefined) next.consolidation.keyFields = [...dto.consolidation_key_fields];
    if (dto.consolidation_time_window_hours !== undefined) next.consolidation.timeWindowHours = dto.consolidation_time_window_hours;
    if (dto.open_group_statuses !== undefined) next.consolidation.openGroupStatuses = [...dto.open_group_statuses];
    if (dto.consolidatable_statuses !== undefined) next.statuses.consolidatable = [...dto.consolidatable_statuses];
    if (dto.not_packable_statuses !== undefined) next.statuses.notPackable = [...dto.not_packable_statuses];
    return next;
  }

  /** Ràng buộc nghiệp vụ mà DTO không diễn tả được. */
  private validate(p: OrderSyncPolicy): void {
    const fail = (message: string, details: Record<string, unknown>): never => {
      throw new AppException(ORD_ERROR_CODES.SYNC_SETTINGS_INVALID, message, HttpStatus.BAD_REQUEST, details);
    };
    const keys = p.consolidation.keyFields;
    if (!keys.includes('phone') && !keys.includes('address_line1')) {
      fail('Trường gom đơn phải có ít nhất Số điện thoại hoặc Địa chỉ — chỉ dùng tên/thành phố sẽ gom nhầm người khác.', { consolidation_key_fields: keys });
    }
    const ruleErrors = validateConsolidationRules(p.consolidation.rules);
    if (ruleErrors.length > 0) {
      fail('Quy tắc gộp đơn không hợp lệ.', { rule_errors: ruleErrors });
    }
    const outside = p.statuses.consolidatable.filter((s) => !UNFULFILLED_ORDER_STATUSES.includes(s));
    if (outside.length > 0) {
      fail('Chỉ được gom đơn đang chờ xử lý (unpaid, pending, packed, ready_to_ship, topack, toship).', { invalid: outside });
    }
    if (!p.statuses.notPackable.includes(OrderStatus.CANCELED)) {
      fail('Danh sách trạng thái không đóng gói phải luôn có "canceled".', { not_packable_statuses: p.statuses.notPackable });
    }
    const normal = p.statuses.notPackable.filter((s) => NORMAL_FLOW_ORDER_STATUSES.includes(s));
    if (normal.length > 0) {
      fail('Không được coi trạng thái của luồng giao bình thường là "không đóng gói được".', { invalid: normal });
    }
  }

  private toPolicy(doc: OrderSyncSettings): OrderSyncPolicy {
    const autoSyncEnabled: Record<string, boolean> = { ...DEFAULT_ORDER_SYNC_POLICY.sync.autoSyncEnabled };
    for (const t of doc.platforms) autoSyncEnabled[t.platform] = t.auto_sync_enabled;
    return {
      version: doc.version,
      sync: {
        autoSyncEnabled,
        intervalMinutes: doc.interval_minutes,
        firstSyncLookbackDays: doc.first_sync_lookback_days,
        syncFailedCooldownMinutes: doc.sync_failed_cooldown_minutes,
      },
      consolidation: {
        enabled: doc.consolidation_enabled,
        keyFields: doc.consolidation_key_fields as ConsolidationKeyField[],
        timeWindowHours: doc.consolidation_time_window_hours,
        openGroupStatuses: doc.open_group_statuses as OpenGroupStatus[],
        rules: (doc.consolidation_rules ?? []).map((r) => ({
          id: r.rule_id,
          name: r.name,
          sourceText: r.source_text ?? null,
          fields: r.fields.map((f) => ({ field: f.field as ConsolidationRuleField, match: f.match as ConsolidationRuleMatch })),
          platforms: [...r.platforms],
          maxWindowHours: r.max_window_hours ?? null,
          enabled: r.enabled,
        })),
      },
      statuses: {
        consolidatable: [...doc.consolidatable_statuses],
        notPackable: [...doc.not_packable_statuses],
      },
      updatedBy: doc.updated_by?.toString() ?? null,
      updatedAt: doc.created_at ?? null,
    };
  }

  private clonePolicy(p: OrderSyncPolicy): OrderSyncPolicy {
    return {
      version: p.version,
      sync: { ...p.sync, autoSyncEnabled: { ...p.sync.autoSyncEnabled } },
      consolidation: {
        ...p.consolidation,
        keyFields: [...p.consolidation.keyFields],
        openGroupStatuses: [...p.consolidation.openGroupStatuses],
        rules: p.consolidation.rules.map((r) => ({ ...r, fields: r.fields.map((f) => ({ ...f })), platforms: [...r.platforms] })),
      },
      statuses: { consolidatable: [...p.statuses.consolidatable], notPackable: [...p.statuses.notPackable] },
      updatedBy: p.updatedBy,
      updatedAt: p.updatedAt,
    };
  }

  private conflict(version: number | null): AppException {
    return new AppException(
      ORD_ERROR_CODES.SYNC_SETTINGS_CONFLICT,
      'Tiêu chí đồng bộ vừa được người khác lưu — tải lại rồi lưu lại.',
      HttpStatus.CONFLICT,
      { version },
    );
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
