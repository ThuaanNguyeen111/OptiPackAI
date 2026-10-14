import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { randomBytes } from 'crypto';
import { ShippingService } from '../shipping/shipping.service';
import type { ServiceQuote } from '../shipping/utils/shipping-cost.util';
import { LiveCarrierService, type ToLocationInput } from '../shipping/live-carrier.service';
import { CarrierWebhookEvent, CarrierWebhookEventDocument } from './schemas/carrier-webhook-event.schema';
import type { CarrierParcel } from './schemas/shipment.schema';
import {
  GHN_INCIDENT_STATUSES,
  GHN_STATUS_LABELS,
  SIMULATABLE_GHN_STATUSES,
  aggregateCarrierStatus,
  canCarrierMove,
  mapGhnFailureReason,
} from './carrier-status.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hãng/dịch vụ chọn khi tạo vận đơn (gộp thi_dev 04/10/2026). */
export interface CarrierChoice {
  carrierCode: string;
  serviceCode: string;
  pickupAt?: Date;
  /** C4 (14/10/2026) — địa chỉ gửi hãng API do Coordinator sửa/bổ sung (đơn bị che). */
  toLocation?: ToLocationInput | null;
}

/**
 * C5 (14/10/2026) — 1 sự kiện trạng thái của hãng theo khuôn Order Status Callback của
 * GHN (khoá PascalCase). Webhook thật, nút mô phỏng và đồng bộ đều dựng đúng khuôn này
 * rồi đi qua CÙNG hàm `processCarrierEvent`.
 */
export interface CarrierEventPayload {
  ShopID?: number | string;
  OrderCode?: string;
  ClientOrderCode?: string;
  Type?: string;
  Status?: string;
  Time?: string;
  Reason?: string;
  ReasonCode?: string;
  [key: string]: unknown;
}

export type CarrierEventSource = 'carrier_webhook' | 'carrier_sync' | 'carrier_simulated' | 'manual';

export interface ShipmentBatchResult {
  tripCode: string;
  carrierCode: string;
  serviceCode: string;
  totalCostVnd: number;
  shipments: {
    id: string;
    orderGroupId: string;
    trackingCode: string;
    parcelCount: number;
    estimatedCostVnd: number;
    etaFrom: Date;
    etaTo: Date;
    /** C4 — mã vận đơn ở hãng API của từng kiện (rỗng với hãng bảng cước). */
    carrierOrderCodes?: string[];
    /** C4 — lỗi tạo vận đơn ở hãng (null = ổn). Sửa địa chỉ rồi POST /shipments/:id/carrier/book. */
    bookingError?: string | null;
    status?: ShipmentStatus;
  }[];
}

/** Trường thêm khi tạo vận đơn có chọn hãng / thuộc 1 chuyến. */
type ShipmentExtras = Partial<
  Pick<
    Shipment,
    | 'trip_code'
    | 'note'
    | 'carrier_code'
    | 'carrier_name'
    | 'service_code'
    | 'service_name'
    | 'parcel_count'
    | 'chargeable_weight_g'
    | 'estimated_cost_vnd'
    | 'is_sample_rate'
    | 'eta_from'
    | 'eta_to'
    | 'pickup_at'
    | 'carrier_kind'
    | 'carrier_adapter'
    | 'to_location'
    | 'due_at'
  >
>;

/** C4 — kiện cần tạo vận đơn ở hãng (lấy từ báo giá theo kiện). */
interface PlannedCarrierParcel {
  parcel_no: number;
  order_id: string;
}

