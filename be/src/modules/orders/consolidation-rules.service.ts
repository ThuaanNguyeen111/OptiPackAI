import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_ERROR_CODES } from './orders.errors';
import { MAX_CONSOLIDATION_RULES } from './order-sync-policy';
import type { ConsolidationRule, OrderSyncPolicy } from './order-sync-policy';
import { OrderSyncSettingsService } from './order-sync-settings.service';
import { ConsolidationRuleBodyDto, SaveConsolidationRuleDto } from './dto/consolidation-rule.dto';
import { validateConsolidationRule } from './utils/consolidation-rule.util';

export interface ConsolidationRulesState {
  /** Version cấu hình đang hiệu lực — gửi lại làm `expected_version` ở lần ghi sau. */
  version: number | null;
  rules: ConsolidationRule[];
  /** true khi lần ghi này làm thay đổi khoá → đang tính lại nền cho đơn chưa xong. */
  recomputingKeys: boolean;
}

/** DTO (snake_case) → quy tắc trong policy. */
export function ruleFromBody(id: string, body: ConsolidationRuleBodyDto): ConsolidationRule {
  return {
    id,
    name: body.name.trim(),
    sourceText: body.source_text?.trim() ? body.source_text.trim() : null,
    fields: body.fields.map((f) => ({ field: f.field, match: f.match })),
    platforms: [...(body.platforms ?? [])],
    maxWindowHours: body.max_window_hours ?? null,
    enabled: body.enabled ?? true,
  };
}

/** Lỗi 400 nếu quy tắc vi phạm giới hạn an toàn (cùng hàm kiểm của form, AI và lúc lưu). */
export function assertValidRule(rule: ConsolidationRule): void {
  const errors = validateConsolidationRule(rule);
  if (errors.length > 0) {
    throw new AppException(ORD_ERROR_CODES.CONSOLIDATION_RULE_INVALID, errors[0] ?? 'Quy tắc gộp đơn không hợp lệ.', HttpStatus.BAD_REQUEST, { errors });
  }
}

/**
 * ===================================================================
 * Quy tắc gộp đơn bổ sung — thêm / sửa / xoá (31/10/2026)
 * ===================================================================
 * Mỗi lần ghi = 1 phiên bản `order_sync_settings` mới (qua
 * OrderSyncSettingsService.saveVersion), nên có lịch sử ai đổi gì và
 * `expected_version` chặn 2 người lưu đè nhau. Ghi xong, nếu phần ảnh hưởng
 * tới khoá đổi thì đơn chưa xong được tính lại `consolidation_keys` chạy nền.
 * ===================================================================
 */
@Injectable()
export class ConsolidationRulesService {
  constructor(private readonly settingsService: OrderSyncSettingsService) {}

  async list(): Promise<ConsolidationRulesState> {
    const current = await this.settingsService.get();
    return { version: current.version, rules: current.consolidation.rules, recomputingKeys: false };
  }

  async create(dto: SaveConsolidationRuleDto, userId: string): Promise<ConsolidationRulesState> {
    const current = await this.loadExpecting(dto.expected_version);
    if (current.consolidation.rules.length >= MAX_CONSOLIDATION_RULES) {
      throw new AppException(
        ORD_ERROR_CODES.CONSOLIDATION_RULE_LIMIT,
        `Đã đủ ${String(MAX_CONSOLIDATION_RULES)} quy tắc — xoá bớt hoặc gộp quy tắc trước khi thêm.`,
        HttpStatus.BAD_REQUEST,
        { max_rules: MAX_CONSOLIDATION_RULES },
      );
    }
    const rule = ruleFromBody(new Types.ObjectId().toHexString(), dto);
    assertValidRule(rule);
    const next = this.settingsService.clonePolicy(current);
    next.consolidation.rules.push(rule);
    return this.save(current, next, `Thêm quy tắc gộp "${rule.name}"`, userId);
  }

  async update(ruleId: string, dto: SaveConsolidationRuleDto, userId: string): Promise<ConsolidationRulesState> {
    const current = await this.loadExpecting(dto.expected_version);
    const index = this.indexOf(current, ruleId);
    const rule = ruleFromBody(ruleId, dto);
    assertValidRule(rule);
    const next = this.settingsService.clonePolicy(current);
    next.consolidation.rules[index] = rule;
    return this.save(current, next, `Sửa quy tắc gộp "${rule.name}"`, userId);
  }

  async remove(ruleId: string, expectedVersion: number, userId: string): Promise<ConsolidationRulesState> {
    const current = await this.loadExpecting(expectedVersion);
    const index = this.indexOf(current, ruleId);
    const next = this.settingsService.clonePolicy(current);
    const [removed] = next.consolidation.rules.splice(index, 1);
    return this.save(current, next, `Xoá quy tắc gộp "${removed?.name ?? ruleId}"`, userId);
  }

  // ------------------------------------------------------------------

  private async loadExpecting(expectedVersion: number | null): Promise<OrderSyncPolicy> {
    const current = await this.settingsService.get();
    if (expectedVersion !== current.version) throw this.settingsService.conflict(current.version);
    return current;
  }

  private indexOf(policy: OrderSyncPolicy, ruleId: string): number {
    const index = policy.consolidation.rules.findIndex((r) => r.id === ruleId);
    if (index < 0) {
      throw new AppException(ORD_ERROR_CODES.CONSOLIDATION_RULE_NOT_FOUND, 'Không tìm thấy quy tắc gộp đơn chỉ định.', HttpStatus.NOT_FOUND, { rule_id: ruleId });
    }
    return index;
  }

  private async save(current: OrderSyncPolicy, next: OrderSyncPolicy, note: string, userId: string): Promise<ConsolidationRulesState> {
    const { settings, recomputingKeys } = await this.settingsService.saveVersion(current, next, note, userId);
    return { version: settings.version, rules: settings.consolidation.rules, recomputingKeys };
  }
}
