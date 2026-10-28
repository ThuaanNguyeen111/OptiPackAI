import { ListShipmentsQueryDto } from './dto/list-query.dto';
import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ShipmentsService, ShipmentActor, type CarrierChoice, type ShipmentBatchResult } from './shipments.service';
import { CreateShipmentBatchDto } from './dto/create-shipment-batch.dto';
import { AppException } from '../../common/exceptions/app-exception';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { ShipmentDocument } from './schemas/shipment.schema';
import { ShipmentEventDocument } from './schemas/shipment-event.schema';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { DELIVERY_FAILURE_REASON_LABELS, DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import {
  CancelCarrierDto,
  FailShipmentDto,
  RetryShipmentDto,
  SchedulePickupDto,
  ShipmentActionDto,
  SimulateCarrierStatusDto,
  StartShipmentDto,
  UpdateToLocationDto,
} from './dto/shipment-action.dto';
import type { ToLocationDto } from '../shipping/dto/shipping.dto';
import type { ToLocationInput } from '../shipping/live-carrier.service';
import { GHN_STATUS_LABELS, SIMULATABLE_GHN_STATUSES } from './carrier-status.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

export interface ShipmentResponse {
  id: string;
  shipmentCode: string;
  orderGroupId: string;
  status: ShipmentStatus;
  attemptCount: number;
  maxAttempts: number;
  lastFailureReason: string | null;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  nextAttemptNotBefore: Date | null;
  dueAt: Date | null;
  isOverdue: boolean;
  version: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Gộp thi_dev (04/10/2026) — null khi giao bằng đội xe nhà (không chọn hãng)
  tripCode: string | null;
  trackingCode: string;
  note: string | null;
  carrierCode: string | null;
  carrierName: string | null;
  /** 29/10/2026 — shipper của shop (hỏa tốc tự giao). */
  shipperId: string | null;
  shipperName: string | null;
  shipperPhone: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  parcelCount: number | null;
  chargeableWeightG: number | null;
  estimatedCostVnd: number | null;
  isSampleRate: boolean | null;
  etaFrom: Date | null;
  etaTo: Date | null;
  pickupAt: Date | null;
  // C4/C5 (14/10/2026) — giao qua hãng API (GHN). carrierManaged=false với vận đơn cũ.
  carrierManaged: boolean;
  carrierAdapter: string | null;
  carrierStatus: string | null;
  carrierStatusLabel: string | null;
  carrierBookingError: string | null;
  carrierIncident: string | null;
  bookingRound: number;
  toLocation: { street: string | null; wardName: string | null; provinceName: string | null; phone: string | null } | null;
  carrierParcels: {
    parcelNo: number;
    orderId: string;
    clientOrderCode: string;
    carrierOrderCode: string | null;
    sortCode: string | null;
    weightG: number | null;
    dimensionsCm: { length: number; width: number; height: number } | null;
    feeTotalVnd: number | null;
    expectedDeliveryAt: Date | null;
    carrierStatus: string | null;
    carrierStatusLabel: string | null;
    bookingError: string | null;
  }[];
  pickedUpAt: Date | null;
  carrierReturnedAt: Date | null;
  cancelledAt: Date | null;
}

export function toShipmentResponse(doc: ShipmentDocument): ShipmentResponse {
  return {
    id: doc._id.toString(),
    shipmentCode: doc.shipment_code,
    orderGroupId: doc.order_group_id.toString(),
    status: doc.status,
    attemptCount: doc.attempt_count,
    maxAttempts: doc.max_attempts,
    lastFailureReason: doc.last_failure_reason,
    deliveredAt: doc.delivered_at,
    returnedAt: doc.returned_at,
    nextAttemptNotBefore: doc.next_attempt_not_before ?? null,
    dueAt: doc.due_at ?? null,
    isOverdue: doc.is_overdue === true,
    version: doc.__v,
    createdAt: doc.created_at ?? null,
    updatedAt: doc.updated_at ?? null,
    tripCode: doc.trip_code ?? null,
    trackingCode: doc.tracking_code ?? doc.shipment_code,
    note: doc.note ?? null,
    carrierCode: doc.carrier_code ?? null,
    carrierName: doc.carrier_name ?? null,
    shipperId: doc.shipper_id ? doc.shipper_id.toString() : null,
    shipperName: doc.shipper_name ?? null,
    shipperPhone: doc.shipper_phone ?? null,
    serviceCode: doc.service_code ?? null,
    serviceName: doc.service_name ?? null,
    parcelCount: doc.parcel_count ?? null,
    chargeableWeightG: doc.chargeable_weight_g ?? null,
    estimatedCostVnd: doc.estimated_cost_vnd ?? null,
    isSampleRate: doc.is_sample_rate ?? null,
    etaFrom: doc.eta_from ?? null,
    etaTo: doc.eta_to ?? null,
    pickupAt: doc.pickup_at ?? null,
    carrierManaged: doc.carrier_kind === 'live',
    carrierAdapter: doc.carrier_adapter ?? null,
    carrierStatus: doc.carrier_status ?? null,
    carrierStatusLabel: doc.carrier_status ? (GHN_STATUS_LABELS[doc.carrier_status] ?? doc.carrier_status) : null,
    carrierBookingError: doc.carrier_booking_error ?? null,
    carrierIncident: doc.carrier_incident ?? null,
    bookingRound: doc.booking_round ?? 1,
    toLocation: doc.to_location
      ? {
          street: doc.to_location.street ?? null,
          wardName: doc.to_location.ward_name ?? null,
          provinceName: doc.to_location.province_name ?? null,
          phone: doc.to_location.phone ?? null,
        }
      : null,
    carrierParcels: (doc.carrier_parcels ?? []).map((p) => ({
      parcelNo: p.parcel_no,
      orderId: p.order_id.toString(),
      clientOrderCode: p.client_order_code,
      carrierOrderCode: p.carrier_order_code ?? null,
      sortCode: p.sort_code ?? null,
      weightG: p.weight_g ?? null,
      dimensionsCm:
        p.length_cm && p.width_cm && p.height_cm ? { length: p.length_cm, width: p.width_cm, height: p.height_cm } : null,
      feeTotalVnd: p.fee?.total ?? null,
      expectedDeliveryAt: p.expected_delivery_at ?? null,
      carrierStatus: p.carrier_status ?? null,
      carrierStatusLabel: p.carrier_status ? (GHN_STATUS_LABELS[p.carrier_status] ?? p.carrier_status) : null,
      bookingError: p.booking_error ?? null,
    })),
    pickedUpAt: doc.picked_up_at ?? null,
    carrierReturnedAt: doc.carrier_returned_at ?? null,
    cancelledAt: doc.cancelled_at ?? null,
  };
}

/** Body địa chỉ → ToLocationInput (bỏ field không gửi). */
function toLocationOf(dto: ToLocationDto | undefined): ToLocationInput | null {
  if (!dto) return null;
  const out: ToLocationInput = {};
  if (dto.street !== undefined) out.street = dto.street;
  if (dto.ward_name) out.ward_name = dto.ward_name;
  if (dto.province_name) out.province_name = dto.province_name;
  if (dto.phone) out.phone = dto.phone;
  return Object.keys(out).length > 0 ? out : null;
}

/** carrier_code + service_code phải đi cùng nhau (hoặc cùng bỏ trống = đội xe nhà). */
function carrierChoiceOf(dto: { carrier_code?: string; service_code?: string; pickup_at?: string; to_location?: ToLocationDto }): CarrierChoice | undefined {
  if (!dto.carrier_code && !dto.service_code) return undefined;
  if (!dto.carrier_code || !dto.service_code) {
    throw new AppException(
      SHIPMENT_ERROR_CODES.CARRIER_REQUIRED,
      'Chọn hãng thì phải chọn cả dịch vụ (carrier_code + service_code).',
      HttpStatus.BAD_REQUEST,
    );
  }
  return {
    carrierCode: dto.carrier_code,
    serviceCode: dto.service_code,
    pickupAt: dto.pickup_at ? new Date(dto.pickup_at) : undefined,
    toLocation: toLocationOf(dto.to_location),
  };
}

function toEventResponse(e: ShipmentEventDocument): Record<string, unknown> {
  return {
    id: e._id.toString(),
    eventType: e.event_type,
    statusFrom: e.status_from,
    statusTo: e.status_to,
    attemptNo: e.attempt_no,
    actorId: e.actor_id,
    actorRole: e.actor_role,
    reasonCode: e.reason_code,
    // reason_code đọc từ DB là chuỗi — có thể là giá trị lạ (dữ liệu cũ/sửa tay) nên tra theo Record<string, string | undefined>
    reasonLabel: e.reason_code ? ((DELIVERY_FAILURE_REASON_LABELS as Record<string, string | undefined>)[e.reason_code] ?? null) : null,
    note: e.note,
    occurredAt: e.occurred_at,
    // C5 (14/10/2026) — sự kiện của hãng: nguồn + trạng thái gốc.
    source: e.source ?? null,
    carrierStatus: e.carrier_status ?? null,
  };
}

function actorOf(user: AuthenticatedUser): ShipmentActor {
  return { userId: user.userId, role: user.role };
}

/**
 * G1 (27/09/2026) — giao hàng bản gọn: bấm nút đổi trạng thái, lịch sử = tracking.
 * Tạm thời Shipping Coordinator bấm toàn bộ nút giao hàng (chưa có role shipper).
 */
@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('reason-codes')
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Danh sách lý do giao thất bại (dùng cho dropdown).' })
  reasonCodes(): { code: DeliveryFailureReason; label: string }[] {
    return Object.values(DeliveryFailureReason).map((code) => ({ code, label: DELIVERY_FAILURE_REASON_LABELS[code] }));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiQuery({ name: 'status', required: false, enum: ShipmentStatus })
  @ApiQuery({ name: 'order_group_id', required: false })
  @ApiQuery({ name: 'overdue', required: false, description: 'true = chỉ vận đơn quá hạn giao' })
  @ApiQuery({ name: 'trip_code', required: false })
  @ApiQuery({ name: 'carrier_code', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Danh sách vận đơn (lọc theo trạng thái / nhóm đơn / chuyến / hãng).' })
  async list(
    @Query() q: ListShipmentsQueryDto,
  ): Promise<{ items: ShipmentResponse[]; total: number; page: number; limit: number }> {
    const p = q.page ?? 1;
    const l = q.limit ?? 20;
    const { items, total } = await this.shipmentsService.listShipments({
      status: q.status,
      orderGroupId: q.order_group_id,
      overdueOnly: q.overdue === 'true',
      tripCode: q.trip_code,
      carrierCode: q.carrier_code,
      page: p,
      limit: l,
    });
    return { items: items.map(toShipmentResponse), total, page: p, limit: l };
  }

  @Post('overdue-scan')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Quét vận đơn quá hạn giao NGAY (cùng logic cron 15 phút/lần) — dùng khi vận hành/demo.' })
  async overdueScan(): Promise<{ flagged: number }> {
    return { flagged: await this.shipmentsService.flagOverdueShipments() };
  }

  @Get('group/:groupId')
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Vận đơn của 1 nhóm đơn (null nếu chưa có).' })
  async byGroup(@Param('groupId') groupId: string): Promise<ShipmentResponse | null> {
    const doc = await this.shipmentsService.findByGroup(groupId);
    return doc ? toShipmentResponse(doc) : null;
  }

  @Post('batch')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Giao chung chuyến: tạo vận đơn cho 1..N nhóm đã packed trong 1 transaction, chung mã chuyến. ≥2 nhóm phải cùng người nhận (recipient_key). Bắt buộc chọn hãng + dịch vụ (GET /shipping/quote/:groupId); cước ghi lên vận đơn và từng kiện.',
  })
  async batch(@Body() dto: CreateShipmentBatchDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentBatchResult> {
    return this.shipmentsService.createBatch(
      dto.order_group_ids,
      {
        carrierCode: dto.carrier_code,
        serviceCode: dto.service_code,
        pickupAt: dto.pickup_at ? new Date(dto.pickup_at) : undefined,
        toLocation: toLocationOf(dto.to_location),
      },
      dto.note,
      actorOf(user),
    );
  }

  @Get('shippers')
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER)
  @ApiOperation({ summary: '29/10/2026 — Shipper của shop (Shipping Coordinator đang làm việc) để chọn khi giao hỏa tốc.' })
  async shippers(): Promise<{ id: string; name: string; phone: string | null; email: string }[]> {
    return this.shipmentsService.listShippers();
  }

  @Get('carrier/statuses')
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'C5 — Trạng thái hãng (GHN) mô phỏng được + nhãn tiếng Việt (dropdown nút mô phỏng).' })
  carrierStatuses(): { status: string; label: string }[] {
    return SIMULATABLE_GHN_STATUSES.map((status) => ({ status, label: GHN_STATUS_LABELS[status] ?? status }));
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Chi tiết vận đơn.' })
  async get(@Param('id') id: string): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.getShipment(id));
  }

  @Get(':id/events')
  @Roles(UserRole.ADMIN, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Lịch sử vận đơn (tracking dạng dòng thời gian), cũ -> mới.' })
  async events(@Param('id') id: string): Promise<Record<string, unknown>[]> {
    return (await this.shipmentsService.listEvents(id)).map(toEventResponse);
  }

  @Post()
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: '[Bắt đầu giao] Tạo vận đơn cho nhóm đơn đã đóng gói (packed) -> out_for_delivery; nhóm đơn -> shipped. 🆕 29/10: nhóm hỏa tốc (requiresSelfDelivery) BẮT BUỘC shipper_id, không chọn hãng.' })
  async start(@Body() dto: StartShipmentDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(
      await this.shipmentsService.startDelivery(dto.order_group_id, actorOf(user), dto.note, undefined, carrierChoiceOf(dto), dto.shipper_id),
    );
  }

  @Patch(':id/pickup')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Đặt/đổi lịch hãng đến lấy hàng (chỉ lưu lịch, chưa gọi API hãng).' })
  async pickup(@Param('id') id: string, @Body() dto: SchedulePickupDto): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.schedulePickup(id, new Date(dto.pickup_at)));
  }

  @Post(':id/deliver')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: '[Giao thành công] out_for_delivery -> delivered; nhóm đơn -> delivered.' })
  async deliver(@Param('id') id: string, @Body() dto: ShipmentActionDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.markDelivered(id, dto.expected_version, actorOf(user), dto.note));
  }

  @Post(':id/fail')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: '[Giao thất bại] Chọn lý do. Lần 2 hoặc "khách từ chối" -> hệ thống TỰ chuyển hoàn về kho.' })
  async fail(@Param('id') id: string, @Body() dto: FailShipmentDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.markFailed(id, dto.expected_version, dto.reason_code, actorOf(user), dto.note, dto.reschedule_at));
  }

  @Post(':id/retry')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: '[Giao lại] delivery_failed -> out_for_delivery. Trước giờ cho phép (nextAttemptNotBefore) phải gửi override_reason.' })
  async retry(@Param('id') id: string, @Body() dto: RetryShipmentDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.retryDelivery(id, dto.expected_version, actorOf(user), dto.note, dto.override_reason));
  }

  // ------------------------------------------------ C4/C5 (14/10/2026) — hãng API (GHN)

  @Post(':id/carrier/book')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'C4 — Tạo (lại) vận đơn ở hãng cho các kiện CHƯA có mã hãng (gọi lại an toàn, hãng không tạo trùng).' })
  async carrierBook(@Param('id') id: string): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.bookCarrierParcels(id));
  }

  @Patch(':id/to-location')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'C4 — Sửa địa chỉ gửi hãng (số nhà / phường / tỉnh / SĐT) khi hãng báo sai địa chỉ, rồi tự tạo lại ở hãng. Chỉ khi còn kiện chưa có mã hãng.' })
  async toLocation(@Param('id') id: string, @Body() dto: UpdateToLocationDto): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.updateToLocation(id, toLocationOf(dto) ?? {}));
  }

  @Get(':id/carrier/label')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'C4 — Link in nhãn của hãng (GHN A5, sống ~30 phút) cho mọi kiện đã có mã hãng.' })
  async carrierLabel(@Param('id') id: string): Promise<{ url: string; expiresAt: Date; carrierOrderCodes: string[] }> {
    return this.shipmentsService.getCarrierLabel(id);
  }

  @Post(':id/carrier/cancel')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'C4 — Huỷ vận đơn ở hãng (chỉ khi "chờ lấy hàng"). Vận đơn -> cancelled, nhóm đơn -> packed để tạo lại.' })
  async carrierCancel(@Param('id') id: string, @Body() dto: CancelCarrierDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.cancelCarrier(id, actorOf(user), dto.reason_code, dto.note));
  }

  @Post(':id/carrier/sync')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'C5 — Đồng bộ trạng thái từ hãng (Order Info) — dự phòng khi mất webhook.' })
  async carrierSync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.syncCarrier(id, actorOf(user)));
  }

  @Post(':id/carrier/simulate')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'C5 — [DEMO] Mô phỏng sự kiện của hãng (VD picked, delivering, delivered, delivery_fail, returning, returned). Dựng đúng payload webhook GHN và đi CÙNG hàm xử lý webhook. Chỉ đổi dữ liệu OptiPack, không đổi gì bên GHN. Bật bằng CARRIER_MANUAL_STATUS_ENABLED=true.',
  })
  async carrierSimulate(
    @Param('id') id: string,
    @Body() dto: SimulateCarrierStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.simulateCarrierStatus(id, dto.status, actorOf(user), dto.reason_code, dto.reason));
  }

  @Post(':id/receive-return')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho nhận hàng hoàn] returning_to_warehouse -> returned_to_warehouse; nhóm đơn -> returned.' })
  async receiveReturn(@Param('id') id: string, @Body() dto: ShipmentActionDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.receiveReturn(id, dto.expected_version, actorOf(user), dto.note));
  }
}