/** client_order_code gửi hãng: lần đặt 1 = SHP-...-<kiện>; đặt lại sau khi huỷ = SHP-...-R2-<kiện>. */
export function carrierClientCode(shipmentCode: string, round: number, parcelNo: number): string {
  return round <= 1 ? `${shipmentCode}-${String(parcelNo)}` : `${shipmentCode}-R${String(round)}-${String(parcelNo)}`;
}

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
    private readonly shippingService: ShippingService, // gộp thi_dev — báo giá + ghi cước
    // C4/C5 (14/10/2026) — hãng API (GHN). Optional: test cũ dựng service bằng tay không đổi.
    @Optional() private readonly liveCarrier?: LiveCarrierService,
    @Optional() @InjectModel(CarrierWebhookEvent.name) private readonly webhookEventModel?: Model<CarrierWebhookEventDocument>,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /** (05/10/2026) Nhóm còn kiện của đơn đã hủy chưa tháo → chưa được giao. */
  private async assertNothingToUnpack(orderGroupId: string): Promise<void> {
    const count = await this.shippingService.countParcelsToUnpack(orderGroupId);
    if (count > 0) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.PARCELS_TO_UNPACK,
        `Nhóm đơn còn ${String(count)} kiện của đơn đã hủy chưa tháo — tháo kiện (POST .../packing-plan/parcels/:no/unpack) trước khi giao.`,
        HttpStatus.CONFLICT,
        { orderGroupId, parcelsToUnpack: count },
      );
    }
  }

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
    tripCode?: string; // gộp thi_dev — vận đơn cùng chuyến
    carrierCode?: string;
    page: number;
    limit: number;
  }): Promise<{ items: ShipmentDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.overdueOnly) filter.is_overdue = true;
    if (params.tripCode) filter.trip_code = params.tripCode;
    if (params.carrierCode) filter.carrier_code = params.carrierCode;
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
  async startDelivery(
    orderGroupId: string,
    actor: ShipmentActor,
    note?: string,
    groupExpectedVersion?: number,
    carrier?: CarrierChoice,
  ): Promise<ShipmentDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(orderGroupId);
    const reusable = await this.assertNoShipment(group);
    if (carrier?.pickupAt) this.assertPickupNotPast(carrier.pickupAt);

    const isLegacyShipped = group.fulfillment_status === GroupFulfillmentStatus.SHIPPED;
    if (group.fulfillment_status !== GroupFulfillmentStatus.PACKED && !isLegacyShipped) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.GROUP_NOT_READY,
        `Nhóm đơn đang ở trạng thái "${group.fulfillment_status}" — chỉ bắt đầu giao được khi đã đóng gói xong (packed).`,
        HttpStatus.CONFLICT,
        { orderGroupId, status: group.fulfillment_status },
      );
    }
    await this.assertNothingToUnpack(orderGroupId);

    // Gộp thi_dev: có chọn hãng → báo giá theo các kiện thật của kế hoạch đóng gói.
    const quote = carrier
      ? await this.shippingService.quoteChosenService(orderGroupId, carrier.carrierCode, carrier.serviceCode, carrier.toLocation)
      : null;
    // C4 (14/10/2026) — hãng API (GHN): vận đơn bắt đầu ở "chờ lấy hàng", tạo đơn ở hãng cho từng kiện.
    const live = quote?.isLive === true;
    const initialStatus = live ? ShipmentStatus.AWAITING_PICKUP : ShipmentStatus.OUT_FOR_DELIVERY;

    const created = await this.runInTransaction(async (session) => {
      const extras: ShipmentExtras = { note: note ?? null };
      if (quote) Object.assign(extras, this.quoteExtras(quote, new Date(), carrier?.pickupAt));
      if (live) Object.assign(extras, this.liveExtras(carrier?.toLocation));
      const shipment = await this.createShipmentDoc(group, actor, session, extras, {
        status: initialStatus,
        reuse: reusable,
        plannedParcels: live ? this.plannedParcelsOf(quote) : [],
      });
      if (quote) await this.shippingService.persistCosts(orderGroupId, quote, session);
      await this.writeEvent(shipment, null, {
        to: initialStatus,
        // Nhóm đơn "shipped" từ trước G1 (chưa có vận đơn) -> tạo bù, KHÔNG đổi trạng thái nhóm đơn.
        eventType: isLegacyShipped ? ShipmentEventType.LEGACY_BACKFILL : ShipmentEventType.START_DELIVERY,
        actor,
        note: note ?? (isLegacyShipped
          ? 'Tạo bù vận đơn cho nhóm đơn đã chuyển "shipped" trước khi có G1'
          : live ? `Tạo vận đơn ${quote.carrierName} — chờ hãng đến lấy hàng` : null),
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
    // C4 — gọi hãng NGOÀI transaction (không giữ transaction chờ mạng). Lỗi được ghi lên vận
    // đơn (carrier_booking_error), Coordinator sửa địa chỉ rồi bấm "Tạo lại ở hãng".
    return live ? this.bookCarrierParcels(created._id.toString()) : created;
  }

  /** [Coordinator] Giao thành công. */
  async markDelivered(shipmentId: string, expectedVersion: number, actor: ShipmentActor, note?: string, groupExpectedVersion?: number): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    this.assertNotCarrierManaged(shipment);
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
    this.assertNotCarrierManaged(shipment);
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
    this.assertNotCarrierManaged(shipment);
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
      // C4 — vận đơn hãng API: chờ lấy / trung chuyển quá ngày giao dự kiến cũng là trễ.
      status: { $in: [ShipmentStatus.AWAITING_PICKUP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED] },
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

  /**
   * Chặn tạo vận đơn thứ 2 cho cùng nhóm đơn. C4 (14/10/2026): vận đơn hãng đã HUỶ
   * (cancelled) thì được đặt lại — trả về để createShipmentDoc dùng lại đúng document
   * (index unique order_group_id + direction giữ nguyên, không phải migration).
   */
  private async assertNoShipment(group: OrderGroupDocument): Promise<ShipmentDocument | null> {
    const existing = await this.shipmentModel.exists({
      order_group_id: group._id,
      direction: 'forward',
      status: { $ne: ShipmentStatus.CANCELLED },
    });
    if (existing) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.ALREADY_EXISTS,
        'Nhóm đơn này đã có vận đơn — dùng các nút trên vận đơn đó.',
        HttpStatus.CONFLICT,
        { orderGroupId: group._id.toString(), shipmentId: existing._id.toString() },
      );
    }
    // Vận đơn đã huỷ chỉ có khi giao qua hãng API (cần LiveCarrierService) → không có thì khỏi tìm.
    if (!this.liveCarrier) return null;
    return this.shipmentModel.findOne({ order_group_id: group._id, direction: 'forward', status: ShipmentStatus.CANCELLED });
  }

  private async createShipmentDoc(
    group: OrderGroupDocument,
    actor: ShipmentActor,
    session: ClientSession,
    extras: ShipmentExtras = {},
    options: { status?: ShipmentStatus; reuse?: ShipmentDocument | null; plannedParcels?: PlannedCarrierParcel[] } = {},
  ): Promise<ShipmentDocument> {
    const d = new Date();
    const status = options.status ?? ShipmentStatus.OUT_FOR_DELIVERY;
    if (options.reuse) {
      // C4 — đặt lại vận đơn đã huỷ ở hãng: giữ mã SHP-..., tăng lần đặt (client_order_code mới).
      const round = (options.reuse.booking_round ?? 1) + 1;
      const fresh = {
        ...this.resetFields(),
        ...extras,
        status,
        booking_round: round,
        carrier_parcels: this.buildCarrierParcels(options.reuse.shipment_code, round, options.plannedParcels ?? []),
        due_at: extras.due_at ?? addBusinessHours(d, deliveryDueBusinessHours()),
        created_by: actor.userId,
      };
      const updated = await this.shipmentModel.findOneAndUpdate(
        { _id: options.reuse._id, status: ShipmentStatus.CANCELLED },
        { $set: fresh, $inc: { __v: 1 } },
        { returnDocument: 'after', session },
      );
      if (!updated) this.throwConflict(options.reuse._id.toString(), options.reuse.__v);
      return updated;
    }
    const id = new Types.ObjectId();
    const ymd = `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const shipmentCode = `SHP-${ymd}-${id.toString().slice(-6).toUpperCase()}`;
    try {
      const [doc] = await this.shipmentModel.create([{
        due_at: addBusinessHours(d, deliveryDueBusinessHours()),
        ...extras,
        _id: id,
        shipment_code: shipmentCode,
        tracking_code: shipmentCode,
        order_group_id: group._id,
        direction: 'forward',
        status,
        attempt_count: 1,
        max_attempts: MAX_DELIVERY_ATTEMPTS,
        booking_round: 1,
        carrier_parcels: this.buildCarrierParcels(shipmentCode, 1, options.plannedParcels ?? []),
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

  private async writeEvent(
    shipment: ShipmentDocument,
    from: ShipmentStatus | null,
    step: TransitionStep,
    session: ClientSession,
    meta: { source?: string | null; carrierStatus?: string | null } = {},
  ): Promise<void> {
    await this.eventModel.create([{
      ...(meta.source ? { source: meta.source } : {}),
      ...(meta.carrierStatus ? { carrier_status: meta.carrierStatus } : {}),
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

  // ===================================================================
  // Gộp thi_dev (04/10/2026) — giao chung chuyến + chọn hãng + lịch lấy hàng
  // ===================================================================

  /**
   * Tạo N vận đơn (mỗi nhóm 1 cái) trong 1 transaction, chung 1 mã chuyến.
   * Chỉ nhận nhóm đã `packed`; ≥2 nhóm thì BẮT BUỘC cùng `recipient_key` hoặc cùng `manual_link_id`
   * (Mục 9.5). Bắt buộc chọn hãng + dịch vụ; cước tính từ kiện thật của kế
   * hoạch đóng gói, ghi lên vận đơn và lên từng kiện. Mỗi vận đơn đi đúng
   * vòng đời G1 (out_for_delivery, có lịch sử, SLA).
   */
  async createBatch(
    orderGroupIds: string[],
    carrier: CarrierChoice,
    note: string | undefined,
    actor: ShipmentActor,
  ): Promise<ShipmentBatchResult> {
    const uniqueIds = Array.from(new Set(orderGroupIds));
    if (uniqueIds.length === 0) {
      throw new AppException(SHIPMENT_ERROR_CODES.EMPTY_GROUP_LIST, 'Phải chọn ít nhất 1 nhóm đơn.', HttpStatus.BAD_REQUEST);
    }
    if (carrier.pickupAt) this.assertPickupNotPast(carrier.pickupAt);

    const groups: OrderGroupDocument[] = [];
    const reusable = new Map<string, ShipmentDocument | null>();
    for (const id of uniqueIds) {
      const group = await this.orderGroupsService.findOrderGroupById(id);
      if (group.fulfillment_status !== GroupFulfillmentStatus.PACKED) {
        throw new AppException(
          SHIPMENT_ERROR_CODES.GROUP_NOT_READY,
          `Nhóm đơn ${id} đang ở trạng thái "${group.fulfillment_status}" — chỉ tạo vận đơn khi đã đóng gói xong (packed).`,
          HttpStatus.CONFLICT,
          { orderGroupId: id, status: group.fulfillment_status },
        );
      }
      reusable.set(id, await this.assertNoShipment(group));
      await this.assertNothingToUnpack(id);
      groups.push(group);
    }
    if (groups.length > 1) {
      // Cùng người nhận = cùng recipient_key (tự động) HOẶC cùng manual_link_id
      // (Coordinator liên kết tay, 13/10/2026 — VD đơn Lazada bị che dữ liệu).
      const key = groups[0]?.recipient_key ?? null;
      const linkId = groups[0]?.manual_link_id?.toString() ?? null;
      const sameRecipient = key !== null && groups.every((g) => g.recipient_key === key);
      const sameManualLink =
        linkId !== null && groups.every((g) => g.manual_link_id?.toString() === linkId);
      if (!sameRecipient && !sameManualLink) {
        throw new AppException(
          SHIPMENT_ERROR_CODES.RECIPIENT_MISMATCH,
          'Chỉ được giao chung chuyến các nhóm đơn cùng người nhận (cùng recipient_key) hoặc đã được liên kết tay (POST /order-groups/:id/link).',
          HttpStatus.BAD_REQUEST,
          { orderGroupIds: uniqueIds },
        );
      }
    }

    const quotes = new Map<string, ServiceQuote>();
    for (const group of groups) {
      const id = group._id.toString();
      quotes.set(id, await this.shippingService.quoteChosenService(id, carrier.carrierCode, carrier.serviceCode, carrier.toLocation));
    }
    const liveIds = new Set([...quotes.entries()].filter(([, q]) => q.isLive === true).map(([id]) => id));

    const tripCode = this.generateTripCode();
    const now = new Date();
    const created = await this.runInTransaction(async (session) => {
      const rows: ShipmentBatchResult['shipments'] = [];
      for (const group of groups) {
        const id = group._id.toString();
        const quote = quotes.get(id);
        if (!quote) throw new Error(`Thiếu báo giá cho nhóm ${id}`);
        const live = liveIds.has(id);
        const initialStatus = live ? ShipmentStatus.AWAITING_PICKUP : ShipmentStatus.OUT_FOR_DELIVERY;
        const extras = {
          ...this.quoteExtras(quote, now, carrier.pickupAt),
          trip_code: tripCode,
          note: note ?? null,
          ...(live ? this.liveExtras(carrier.toLocation) : {}),
        };
        const shipment = await this.createShipmentDoc(group, actor, session, extras, {
          status: initialStatus,
          reuse: reusable.get(id) ?? null,
          plannedParcels: live ? this.plannedParcelsOf(quote) : [],
        });
        await this.writeEvent(shipment, null, {
          to: initialStatus,
          eventType: ShipmentEventType.START_DELIVERY,
          actor,
          note: `Chuyến ${tripCode}${live ? ` — tạo vận đơn ${quote.carrierName}, chờ hãng lấy hàng` : ''}${note ? ` — ${note}` : ''}`,
        }, session);
        await this.shippingService.persistCosts(id, quote, session);
        await this.orderGroupsService.transitionFulfillmentStatus(id, GroupFulfillmentStatus.SHIPPED, group.__v, session);
        rows.push({
          id: shipment._id.toString(),
          orderGroupId: id,
          trackingCode: shipment.shipment_code,
          parcelCount: quote.parcels.length,
          estimatedCostVnd: quote.totalCostVnd,
          etaFrom: extras.eta_from ?? now,
          etaTo: extras.eta_to ?? now,
          status: initialStatus,
        });
      }
      return rows;
    });

    // C4 — tạo vận đơn ở hãng cho các nhóm đi hãng API (ngoài transaction, lỗi ghi lên vận đơn).
    for (const row of created) {
      if (!liveIds.has(row.orderGroupId)) continue;
      const booked = await this.bookCarrierParcels(row.id);
      const parcels = booked.carrier_parcels ?? [];
      row.carrierOrderCodes = parcels.map((p) => p.carrier_order_code).filter((c): c is string => !!c);
      row.bookingError = booked.carrier_booking_error ?? null;
      row.estimatedCostVnd = booked.estimated_cost_vnd ?? row.estimatedCostVnd;
      row.trackingCode = booked.tracking_code ?? row.trackingCode;
      row.status = booked.status;
    }

    this.logger.log(
      `Tạo ${String(created.length)} vận đơn (${carrier.carrierCode}/${carrier.serviceCode}), chuyến ${tripCode}, nhóm: ${uniqueIds.join(', ')}.`,
    );
    return {
      tripCode,
      carrierCode: carrier.carrierCode,
      serviceCode: carrier.serviceCode,
      totalCostVnd: created.reduce((sum, row) => sum + row.estimatedCostVnd, 0),
      shipments: created,
    };
  }

  /** Đặt/đổi lịch hãng đến lấy hàng (chỉ lịch — chưa gọi API hãng thật). */
  async schedulePickup(id: string, pickupAt: Date): Promise<ShipmentDocument> {
    await this.getShipment(id);
    this.assertPickupNotPast(pickupAt);
    const updated = await this.shipmentModel.findByIdAndUpdate(
      id,
      { $set: { pickup_at: pickupAt } },
      { returnDocument: 'after' },
    );
    return updated ?? this.getShipment(id);
  }

  private quoteExtras(
    quote: ServiceQuote,
    now: Date,
    pickupAt?: Date,
  ): ShipmentExtras & { eta_from: Date; eta_to: Date } {
    return {
      carrier_code: quote.carrierCode,
      carrier_name: quote.carrierName,
      service_code: quote.serviceCode,
      service_name: quote.serviceName,
      parcel_count: quote.parcels.length,
      chargeable_weight_g: quote.totalChargeableG,
      estimated_cost_vnd: quote.totalCostVnd,
      is_sample_rate: quote.isSample,
      eta_from: new Date(now.getTime() + quote.etaMinDays * DAY_MS),
      eta_to: new Date(now.getTime() + quote.etaMaxDays * DAY_MS),
      pickup_at: pickupAt ?? null,
    };
  }

  private assertPickupNotPast(pickupAt: Date): void {
    if (pickupAt.getTime() < Date.now() - 60_000) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.PICKUP_IN_PAST,
        'Thời điểm hãng đến lấy hàng không được ở quá khứ.',
        HttpStatus.BAD_REQUEST,
        { pickupAt: pickupAt.toISOString() },
      );
    }
  }

  private generateTripCode(): string {
    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `TRIP-${yy}${mm}${dd}-${randomBytes(2).toString('hex').toUpperCase()}`;
  }

  // ===================================================================
  // C4/C5 (14/10/2026) — vận đơn giao qua HÃNG THẬT (GHN / mock theo CARRIER_MODE)
  // ===================================================================
  // Nguyên tắc demo (chốt 07/10): phần "tiền" gọi hãng thật (phí, mã vận đơn, nhãn,
  // huỷ); phần "di chuyển" mô phỏng — nút trên web dựng đúng payload webhook GHN và đi
  // CÙNG hàm với webhook thật (processCarrierEvent). Shop KHÔNG có quyền đổi trạng thái
  // đơn bên GHN; mọi thay đổi ở đây chỉ nằm trong DB OptiPack.

  private requireLiveCarrier(): LiveCarrierService {
    if (!this.liveCarrier) {
      throw new AppException('SHIP_LIVE_CARRIER_UNAVAILABLE', 'Chưa nạp module đơn vị vận chuyển — không gọi được hãng.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.liveCarrier;
  }

  private isCarrierManaged(shipment: Pick<Shipment, 'carrier_kind'>): boolean {
    return shipment.carrier_kind === 'live';
  }

  /** Nút G1 (giao thành công / thất bại / giao lại) chỉ dành cho vận đơn tự giao / hãng mẫu. */
  private assertNotCarrierManaged(shipment: ShipmentDocument): void {
    if (this.isCarrierManaged(shipment)) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.MANAGED_BY_CARRIER,
        `Vận đơn ${shipment.shipment_code} do hãng ${shipment.carrier_name ?? ''} quản lý — trạng thái giao đến từ hãng (webhook) hoặc nút mô phỏng POST /shipments/:id/carrier/simulate.`,
        HttpStatus.CONFLICT,
        { shipmentId: shipment._id.toString() },
      );
    }
  }

  private assertCarrierShipment(shipment: ShipmentDocument): void {
    if (!this.isCarrierManaged(shipment)) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.NOT_CARRIER_SHIPMENT,
        `Vận đơn ${shipment.shipment_code} không giao qua hãng API — thao tác này không áp dụng.`,
        HttpStatus.BAD_REQUEST,
        { shipmentId: shipment._id.toString() },
      );
    }
  }

  private liveExtras(toLocation?: ToLocationInput | null): ShipmentExtras {
    return {
      carrier_kind: 'live',
      carrier_adapter: this.liveCarrier?.adapterCode ?? null,
      to_location: toLocation
        ? {
            street: toLocation.street ?? null,
            ward_name: toLocation.ward_name ?? null,
            province_name: toLocation.province_name ?? null,
            phone: toLocation.phone ?? null,
          }
        : null,
    };
  }

  private plannedParcelsOf(quote: ServiceQuote): PlannedCarrierParcel[] {
    return quote.parcels
      .filter((p) => p.parcelNo !== undefined && p.orderId !== null)
      .map((p) => ({ parcel_no: p.parcelNo ?? 0, order_id: p.orderId ?? '' }));
  }

  private buildCarrierParcels(shipmentCode: string, round: number, planned: PlannedCarrierParcel[]): CarrierParcel[] {
    return planned.map((p) => ({
      parcel_no: p.parcel_no,
      order_id: new Types.ObjectId(p.order_id),
      platform_order_id: null,
      client_order_code: carrierClientCode(shipmentCode, round, p.parcel_no),
      carrier_order_code: null,
      sort_code: null,
      weight_g: null,
      length_cm: null,
      width_cm: null,
      height_cm: null,
      fee: null,
      expected_delivery_at: null,
      carrier_status: null,
      carrier_status_at: null,
      booking_error: null,
    }));
  }

  /** Field đưa về mặc định khi đặt lại vận đơn đã huỷ. */
  private resetFields(): Record<string, unknown> {
    return {
      attempt_count: 1,
      last_failure_reason: null,
      delivered_at: null,
      returned_at: null,
      next_attempt_not_before: null,
      is_overdue: false,
      trip_code: null,
      carrier_status: null,
      carrier_booking_error: null,
      carrier_incident: null,
      picked_up_at: null,
      carrier_returned_at: null,
      cancelled_at: null,
    };
  }

  /**
   * C4 — tạo vận đơn ở hãng cho các kiện CHƯA có mã hãng (gọi lại an toàn: hãng nhận cùng
   * client_order_code thì trả đơn cũ). Lỗi từng kiện ghi vào `booking_error` của kiện và
   * `carrier_booking_error` của vận đơn — không ném lỗi, để vận đơn vẫn hiện cho Coordinator sửa.
   */
  async bookCarrierParcels(shipmentId: string): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    this.assertCarrierShipment(shipment);
    if (shipment.status !== ShipmentStatus.AWAITING_PICKUP) return shipment;
    const pending = (shipment.carrier_parcels ?? []).filter((p) => !p.carrier_order_code);
    if (pending.length === 0) return shipment;
    const live = this.requireLiveCarrier();
    const service = await this.shippingService.resolveLiveService(shipment.carrier_code ?? '', shipment.service_code ?? '');
    const parcelsByNo = new Map(
      (await this.shippingService.parcelsOfGroup(shipment.order_group_id.toString())).map((p) => [p.parcelNo ?? -1, p]),
    );
    const toLocation: ToLocationInput | null = shipment.to_location
      ? {
          street: shipment.to_location.street,
          ward_name: shipment.to_location.ward_name,
          province_name: shipment.to_location.province_name,
          phone: shipment.to_location.phone,
        }
      : null;
    const now = new Date();
    const errors: string[] = [];
    const next: CarrierParcel[] = [];
    for (const cp of shipment.carrier_parcels ?? []) {
      const plain: CarrierParcel = {
        parcel_no: cp.parcel_no,
        order_id: cp.order_id,
        platform_order_id: cp.platform_order_id ?? null,
        client_order_code: cp.client_order_code,
        carrier_order_code: cp.carrier_order_code ?? null,
        sort_code: cp.sort_code ?? null,
        weight_g: cp.weight_g ?? null,
        length_cm: cp.length_cm ?? null,
        width_cm: cp.width_cm ?? null,
        height_cm: cp.height_cm ?? null,
        fee: cp.fee ?? null,
        expected_delivery_at: cp.expected_delivery_at ?? null,
        carrier_status: cp.carrier_status ?? null,
        carrier_status_at: cp.carrier_status_at ?? null,
        booking_error: cp.booking_error ?? null,
      };
      if (plain.carrier_order_code) {
        next.push(plain);
        continue;
      }
      const parcel = parcelsByNo.get(cp.parcel_no);
      if (!parcel) {
        plain.booking_error = `Kiện ${String(cp.parcel_no)} không còn trong kế hoạch đóng gói.`;
        errors.push(plain.booking_error);
        next.push(plain);
        continue;
      }
      try {
        const booked = await live.bookParcel({
          clientOrderCode: cp.client_order_code,
          parcel,
          service,
          toLocation,
          note: shipment.note,
        });
        Object.assign(plain, {
          carrier_order_code: booked.result.carrier_order_code || null,
          sort_code: booked.result.sort_code,
          weight_g: booked.carrierParcel.weight_g,
          length_cm: booked.carrierParcel.length_cm,
          width_cm: booked.carrierParcel.width_cm,
          height_cm: booked.carrierParcel.height_cm,
          fee: { ...booked.result.fee },
          expected_delivery_at: booked.result.expected_delivery_at,
          carrier_status: 'ready_to_pick',
          carrier_status_at: now,
          booking_error: null,
        });
      } catch (error: unknown) {
        const code = error instanceof AppException ? error.errorCode : 'CARRIER_UNAVAILABLE';
        const message = error instanceof Error ? error.message : String(error);
        plain.booking_error = `${code}: ${message}`;
        errors.push(`Kiện ${String(cp.parcel_no)} — ${plain.booking_error}`);
      }
      next.push(plain);
    }
    const booked = next.filter((p) => p.carrier_order_code);
    const totalFee = booked.reduce((sum, p) => sum + (p.fee?.total ?? 0), 0);
    const latest = booked.reduce<Date | null>(
      (max, p) => (p.expected_delivery_at && (!max || p.expected_delivery_at > max) ? p.expected_delivery_at : max),
      null,
    );
    const set: Record<string, unknown> = {
      carrier_parcels: next,
      carrier_booking_error: errors.length > 0 ? errors.join(' | ') : null,
    };
    if (booked.length > 0) {
      set.carrier_status = 'ready_to_pick';
      if (booked.length === next.length) set.estimated_cost_vnd = totalFee; // cước THẬT hãng tính khi tạo
      if (latest) {
        set.eta_to = latest;
        set.due_at = latest; // hạn giao = ngày giao dự kiến của hãng (cron quá hạn dùng)
      }
      if (next.length === 1 && booked[0]?.carrier_order_code) set.tracking_code = booked[0].carrier_order_code;
    }
    const allBookedNow = booked.length === next.length;
    const updated = await this.runInTransaction(async (session) => {
      const doc = await this.shipmentModel.findOneAndUpdate(
        { _id: shipment._id, __v: shipment.__v },
        { $set: set, $inc: { __v: 1 } },
        { returnDocument: 'after', session },
      );
      if (!doc) return null;
      if (allBookedNow) {
        await this.writeEvent(doc, doc.status, {
          to: doc.status,
          eventType: ShipmentEventType.CARRIER_BOOKED,
          actor: SYSTEM_ACTOR,
          note: `Đã tạo vận đơn ${doc.carrier_name ?? ''} (${this.liveCarrier?.adapterCode ?? ''}): ${booked.map((p) => `kiện ${String(p.parcel_no)} = ${p.carrier_order_code ?? ''}`).join(', ')} — tổng phí ${String(totalFee)}đ`,
        }, session, { source: 'manual', carrierStatus: 'ready_to_pick' });
      }
      return doc;
    });
    if (!updated) return this.getShipment(shipmentId); // người khác vừa tạo song song — trả bản mới nhất
    if (errors.length > 0) this.logger.warn(`Vận đơn ${updated.shipment_code}: tạo ở hãng chưa đủ — ${errors.join(' | ')}`);
    return updated;
  }

  /** C4 — sửa địa chỉ gửi hãng (chỉ khi còn kiện CHƯA có mã hãng), rồi tạo lại ở hãng. */
  async updateToLocation(shipmentId: string, toLocation: ToLocationInput): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    this.assertCarrierShipment(shipment);
    const hasUnbooked = (shipment.carrier_parcels ?? []).some((p) => !p.carrier_order_code);
    if (shipment.status !== ShipmentStatus.AWAITING_PICKUP || !hasUnbooked) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.TO_LOCATION_LOCKED,
        'Mọi kiện đã có mã vận đơn ở hãng — muốn đổi địa chỉ phải huỷ vận đơn ở hãng rồi tạo lại.',
        HttpStatus.CONFLICT,
        { shipmentId },
      );
    }
    const prev = shipment.to_location;
    const merged = {
      street: toLocation.street !== undefined ? toLocation.street : (prev?.street ?? null),
      ward_name: toLocation.ward_name ?? prev?.ward_name ?? null,
      province_name: toLocation.province_name ?? prev?.province_name ?? null,
      phone: toLocation.phone ?? prev?.phone ?? null,
    };
    const updated = await this.shipmentModel.findOneAndUpdate(
      { _id: shipment._id, __v: shipment.__v },
      { $set: { to_location: merged }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) this.throwConflict(shipmentId, shipment.__v);
    return this.bookCarrierParcels(shipmentId);
  }

  /** C4 — link in nhãn của hãng (GHN A5) cho mọi kiện đã có mã. */
  async getCarrierLabel(shipmentId: string): Promise<{ url: string; expiresAt: Date; carrierOrderCodes: string[] }> {
    const shipment = await this.getShipment(shipmentId);
    this.assertCarrierShipment(shipment);
    const codes = (shipment.carrier_parcels ?? []).map((p) => p.carrier_order_code).filter((c): c is string => !!c);
    if (codes.length === 0) {
      throw new AppException(SHIPMENT_ERROR_CODES.CARRIER_NOT_BOOKED, 'Chưa kiện nào có mã vận đơn ở hãng.', HttpStatus.CONFLICT, { shipmentId });
    }
    const label = await this.requireLiveCarrier().adapterInstance.createLabel(codes);
    return { url: label.url, expiresAt: label.expires_at, carrierOrderCodes: codes };
  }

  /**
   * C4 — huỷ vận đơn ở hãng (chỉ khi còn "chờ lấy hàng"). Hãng huỷ được hết → vận đơn
   * `cancelled`, nhóm đơn quay về `packed` để tạo lại (cùng hoặc khác hãng).
   */
  async cancelCarrier(shipmentId: string, actor: ShipmentActor, reasonCode?: string, note?: string): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    this.assertCarrierShipment(shipment);
    if (shipment.status !== ShipmentStatus.AWAITING_PICKUP) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.CARRIER_CANCEL_NOT_ALLOWED,
        `Chỉ huỷ được khi vận đơn còn "chờ lấy hàng" (hiện: "${shipment.status}").`,
        HttpStatus.CONFLICT,
        { shipmentId, status: shipment.status },
      );
    }
    const adapter = this.requireLiveCarrier().adapterInstance;
    const rejected: string[] = [];
    for (const p of shipment.carrier_parcels ?? []) {
      if (!p.carrier_order_code || p.carrier_status === 'cancel') continue;
      const r = await adapter.cancelShipment(p.carrier_order_code, reasonCode);
      if (!r.cancelled) rejected.push(`${p.carrier_order_code}: ${r.message ?? 'hãng không cho huỷ'}`);
      else {
        await this.shipmentModel.updateOne(
          { _id: shipment._id },
          { $set: { 'carrier_parcels.$[p].carrier_status': 'cancel', 'carrier_parcels.$[p].carrier_status_at': new Date() } },
          { arrayFilters: [{ 'p.carrier_order_code': p.carrier_order_code }] },
        );
      }
    }
    if (rejected.length > 0) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.CARRIER_CANCEL_REJECTED,
        `Hãng từ chối huỷ: ${rejected.join(' | ')}`,
        HttpStatus.CONFLICT,
        { shipmentId, rejected },
      );
    }
    const fresh = await this.getShipment(shipmentId);
    const updated = await this.runInTransaction(async (session) => {
      const doc = await this.shipmentModel.findOneAndUpdate(
        { _id: fresh._id, __v: fresh.__v, status: ShipmentStatus.AWAITING_PICKUP },
        {
          $set: {
            status: ShipmentStatus.CANCELLED,
            carrier_status: 'cancel',
            cancelled_at: new Date(),
            'carrier_parcels.$[].carrier_status': 'cancel',
          },
          $inc: { __v: 1 },
        },
        { returnDocument: 'after', session },
      );
      if (!doc) this.throwConflict(shipmentId, fresh.__v);
      await this.writeEvent(doc, ShipmentStatus.AWAITING_PICKUP, {
        to: ShipmentStatus.CANCELLED,
        eventType: ShipmentEventType.CARRIER_CANCELLED,
        actor,
        reasonCode: reasonCode ?? null,
        note: note ?? 'Huỷ vận đơn ở hãng trước khi lấy hàng — nhóm đơn quay về "đã đóng gói" để tạo lại',
      }, session, { source: 'manual', carrierStatus: 'cancel' });
      await this.moveGroupForCarrier(doc, ShipmentStatus.CANCELLED, session);
      return doc;
    });
    return updated;
  }

  /** C5 — nút MÔ PHỎNG trạng thái hãng (demo). Bật bằng CARRIER_MANUAL_STATUS_ENABLED=true. */
  async simulateCarrierStatus(
    shipmentId: string,
    status: string,
    actor: ShipmentActor,
    reasonCode?: string,
    reason?: string,
  ): Promise<ShipmentDocument> {
    if (this.configService?.get<boolean>('carrier.manualStatusEnabled') !== true) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.CARRIER_SIMULATION_DISABLED,
        'Nút mô phỏng trạng thái hãng đang tắt (CARRIER_MANUAL_STATUS_ENABLED khác "true"). Môi trường thật dùng webhook của hãng.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!SIMULATABLE_GHN_STATUSES.includes(status)) {
      throw new AppException(
        SHIPMENT_ERROR_CODES.CARRIER_STATUS_INVALID,
        `Trạng thái "${status}" không mô phỏng được. Hợp lệ: ${SIMULATABLE_GHN_STATUSES.join(', ')}. Huỷ dùng POST /shipments/:id/carrier/cancel.`,
        HttpStatus.BAD_REQUEST,
        { status },
      );
    }
    const shipment = await this.getShipment(shipmentId);
    this.assertCarrierShipment(shipment);
    const booked = (shipment.carrier_parcels ?? []).filter((p) => p.carrier_order_code && p.carrier_status !== 'cancel');
    if (booked.length === 0) {
      throw new AppException(SHIPMENT_ERROR_CODES.CARRIER_NOT_BOOKED, 'Chưa kiện nào có mã vận đơn ở hãng để mô phỏng.', HttpStatus.CONFLICT, { shipmentId });
    }
    const base = Date.now();
    for (const [i, p] of booked.entries()) {
      await this.processCarrierEvent(
        {
          ShopID: this.configService.get<string>('carrier.ghn.shopId') ?? '',
          OrderCode: p.carrier_order_code ?? '',
          ClientOrderCode: p.client_order_code,
          Type: 'switch_status',
          Status: status,
          Time: new Date(base + i).toISOString(),
          ...(reasonCode ? { ReasonCode: reasonCode } : {}),
          ...(reason ? { Reason: reason } : {}),
        },
        'carrier_simulated',
        actor,
      );
    }
    return this.getShipment(shipmentId);
  }

  /** C5 — đồng bộ trạng thái từ hãng (Order Info) — dự phòng khi mất webhook. */
  async syncCarrier(shipmentId: string, actor: ShipmentActor): Promise<ShipmentDocument> {
    const shipment = await this.getShipment(shipmentId);
    this.assertCarrierShipment(shipment);
    const adapter = this.requireLiveCarrier().adapterInstance;
    const booked = (shipment.carrier_parcels ?? []).filter((p) => p.carrier_order_code);
    if (booked.length === 0) {
      throw new AppException(SHIPMENT_ERROR_CODES.CARRIER_NOT_BOOKED, 'Chưa kiện nào có mã vận đơn ở hãng để đồng bộ.', HttpStatus.CONFLICT, { shipmentId });
    }
    for (const p of booked) {
      const detail = await adapter.getShipmentDetail(p.carrier_order_code ?? '');
      await this.processCarrierEvent(
        {
          OrderCode: detail.carrier_order_code,
          ClientOrderCode: p.client_order_code,
          Type: 'sync',
          Status: detail.carrier_status,
          Time: (detail.updated_at ?? new Date()).toISOString(),
        },
        'carrier_sync',
        actor,
      );
    }
    return this.getShipment(shipmentId);
  }

  /**
   * C5 — webhook GHN (Order Status Callback). GHN KHÔNG ký request → kiểm khoá bí mật
   * (header `x-optipack-secret` hoặc query `secret`, khai khi đăng ký webhook) + ShopID.
   */
  async handleGhnWebhook(payload: CarrierEventPayload, secret: string | undefined): Promise<{ ok: true; result: string }> {
    const expected = this.configService?.get<string>('carrier.ghn.webhookSecret')?.trim();
    if (!expected || secret !== expected) {
      throw new AppException(SHIPMENT_ERROR_CODES.WEBHOOK_UNAUTHORIZED, 'Sai khoá bí mật webhook.', HttpStatus.UNAUTHORIZED);
    }
    const shopId = this.configService?.get<string>('carrier.ghn.shopId')?.trim();
    if (shopId && payload.ShopID !== undefined && String(payload.ShopID) !== shopId) {
      throw new AppException(SHIPMENT_ERROR_CODES.WEBHOOK_UNAUTHORIZED, `ShopID ${String(payload.ShopID)} không phải shop của OptiPack.`, HttpStatus.UNAUTHORIZED);
    }
    return { ok: true, result: await this.processCarrierEvent(payload, 'carrier_webhook', { userId: 'carrier:ghn', role: null }) };
  }

  /**
   * C5 — điểm vào DUY NHẤT cho mọi sự kiện trạng thái hãng (webhook / đồng bộ / mô phỏng).
   * Ghi sổ chống trùng trước; lỗi tạm thời → xoá bản ghi để lần gửi lại của hãng được xử lý.
   */
  async processCarrierEvent(evt: CarrierEventPayload, source: CarrierEventSource, actor: ShipmentActor): Promise<string> {
    const orderCode = (evt.OrderCode ?? '').trim();
    if (!orderCode) return 'ignored:no_order_code';
    const dedupeKey = `${orderCode}|${evt.Type ?? ''}|${evt.Status ?? ''}|${evt.Time ?? ''}`;
    let recordId: Types.ObjectId | null = null;
    if (this.webhookEventModel) {
      try {
        const [rec] = await this.webhookEventModel.create([{
          dedupe_key: dedupeKey,
          carrier: 'ghn',
          source,
          order_code: orderCode,
          type: evt.Type ?? null,
          status: evt.Status ?? null,
          payload: JSON.stringify(evt).slice(0, 5000),
        }]);
        recordId = rec?._id ?? null;
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return 'duplicate';
        throw error;
      }
    }
    try {
      const { result, shipmentId } = await this.applyCarrierEvent(orderCode, evt, source, actor);
      if (recordId && this.webhookEventModel) {
        await this.webhookEventModel.updateOne({ _id: recordId }, { $set: { result, shipment_id: shipmentId } });
      }
      return result;
    } catch (error) {
      if (recordId && this.webhookEventModel) await this.webhookEventModel.deleteOne({ _id: recordId });
      throw error;
    }
  }

  private async applyCarrierEvent(
    orderCode: string,
    evt: CarrierEventPayload,
    source: CarrierEventSource,
    actor: ShipmentActor,
  ): Promise<{ result: string; shipmentId: Types.ObjectId | null }> {
    const status = (evt.Status ?? '').trim();
    const type = (evt.Type ?? '').trim();
    if (!status) return { result: 'ignored:no_status', shipmentId: null };
    if (type && !['switch_status', 'sync', 'create'].includes(type)) {
      return { result: `ignored:type_${type}`, shipmentId: null };
    }
    const at = evt.Time && !Number.isNaN(Date.parse(evt.Time)) ? new Date(evt.Time) : new Date();
    const label = GHN_STATUS_LABELS[status] ?? status;
    const reasonCode = evt.ReasonCode ?? null;
    const reasonText = evt.Reason ?? null;
    const sourceLabel = source === 'carrier_simulated' ? 'mô phỏng' : source === 'carrier_sync' ? 'đồng bộ' : source === 'carrier_webhook' ? 'webhook' : 'người bấm';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const shipment = await this.shipmentModel.findOne({ 'carrier_parcels.carrier_order_code': orderCode });
      if (!shipment) return { result: 'ignored:shipment_not_found', shipmentId: null };

      const parcelSet = {
        'carrier_parcels.$[p].carrier_status': status,
        'carrier_parcels.$[p].carrier_status_at': at,
      };
      const arrayFilters = [{ 'p.carrier_order_code': orderCode }];

      if (GHN_INCIDENT_STATUSES.includes(status)) {
        await this.runInTransaction(async (session) => {
          await this.shipmentModel.updateOne(
            { _id: shipment._id },
            { $set: { ...parcelSet, carrier_incident: `${status}${reasonText ? `: ${reasonText}` : ''}` } },
            { arrayFilters, session },
          );
          await this.writeEvent(shipment, shipment.status, {
            to: shipment.status,
            eventType: ShipmentEventType.CARRIER_INCIDENT,
            actor,
            reasonCode,
            note: `${shipment.carrier_name ?? 'Hãng'}: ${label} (mã ${orderCode}, ${sourceLabel})${reasonText ? ` — ${reasonText}` : ''}`,
          }, session, { source, carrierStatus: status });
        });
        await this.notifySafe({
          type: NotificationType.DELIVERY_RETURNING, severity: 'critical',
          title: `Sự cố vận đơn ${shipment.shipment_code}: ${label}`,
          message: `Hãng báo "${status}" cho kiện ${orderCode}. Cần liên hệ hãng xử lý.`,
        }, shipment);
        return { result: `incident:${status}`, shipmentId: shipment._id };
      }

      const statuses = (shipment.carrier_parcels ?? []).map((p) => (p.carrier_order_code === orderCode ? status : (p.carrier_status ?? null)));
      const target = aggregateCarrierStatus(statuses);
      const from = shipment.status;
      const extraSet: Record<string, unknown> = { carrier_status: status };
      if (status === 'returned') extraSet.carrier_returned_at = at;

      if (!target || !canCarrierMove(from, target)) {
        // Không đổi trạng thái vận đơn (đến lệch thứ tự / trùng / đã kết thúc) — vẫn lưu trạng thái kiện.
        await this.shipmentModel.updateOne({ _id: shipment._id }, { $set: { ...parcelSet, ...extraSet } }, { arrayFilters });
        return { result: `recorded:${from}${target ? `->${target}(bỏ qua)` : ''}`, shipmentId: shipment._id };
      }

      if (from === ShipmentStatus.AWAITING_PICKUP && target !== ShipmentStatus.CANCELLED && !shipment.picked_up_at) extraSet.picked_up_at = at;
      if (target === ShipmentStatus.DELIVERED) extraSet.delivered_at = at;
      if (target === ShipmentStatus.CANCELLED) extraSet.cancelled_at = at;
      if (target === ShipmentStatus.DELIVERY_FAILED) {
        extraSet.last_failure_reason = mapGhnFailureReason(reasonCode);
      }
      const redelivery = from === ShipmentStatus.DELIVERY_FAILED && target === ShipmentStatus.OUT_FOR_DELIVERY;
      if (redelivery) extraSet.next_attempt_not_before = null;

      const updated = await this.runInTransaction(async (session) => {
        const doc = await this.shipmentModel.findOneAndUpdate(
          { _id: shipment._id, __v: shipment.__v },
          { $set: { status: target, ...parcelSet, ...extraSet }, $inc: { __v: 1, ...(redelivery ? { attempt_count: 1 } : {}) } },
          { returnDocument: 'after', arrayFilters, session },
        );
        if (!doc) return null;
        await this.writeEvent(doc, from, {
          to: target,
          eventType: ShipmentEventType.CARRIER_STATUS,
          actor,
          reasonCode,
          note: `${doc.carrier_name ?? 'Hãng'}: ${label} (mã ${orderCode}, ${sourceLabel})${reasonText ? ` — ${reasonText}` : ''}`,
        }, session, { source, carrierStatus: status });
        await this.moveGroupForCarrier(doc, target, session);
        return doc;
      });
      if (!updated) continue; // vận đơn vừa đổi bởi sự kiện khác → đọc lại, thử lại
      this.logger.log(`Vận đơn ${updated.shipment_code}: ${from} -> ${target} (hãng báo "${status}", ${source})`);
      if (target === ShipmentStatus.DELIVERY_FAILED) {
        await this.notifySafe({
          type: NotificationType.DELIVERY_FAILED, severity: 'warning',
          title: `Hãng giao thất bại — ${updated.shipment_code}`,
          message: `Lý do: ${reasonCode ?? 'không rõ'}${reasonText ? ` — ${reasonText}` : ''}. Hãng sẽ giao lại hoặc hoàn theo quy định của hãng.`,
        }, updated);
      } else if (target === ShipmentStatus.RETURNING_TO_WAREHOUSE) {
        await this.notifySafe({
          type: NotificationType.DELIVERY_RETURNING, severity: 'critical',
          title: `Vận đơn ${updated.shipment_code} đang hoàn về kho`,
          message: `Hãng báo "${label}". Kho quét "Nhận hàng hoàn" khi kiện về tới để tạo phiếu hoàn và kiểm hàng.`,
        }, updated, [UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF]);
      }
      return { result: `applied:${from}->${target}`, shipmentId: updated._id };
    }
    throw new AppException(SHIPMENT_ERROR_CODES.STATE_CONFLICT, `Vận đơn có mã hãng ${orderCode} đổi liên tục — thử lại sau.`, HttpStatus.CONFLICT);
  }

  /**
   * Nhóm đơn đi theo vận đơn hãng: giao thành công → `delivered`; huỷ ở hãng → về `packed`
   * (tạo lại vận đơn được). Hoàn hàng: nhóm đơn chỉ thành `returned` khi kho quét nhận (G1/G3).
   * Nhóm đơn không ở `shipped` (dữ liệu lạ) thì bỏ qua, không làm hỏng sự kiện của hãng.
   */
  private async moveGroupForCarrier(shipment: ShipmentDocument, target: ShipmentStatus, session: ClientSession): Promise<void> {
    const groupTarget =
      target === ShipmentStatus.DELIVERED ? GroupFulfillmentStatus.DELIVERED
        : target === ShipmentStatus.CANCELLED ? GroupFulfillmentStatus.PACKED
          : null;
    if (!groupTarget) return;
    const g = await this.orderGroupsService.findOrderGroupById(shipment.order_group_id.toString());
    if (g.fulfillment_status !== GroupFulfillmentStatus.SHIPPED) {
      this.logger.warn(`Nhóm đơn ${g._id.toString()} đang "${g.fulfillment_status}" — không chuyển sang "${groupTarget}" theo vận đơn hãng.`);
      return;
    }
    await this.orderGroupsService.transitionFulfillmentStatus(g._id.toString(), groupTarget, g.__v, session);
  }
}

