import type { ClientSession, Model, Types } from 'mongoose';
import { Logger } from '@nestjs/common';
import type { ActivityCategory, ActivityLogDocument } from './schemas/activity-log.schema';

export interface ActivityEntry {
  category: ActivityCategory;
  action: string;
  summary: string;
  actorId?: string | null;
  orderGroupId?: Types.ObjectId | string | null;
  entityType: string;
  entityId?: Types.ObjectId | string | null;
  entityCode?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  skus?: string[];
  quantity?: number | null;
  note?: string | null;
  occurredAt?: Date;
}

const logger = new Logger('ActivityLog');

/**
 * 23/10/2026 — Ghi 1 dòng sổ hoạt động. Có `session` → ghi trong transaction của thao tác
 * gốc (lỗi ném ra để transaction tự hủy, không có dòng "ma"). Không có session → ghi riêng,
 * lỗi chỉ log (lịch sử không bao giờ làm hỏng nghiệp vụ). `model` undefined (test cũ) → bỏ qua.
 */
export async function recordActivity(
  model: Model<ActivityLogDocument> | undefined,
  entry: ActivityEntry,
  session?: ClientSession,
): Promise<void> {
  if (!model) return;
  const doc = {
    occurred_at: entry.occurredAt ?? new Date(),
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    actor_id: entry.actorId ?? null,
    order_group_id: entry.orderGroupId ?? null,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    entity_code: entry.entityCode ?? null,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    skus: entry.skus ?? [],
    quantity: entry.quantity ?? null,
    note: entry.note ?? null,
  };
  if (session) {
    await model.create([doc], { session });
    return;
  }
  try {
    await model.create(doc);
  } catch (error: unknown) {
    logger.warn(`Không ghi được sổ hoạt động ${entry.action}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Nhãn tiếng Việt của trạng thái nhóm đơn (dùng trong câu mô tả). */
export const GROUP_STATUS_LABELS: Record<string, string> = {
  awaiting_packaging: 'Chờ xử lý',
  pending_approval: 'Chờ duyệt',
  approved_for_packing: 'Đã duyệt đóng gói',
  picking: 'Đang lấy hàng',
  picked: 'Đã lấy xong',
  partial_needs_review: 'Thiếu hàng — chờ quyết định',
  packed: 'Đã đóng gói',
  shipped: 'Đã giao cho vận chuyển',
  delivered: 'Đã giao khách',
  returning: 'Đang trả hàng',
  returned: 'Đã hoàn/trả',
  canceled: 'Đã hủy',
};

/** Nhãn tiếng Việt của trạng thái phiếu trả hàng. */
export const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: 'Chờ duyệt',
  rejected: 'Đã từ chối',
  awaiting_receipt: 'Chờ hàng về kho',
  received: 'Kho đã nhận',
  closed: 'Đã hoàn tất',
  canceled: 'Đã hủy',
};
