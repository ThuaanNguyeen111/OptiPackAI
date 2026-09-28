import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { Shipment, ShipmentDocument } from './schemas/shipment.schema';
import { ShipmentEvent, ShipmentEventDocument } from './schemas/shipment-event.schema';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { ShipmentEventType } from './enums/shipment-event-type.enum';
import { DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import { MAX_DELIVERY_ATTEMPTS, isValidShipmentTransition } from './shipment-transitions';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { ReturnsService } from './returns.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { addBusinessHours } from '../order-groups/utils/add-business-hours.util';
import { deliveryDueBusinessHours, minRetryGapMinutes } from './shipment-config';

export interface ShipmentActor {
  userId: string;
  role: number | null;
}

const SYSTEM_ACTOR: ShipmentActor = { userId: 'system', role: null };

interface TransitionStep {
  to: ShipmentStatus;
  eventType: ShipmentEventType;
  actor: ShipmentActor;
  reasonCode?: string | null;
  note?: string | null;
}

/**
 * ===================================================================
 * G1 (27/09/2026) — GIAO HÀNG BẢN GỌN: bấm nút đổi trạng thái + lịch sử.
 * ===================================================================
 * Nguyên tắc:
 * - Mọi thay đổi đi qua applyTransition(): kiểm luật -> cập nhật vận đơn có
 *   khóa version -> ghi lịch sử -> đổi trạng thái nhóm đơn (nếu cần), TẤT CẢ
 *   trong 1 transaction. Vận đơn và nhóm đơn không bao giờ lệch nhau.
 * - Lịch sử (shipment_events) chỉ THÊM, không sửa/xóa.
 * - Tối thiểu 2 lần giao rồi hệ thống TỰ chuyển hoàn về (không có nút hoàn
 *   sớm); riêng "khách từ chối nhận" hoàn về ngay.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<ShipmentDocument>,
    @InjectModel(ShipmentEvent.name) private readonly eventModel: Model<ShipmentEventDocument>,
    private readonly orderGroupsService: OrderGroupsService,
    @InjectConnection() private readonly connection: Connection,
    // G3 — kho nhận lại kiện giao thất bại -> tự tạo phiếu hoàn trong CÙNG transaction
    private readonly returnsService: ReturnsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ đọc

  async getShipment(id: string): Promise<ShipmentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(SHIPMENT_ERROR_CODES.INVALID_ID, `"${id}" không đúng định dạng ObjectId.`, HttpStatus.BAD_REQUEST, { id });
    }
    const shipment = await this.shipmentModel.findById(id);
    if (!shipment) {
      throw new AppException(SHIPMENT_ERROR_CODES.NOT_FOUND, `Không tìm thấy vận đơn "${id}".`, HttpStatus.NOT_FOUND, { id });
    }
    return shipment;
  }

  async listShipments(params: {
    status?: ShipmentStatus;
    orderGroupId?: string;
    overdueOnly?: boolean; // lọc vận đơn đã bị cron gắn cờ quá hạn giao
    page: number;
    limit: number;
  }): Promise<{ items: ShipmentDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.overdueOnly) filter.is_overdue = true;
    if (params.orderGroupId && Types.ObjectId.isValid(params.orderGroupId)) {
      filter.order_group_id = new Types.ObjectId(params.orderGroupId);
    }
    const [items, total] = await Promise.all([
      this.shipmentModel.find(filter).sort({ updated_at: -1 }).skip((params.page - 1) * params.limit).limit(params.limit),
      this.shipmentModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async listEvents(shipmentId: string): Promise<ShipmentEventDocument[]> {
    const shipment = await this.getShipment(shipmentId);
    return this.eventModel.find({ shipment_id: shipment._id }).sort({ occurred_at: 1, _id: 1 });
  }

  // ------------------------------------------------------------ nút bấm

  /** [Coordinator] Bắt đầu giao — tạo vận đơn cho nhóm đơn đã đóng gói. */
  async startDelivery(orderGroupId: string, actor: ShipmentActor, note?: string, groupExpectedVersion?: number): Promise<ShipmentDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(orderGroupId);
    await this.assertNoShipment(group);

    const isLegacyShipped = group.fulfillment_status === GroupFulfillmentStatus.SHIPPED;
    if (group.fulfillment_status !== GroupFulfillmentStatus.PACKED && !isLegacyShipped) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.GROUP_NOT_READY,
        `Nhóm đơn đang ở trạng thái "${group.fulfillment_status}" — chỉ bắt đầu giao được khi đã đóng gói xong (packed).`,
        HttpStatus.CONFLICT,
        { orderGroupId, status: group.fulfillment_status },
      );
    }

    return this.runInTransaction(async (session) => {
      const shipment = await this.createShipmentDoc(group, actor, session);
      await this.writeEvent(shipment, null, {
        to: ShipmentStatus.OUT_FOR_DELIVERY,
        // Nhóm đơn "shipped" từ trước G1 (chưa có vận đơn) -> tạo bù, KHÔNG đổi trạng thái nhóm đơn.
        eventType: isLegacyShipped ? ShipmentEventType.LEGACY_BACKFILL : ShipmentEventType.START_DELIVERY,
        actor,
        note: note ?? (isLegacyShipped ? 'Tạo bù vận đơn cho nhóm đơn đã chuyển "shipped" trước khi có G1' : null),
      }, session);
      if (!isLegacyShipped) {
        await this.orderGroupsService.transitionFulfillmentStatus(
          orderGroupId,
          GroupFulfillmentStatus.SHIPPED,
          groupExpectedVersion ?? group.__v,
          session,
        );
      }
      return shipment;
    });
  }

  /** [Coordinator] Giao thành công. */
  async markDelivered(shipmentId: string, expectedVersion: number, actor: ShipmentActor, note?: string, groupExpectedVersion?: number): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    return this.applyTransition(shipment, expectedVersion, [
      { to: ShipmentStatus.DELIVERED, eventType: ShipmentEventType.DELIVERED, actor, note },
    ], { delivered_at: new Date() }, { target: GroupFulfillmentStatus.DELIVERED, expectedVersion: groupExpectedVersion });
  }

  /**
   * [Coordinator] Giao thất bại. Hệ thống tự quyết bước tiếp theo:
   * - khách từ chối nhận, hoặc đã hết số lần giao -> TỰ chuyển hoàn về kho;
   * - ngược lại -> chờ giao lại.
   */
  async markFailed(shipmentId: string, expectedVersion: number, reason: DeliveryFailureReason, actor: ShipmentActor, note?: string, rescheduleAt?: string): Promise<ShipmentDocument> {
    if (reason === DeliveryFailureReason.OTHER && !note?.trim()) {
      throw new AppException(SHIPMENT_ERROR_CODES.NOTE_REQUIRED, 'Chọn "Lý do khác" thì bắt buộc ghi chú cụ thể.', HttpStatus.BAD_REQUEST);
    }
    const shipment = await this.getShipment(shipmentId);
    const autoReturn = reason === DeliveryFailureReason.CUSTOMER_REFUSED || shipment.attempt_count >= shipment.max_attempts;

    const steps: TransitionStep[] = [
      { to: ShipmentStatus.DELIVERY_FAILED, eventType: ShipmentEventType.DELIVERY_FAILED, actor, reasonCode: reason, note },
    ];
    if (autoReturn) {
      steps.push({
        to: ShipmentStatus.RETURNING_TO_WAREHOUSE,
        eventType: ShipmentEventType.AUTO_RETURN,
        actor: SYSTEM_ACTOR,
        reasonCode: reason,
        note: reason === DeliveryFailureReason.CUSTOMER_REFUSED
          ? 'Khách từ chối nhận — hoàn về kho ngay, không giao lại'
          : `Đã giao ${String(shipment.attempt_count)}/${String(shipment.max_attempts)} lần không thành công — tự động hoàn về kho`,
      });
    }
    // Khoảng cách tối thiểu trước lần giao lại: giờ khách hẹn (nếu có) hoặc bây giờ + N phút.
    let nextAttempt: Date | null = null;
    if (!autoReturn) {
      if (rescheduleAt) {
        nextAttempt = new Date(rescheduleAt);
        if (nextAttempt.getTime() <= Date.now()) {
          throw new AppException(SHIPMENT_ERROR_CODES.INVALID_RESCHEDULE, 'Giờ hẹn giao lại phải ở tương lai.', HttpStatus.BAD_REQUEST, { rescheduleAt });
        }
      } else {
        nextAttempt = new Date(Date.now() + minRetryGapMinutes() * 60_000);
      }
    }
    const updated = await this.applyTransition(shipment, expectedVersion, steps, { last_failure_reason: reason, next_attempt_not_before: nextAttempt });
    await this.notifySafe(autoReturn
      ? { type: NotificationType.DELIVERY_RETURNING, severity: 'critical', title: `Vận đơn ${updated.shipment_code} đang hoàn về kho`, message: steps[steps.length - 1]?.note ?? 'Hoàn về kho' }
      : { type: NotificationType.DELIVERY_FAILED, severity: 'warning', title: `Giao thất bại lần ${String(updated.attempt_count)} — ${updated.shipment_code}`, message: `Lý do: ${reason}${note ? ` — ${note}` : ''}. Giao lại được từ ${nextAttempt?.toISOString() ?? ''}.` },
      updated);
    return updated;
  }

  /** [Coordinator] Giao lại (chỉ khi đang "giao thất bại"). */
  async retryDelivery(shipmentId: string, expectedVersion: number, actor: ShipmentActor, note?: string, overrideReason?: string): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    const notBefore = shipment.next_attempt_not_before ?? null;
    const tooEarly = notBefore !== null && notBefore.getTime() > Date.now();
    if (tooEarly && !overrideReason?.trim()) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.RETRY_TOO_EARLY,
        `Chưa tới giờ được giao lại (từ ${notBefore.toISOString()}). Muốn giao sớm hơn phải nêu lý do (override_reason).`,
        HttpStatus.CONFLICT,
        { shipmentId, nextAttemptNotBefore: notBefore },
      );
    }
    const eventNote = tooEarly ? `Giao lại SỚM hơn quy định — lý do: ${String(overrideReason)}${note ? ` | ${note}` : ''}` : note;
    return this.applyTransition(shipment, expectedVersion, [
      { to: ShipmentStatus.OUT_FOR_DELIVERY, eventType: ShipmentEventType.RETRY, actor, note: eventNote },
    ], { next_attempt_not_before: null }, undefined, true);
  }

  /** Tác vụ định kỳ: gắn cờ + báo các vận đơn quá hạn giao. Trả số vận đơn vừa gắn cờ. */
  async flagOverdueShipments(now = new Date()): Promise<number> {
    const overdue = await this.shipmentModel.find({
      status: { $in: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED] },
      is_overdue: { $ne: true },
      due_at: { $ne: null, $lt: now },
    });
    let flagged = 0;
    for (const s of overdue) {
      const r = await this.shipmentModel.updateOne({ _id: s._id, is_overdue: { $ne: true } }, { $set: { is_overdue: true } });
      if (r.modifiedCount !== 1) continue;
      flagged++;
      await this.notifySafe({
        type: NotificationType.DELIVERY_OVERDUE, severity: 'critical',
        title: `Vận đơn ${s.shipment_code} đã quá hạn giao`,
        message: `Hạn giao ${s.due_at?.toISOString() ?? ''}, hiện đang "${s.status}" (lần giao ${String(s.attempt_count)}).`,
      }, s, [UserRole.STORE_OWNER, UserRole.SHIPPING_COORDINATOR]);
    }
    return flagged;
  }

  /** Gửi thông báo — lỗi thông báo KHÔNG được làm hỏng thao tác chính. */
  private async notifySafe(
    n: { type: NotificationType; severity: 'info' | 'warning' | 'critical'; title: string; message: string },
    shipment: ShipmentDocument,
    roles: UserRole[] = [UserRole.STORE_OWNER],
  ): Promise<void> {
    for (const role of roles) {
      try {
        await this.notificationsService.notify({ ...n, recipientRole: role, relatedEntityType: 'shipment', relatedEntityId: shipment._id.toString() });
      } catch (error) {
        this.logger.warn(`Gửi thông báo ${n.type} thất bại (không ảnh hưởng thao tác chính).`, error);
      }
    }
  }

  /** [Warehouse] Xác nhận đã nhận lại kiện hoàn về kho. */
  async receiveReturn(shipmentId: string, expectedVersion: number, actor: ShipmentActor, note?: string, groupExpectedVersion?: number): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    return this.applyTransition(shipment, expectedVersion, [
      { to: ShipmentStatus.RETURNED_TO_WAREHOUSE, eventType: ShipmentEventType.RETURN_RECEIVED, actor, note },
    ], { returned_at: new Date() }, { target: GroupFulfillmentStatus.RETURNED, expectedVersion: groupExpectedVersion }, false,
    // G3 — kiện về kho -> tự tạo phiếu hoàn (trạng thái "received") để kho kiểm hàng, nhập lại tồn.
    async (session, updated) => {
      await this.returnsService.createFromFailedDelivery(updated.order_group_id.toString(), updated._id.toString(), actor.userId, session);
    });
  }

  // ------------------------------------------ route cũ (giữ tương thích FE)

  async findByGroup(orderGroupId: string): Promise<ShipmentDocument | null> {
    return this.shipmentModel.findOne({ order_group_id: new Types.ObjectId(orderGroupId), direction: 'forward' });
  }

  /** POST /order-groups/:id/fulfillment/deliver (cũ). */
  async legacyDeliver(orderGroupId: string, groupVersion: number, actor: ShipmentActor): Promise<void> {
    const shipment = (await this.findByGroup(orderGroupId)) ?? (await this.startDelivery(orderGroupId, actor));
    await this.markDelivered(shipment._id.toString(), shipment.__v, actor, 'Qua route cũ fulfillment/deliver', groupVersion);
  }

  /**
   * POST /order-groups/:id/fulfillment/return (cũ). Nhóm đơn "shipped": đóng vận
   * đơn về "đã hoàn về kho" (bỏ qua các bước trung gian — route cũ không có).
   * Nhóm đơn "delivered" (khách trả sau khi nhận): giữ hành vi cũ, chỉ ghi lịch sử —
   * luồng trả hàng đầy đủ là G3.
   */
  async legacyReturn(orderGroupId: string, groupVersion: number, actor: ShipmentActor): Promise<void> {
    const group = await this.orderGroupsService.findOrderGroupById(orderGroupId);
    const shipment = (await this.findByGroup(orderGroupId)) ?? (group.fulfillment_status === GroupFulfillmentStatus.SHIPPED ? await this.startDelivery(orderGroupId, actor) : null);

    await this.runInTransaction(async (session) => {
      if (shipment && group.fulfillment_status === GroupFulfillmentStatus.SHIPPED) {
        const updated = await this.shipmentModel.findOneAndUpdate(
          { _id: shipment._id, __v: shipment.__v },
          { $set: { status: ShipmentStatus.RETURNED_TO_WAREHOUSE, returned_at: new Date() }, $inc: { __v: 1 } },
          { returnDocument: 'after', session },
        );
        if (!updated) this.throwConflict(shipment._id.toString(), shipment.__v);
        await this.writeEvent(shipment, shipment.status, {
          to: ShipmentStatus.RETURNED_TO_WAREHOUSE, eventType: ShipmentEventType.LEGACY_RETURN, actor, note: 'Hoàn qua route cũ fulfillment/return',
        }, session);
        // G3 — hàng đã về kho qua route cũ -> cũng phải có phiếu hoàn để kiểm hàng + nhập lại tồn.
        await this.returnsService.createFromFailedDelivery(orderGroupId, shipment._id.toString(), actor.userId, session);
      } else if (shipment) {
        await this.writeEvent(shipment, shipment.status, {
          to: shipment.status, eventType: ShipmentEventType.LEGACY_RETURN, actor, note: 'Khách trả hàng sau khi đã giao (route cũ) — trạng thái vận đơn giữ nguyên',
        }, session);
      }
      await this.orderGroupsService.transitionFulfillmentStatus(orderGroupId, GroupFulfillmentStatus.RETURNED, groupVersion, session);
    });
  }

  // ------------------------------------------------------------ nội bộ

  private async assertNoShipment(group: OrderGroupDocument): Promise<void> {
    const existing = await this.shipmentModel.exists({ order_group_id: group._id, direction: 'forward' });
    if (existing) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.ALREADY_EXISTS,
        'Nhóm đơn này đã có vận đơn — dùng các nút trên vận đơn đó.',
        HttpStatus.CONFLICT,
        { orderGroupId: group._id.toString(), shipmentId: existing._id.toString() },
      );
    }
  }

  private async createShipmentDoc(group: OrderGroupDocument, actor: ShipmentActor, session: ClientSession): Promise<ShipmentDocument> {
    const id = new Types.ObjectId();
    const d = new Date();
    const ymd = `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    try {
      const [doc] = await this.shipmentModel.create([{
        _id: id,
        shipment_code: `SHP-${ymd}-${id.toString().slice(-6).toUpperCase()}`,
        order_group_id: group._id,
        direction: 'forward',
        status: ShipmentStatus.OUT_FOR_DELIVERY,
        attempt_count: 1,
        max_attempts: MAX_DELIVERY_ATTEMPTS,
        due_at: addBusinessHours(d, deliveryDueBusinessHours()),
        created_by: actor.userId,
      }], { session });
      if (!doc) throw new Error('Tạo vận đơn không trả về document');
      return doc;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new AppException(SHIPMENT_ERROR_CODES.ALREADY_EXISTS, 'Nhóm đơn này vừa được người khác tạo vận đơn.', HttpStatus.CONFLICT, { orderGroupId: group._id.toString() });
      }
      throw error;
    }
  }

  private async applyTransition(
    shipment: ShipmentDocument,
    expectedVersion: number,
    steps: TransitionStep[],
    extraSet: Record<string, unknown>,
    group?: { target: GroupFulfillmentStatus; expectedVersion?: number },
    incAttempt = false,
    afterUpdate?: (session: ClientSession, updated: ShipmentDocument) => Promise<void>,
  ): Promise<ShipmentDocument> {
    let from = shipment.status;
    for (const step of steps) {
      if (!isValidShipmentTransition(from, step.to)) {
        throw new AppException(
          SHIPMENT_ERROR_CODES.INVALID_TRANSITION,
          `Không thể chuyển vận đơn từ "${from}" sang "${step.to}".`,
          HttpStatus.CONFLICT,
          { shipmentId: shipment._id.toString(), from, to: step.to },
        );
      }
      from = step.to;
    }
    if (incAttempt && shipment.attempt_count >= shipment.max_attempts) {
      throw new AppException(SHIPMENT_ERROR_CODES.INVALID_TRANSITION, 'Đã hết số lần giao cho phép.', HttpStatus.CONFLICT, { shipmentId: shipment._id.toString() });
    }
    const finalStatus = from;

    return this.runInTransaction(async (session) => {
      const updated = await this.shipmentModel.findOneAndUpdate(
        { _id: shipment._id, __v: expectedVersion },
        { $set: { status: finalStatus, ...extraSet }, $inc: { __v: 1, ...(incAttempt ? { attempt_count: 1 } : {}) } },
        { returnDocument: 'after', session },
      );
      if (!updated) this.throwConflict(shipment._id.toString(), expectedVersion);

      let prev: ShipmentStatus = shipment.status;
      for (const step of steps) {
        await this.writeEvent(updated, prev, step, session);
        prev = step.to;
      }
      if (group) {
        const g = await this.orderGroupsService.findOrderGroupById(shipment.order_group_id.toString());
        await this.orderGroupsService.transitionFulfillmentStatus(g._id.toString(), group.target, group.expectedVersion ?? g.__v, session);
      }
      if (afterUpdate) await afterUpdate(session, updated);
      this.logger.log(`Vận đơn ${updated.shipment_code}: ${shipment.status} -> ${finalStatus}`);
      return updated;
    });
  }

  private async writeEvent(shipment: ShipmentDocument, from: ShipmentStatus | null, step: TransitionStep, session: ClientSession): Promise<void> {
    await this.eventModel.create([{
      shipment_id: shipment._id,
      order_group_id: shipment.order_group_id,
      event_type: step.eventType,
      status_from: from,
      status_to: step.to,
      attempt_no: shipment.attempt_count,
      actor_id: step.actor.userId,
      actor_role: step.actor.role,
      reason_code: step.reasonCode ?? null,
      note: step.note ?? null,
      occurred_at: new Date(),
    }], { session });
  }

  private throwConflict(shipmentId: string, expectedVersion: number): never {
    throw new AppException(
      SHIPMENT_ERROR_CODES.STATE_CONFLICT,
      'Vận đơn vừa được người khác thay đổi — tải lại rồi thử lại.',
      HttpStatus.CONFLICT,
      { shipmentId, expectedVersion },
    );
  }

  private async runInTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
