import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * 08/11/2026 — Cảnh báo tồn vật liệu đóng gói (thùng, túi zip, túi niêm phong, vật tư chèn).
 *
 * 3 mức, xét trên tồn dùng được:
 * - `near`  : còn ≤ mức báo sớm = ngưỡng + 20% (làm tròn lên, ít nhất ngưỡng + 1). VD ngưỡng 10 → báo khi còn ≤ 12.
 * - `below` : còn ≤ ngưỡng (`reorder_level`).
 * - `out`   : hết (0).
 * Chỉ báo khi mức XẤU ĐI so với trước thao tác (không báo lặp mỗi lần trừ 1 cái khi đã ở cùng mức).
 *
 * Người nhận: Admin + Store Owner + Warehouse Staff. Gửi sau khi giao dịch đã lưu; lỗi gửi chỉ ghi log.
 */
export type StockAlertLevel = 'near' | 'below' | 'out';

export type StockAlertKind = 'box' | 'material';

const RANK: Record<StockAlertLevel, number> = { near: 1, below: 2, out: 3 };

export const STOCK_ALERT_RECIPIENTS: readonly UserRole[] = [UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF];

/** Mức báo sớm: ngưỡng + 20%, làm tròn lên, luôn lớn hơn ngưỡng. Ngưỡng 0 → không báo sớm. */
export function earlyWarningLevel(reorderLevel: number): number {
  if (reorderLevel <= 0) return 0;
  return Math.max(reorderLevel + 1, Math.ceil(reorderLevel * 1.2));
}

export function stockAlertLevel(stock: number, reorderLevel: number): StockAlertLevel | null {
  if (stock <= 0) return 'out';
  if (stock <= reorderLevel) return 'below';
  if (stock <= earlyWarningLevel(reorderLevel)) return 'near';
  return null;
}

/** Mức cần báo khi trạng thái chuyển từ `previous` sang `next`; null = không xấu đi. */
export function worsenedLevel(previous: StockAlertLevel | null, next: StockAlertLevel | null): StockAlertLevel | null {
  if (next === null) return null;
  if (previous !== null && RANK[previous] >= RANK[next]) return null;
  return next;
}

export interface StockChange {
  kind: StockAlertKind;
  code: string;
  name: string;
  before: number;
  after: number;
  reorderLevel: number;
  /** Ngưỡng trước thao tác — chỉ khác `reorderLevel` khi vừa sửa ngưỡng. */
  previousReorderLevel?: number;
  /** Nguyên nhân, ghi trong thông báo. VD "sau khi đóng gói", "thùng hỏng lúc đóng", "vừa sửa ngưỡng". */
  trigger: string;
}

@Injectable()
export class PackagingStockAlertService {
  private readonly logger = new Logger(PackagingStockAlertService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /** Báo nếu mức tồn xấu đi. Dùng cho trừ tồn (đóng gói, hao hụt) và sửa ngưỡng. */
  async notifyIfWorse(change: StockChange): Promise<void> {
    const previous = stockAlertLevel(change.before, change.previousReorderLevel ?? change.reorderLevel);
    const next = stockAlertLevel(change.after, change.reorderLevel);
    const level = worsenedLevel(previous, next);
    if (!level) return;
    const what = change.kind === 'box' ? 'thùng' : 'vật tư';
    const label = `${what} ${change.name === change.code ? change.code : `${change.name} (${change.code})`}`;
    const early = earlyWarningLevel(change.reorderLevel);
    const title =
      level === 'out'
        ? `Đã hết ${label}`
        : level === 'below'
          ? `${capitalize(label)} đã xuống ngưỡng cảnh báo`
          : `${capitalize(label)} sắp chạm ngưỡng`;
    const message =
      level === 'out'
        ? `Kho đã hết ${label} (${change.trigger}). Vui lòng nhập thêm.`
        : level === 'below'
          ? `Kho còn ${String(change.after)} ${label}, bằng hoặc dưới ngưỡng ${String(change.reorderLevel)} (${change.trigger}). Vui lòng nhập thêm.`
          : `Kho còn ${String(change.after)} ${label}, gần ngưỡng ${String(change.reorderLevel)} (báo sớm khi còn ≤ ${String(early)}; ${change.trigger}). Nên chuẩn bị nhập thêm.`;
    await this.send(change.kind, change.code, level === 'out' ? 'critical' : 'warning', title, message);
  }

  /** Lúc đóng gói kho không đủ vật tư cho kế hoạch — đơn vẫn được đóng. */
  async notifyShortfall(kind: StockAlertKind, code: string, missing: number): Promise<void> {
    const what = kind === 'box' ? 'thùng' : 'vật tư';
    await this.send(
      kind,
      code,
      'critical',
      `Thiếu ${what} ${code} khi đóng gói`,
      `Kho không đủ ${what} ${code}: thiếu ${String(missing)} so với kế hoạch. Đơn vẫn được đóng — kiểm tra lại kiện và nhập thêm.`,
    );
  }

  private async send(
    kind: StockAlertKind,
    code: string,
    severity: 'warning' | 'critical',
    title: string,
    message: string,
  ): Promise<void> {
    for (const recipientRole of STOCK_ALERT_RECIPIENTS) {
      try {
        await this.notificationsService.notify({
          recipientRole,
          type: kind === 'box' ? NotificationType.LOW_BOX_STOCK : NotificationType.LOW_MATERIAL_STOCK,
          severity,
          title,
          message,
          relatedEntityType: kind === 'box' ? 'packaging_box' : 'packaging_material',
          relatedEntityId: code,
        });
      } catch (error: unknown) {
        this.logger.error(`Gửi cảnh báo tồn ${code} thất bại: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
