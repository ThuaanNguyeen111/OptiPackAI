import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ShipmentsService, ShipmentActor } from './shipments.service';
import { ShipmentDocument } from './schemas/shipment.schema';
import { ShipmentEventDocument } from './schemas/shipment-event.schema';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { DELIVERY_FAILURE_REASON_LABELS, DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import { FailShipmentDto, ShipmentActionDto, StartShipmentDto } from './dto/shipment-action.dto';
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
  version: number;
  createdAt: Date | null;
  updatedAt: Date | null;
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
    version: doc.__v,
    createdAt: doc.created_at ?? null,
    updatedAt: doc.updated_at ?? null,
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
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Danh sách vận đơn (lọc theo trạng thái / nhóm đơn).' })
  async list(
    @Query('status') status?: ShipmentStatus,
    @Query('order_group_id') orderGroupId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: ShipmentResponse[]; total: number; page: number; limit: number }> {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const { items, total } = await this.shipmentsService.listShipments({ status, orderGroupId, page: p, limit: l });
    return { items: items.map(toShipmentResponse), total, page: p, limit: l };
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
    return toShipmentResponse(await this.shipmentsService.startDelivery(dto.order_group_id, actorOf(user), dto.note));
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
    return toShipmentResponse(await this.shipmentsService.markFailed(id, dto.expected_version, dto.reason_code, actorOf(user), dto.note));
  }

  @Post(':id/retry')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: '[Giao lại] delivery_failed -> out_for_delivery (lần giao +1).' })
  async retry(@Param('id') id: string, @Body() dto: ShipmentActionDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.retryDelivery(id, dto.expected_version, actorOf(user), dto.note));
  }

  @Post(':id/receive-return')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho nhận hàng hoàn] returning_to_warehouse -> returned_to_warehouse; nhóm đơn -> returned.' })
  async receiveReturn(@Param('id') id: string, @Body() dto: ShipmentActionDto, @CurrentUser() user: AuthenticatedUser): Promise<ShipmentResponse> {
    return toShipmentResponse(await this.shipmentsService.receiveReturn(id, dto.expected_version, actorOf(user), dto.note));
  }
}
