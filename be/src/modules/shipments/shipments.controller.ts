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
import { FailShipmentDto, RetryShipmentDto, SchedulePickupDto, ShipmentActionDto, StartShipmentDto } from './dto/shipment-action.dto';
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
  serviceCode: string | null;
  serviceName: string | null;
  parcelCount: number | null;
  chargeableWeightG: number | null;
  estimatedCostVnd: number | null;
  isSampleRate: boolean | null;
  etaFrom: Date | null;
  etaTo: Date | null;
  pickupAt: Date | null;
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
    serviceCode: doc.service_code ?? null,
    serviceName: doc.service_name ?? null,
    parcelCount: doc.parcel_count ?? null,
    chargeableWeightG: doc.chargeable_weight_g ?? null,
    estimatedCostVnd: doc.estimated_cost_vnd ?? null,
    isSampleRate: doc.is_sample_rate ?? null,
    etaFrom: doc.eta_from ?? null,
    etaTo: doc.eta_to ?? null,
    pickupAt: doc.pickup_at ?? null,
  };
}

/** carrier_code + service_code phải đi cùng nhau (hoặc cùng bỏ trống = đội xe nhà). */
function carrierChoiceOf(dto: { carrier_code?: string; service_code?: string; pickup_at?: string }): CarrierChoice | undefined {
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
      },
      dto.note,
      actorOf(user),
    );
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
  @ApiOperation({ summary: '[Bắt đầu giao] Tạo vận đơn cho nhóm đơn đã đóng gói (packed) -> out_for_delivery; nhóm đơn -> shipped.' })
  async start(@Body() dto: StartShipmentDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(
      await this.shipmentsService.startDelivery(dto.order_group_id, actorOf(user), dto.note, undefined, carrierChoiceOf(dto)),
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

  @Post(':id/receive-return')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho nhận hàng hoàn] returning_to_warehouse -> returned_to_warehouse; nhóm đơn -> returned.' })
  async receiveReturn(@Param('id') id: string, @Body() dto: ShipmentActionDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.receiveReturn(id, dto.expected_version, actorOf(user), dto.note));
  }
}
