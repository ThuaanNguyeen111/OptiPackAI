import type { ClientSession, Model, Types } from 'mongoose';
import { ShipmentStatus } from '../shipments/enums/shipment-status.enum';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import type { MarketplaceStatusOutboxDocument } from './schemas/status-outbox.schema';

/**
 * Từ vựng trạng thái của API AURELLE (`POST /order/status/update`,
 * AURELLE_MARKETPLACE_DESIGN.md mục 7.8 + 9.4).
 */
export type AurelleWritebackStatus =
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'failed_delivery'
  | 'shipped_back'
  | 'returned';

/** Nhóm đơn đổi trạng thái → trạng thái gửi sàn (chỉ mức nhóm cần gửi: đóng gói xong). */
export function writebackStatusForGroup(status: GroupFulfillmentStatus): AurelleWritebackStatus | null {
  return status === GroupFulfillmentStatus.PACKED ? 'packed' : null;
}

/**
 * Vận đơn đổi trạng thái → trạng thái gửi sàn. Ba trạng thái "đã giao cho
 * đơn vị vận chuyển / đang đi" gộp thành `shipped` (khách không cần phân biệt
 * chờ lấy / trung chuyển / đang giao). `cancelled` (huỷ ở hãng trước khi lấy)
 * không gửi gì — nhóm đơn quay về `packed` và tự có dòng `packed` mới.
 */
export function writebackStatusForShipment(status: ShipmentStatus): AurelleWritebackStatus | null {
  switch (status) {
    case ShipmentStatus.AWAITING_PICKUP:
    case ShipmentStatus.IN_TRANSIT:
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 'shipped';
    case ShipmentStatus.DELIVERY_FAILED:
      return 'failed_delivery';
    case ShipmentStatus.RETURNING_TO_WAREHOUSE:
      return 'shipped_back';
    case ShipmentStatus.RETURNED_TO_WAREHOUSE:
      return 'returned';
    case ShipmentStatus.DELIVERED:
      return 'delivered';
    default:
      return null;
  }
}

export interface EnqueueStatusPushInput {
  orderGroupId: Types.ObjectId | string;
  shipmentId?: Types.ObjectId | string | null;
  status: AurelleWritebackStatus;
  reason?: string | null;
  eventTime?: Date;
  /** Phần phân biệt các lần khác nhau của cùng 1 trạng thái (VD số lần giao, phiên bản nhóm đơn). */
  discriminator: string | number;
}

/**
 * Ghi 1 dòng vào hàng đợi ghi ngược — gọi TRONG transaction của thao tác gốc.
 * Gọi lặp cùng khóa là vô hại (unique `idempotency_key`, lỗi E11000 bị bỏ qua).
 * `model` có thể undefined (unit test cũ dựng service không có model) → bỏ qua.
 */
export async function enqueueStatusPush(
  model: Model<MarketplaceStatusOutboxDocument> | undefined,
  input: EnqueueStatusPushInput,
  session?: ClientSession,
): Promise<void> {
  if (!model) return;
  const groupId = String(input.orderGroupId);
  const scope = input.shipmentId ? `ship:${String(input.shipmentId)}` : `grp:${groupId}`;
  const key = `${scope}:${input.status}:${String(input.discriminator)}`;
  // Upsert thay vì create + bắt E11000: lỗi trùng khóa BÊN TRONG transaction làm
  // hỏng cả transaction, còn upsert với $setOnInsert thì gọi lặp vẫn êm.
  await model.updateOne(
    { idempotency_key: key },
    {
      $setOnInsert: {
        order_group_id: input.orderGroupId,
        shipment_id: input.shipmentId ?? null,
        status: input.status,
        reason: input.reason ?? null,
        event_time: input.eventTime ?? new Date(),
        idempotency_key: key,
        state: 'pending',
        attempts: 0,
        next_attempt_at: new Date(),
        last_error: null,
        sent_at: null,
      },
    },
    { upsert: true, session },
  );
}
