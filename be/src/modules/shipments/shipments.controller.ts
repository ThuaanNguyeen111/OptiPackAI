import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import {
  CreateShipmentBatchDto,
  SchedulePickupDto,
} from './dto/create-shipment-batch.dto';
import { ShipmentBatchResult, ShipmentsService } from './shipments.service';
import type { ShipmentDocument } from './schemas/shipment.schema';

export interface ShipmentResponse {
  id: string;
  orderGroupId: string;
  tripCode: string;
  trackingCode: string;
  carrierCode: string | null;
  carrierName: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  parcelCount: number;
  chargeableWeightG: number;
  estimatedCostVnd: number | null;
  /** true = cước lấy từ bảng cước MẪU, chưa phải cước thật của hãng. */
  isSampleRate: boolean;
  etaFrom: Date | null;
  etaTo: Date | null;
  pickupAt: Date | null;
  note: string | null;
  createdAt: Date | null;
}

export function toShipmentResponse(doc: ShipmentDocument): ShipmentResponse {
  return {
    id: doc._id.toString(),
    orderGroupId: doc.order_group_id.toString(),
    tripCode: doc.trip_code,
    trackingCode: doc.tracking_code,
    carrierCode: doc.carrier_code,
    carrierName: doc.carrier_name,
    serviceCode: doc.service_code,
    serviceName: doc.service_name,
    parcelCount: doc.parcel_count,
    chargeableWeightG: doc.chargeable_weight_g,
    estimatedCostVnd: doc.estimated_cost_vnd,
    isSampleRate: doc.is_sample_rate,
    etaFrom: doc.eta_from,
    etaTo: doc.eta_to,
    pickupAt: doc.pickup_at,
    note: doc.note,
    createdAt: doc.created_at ?? null,
  };
}

/**
 * ===================================================================
 * shipments.controller.ts — Mục 9.5 (29/09/2026) + vận chuyển thật (30/09/2026)
 * ===================================================================
 * KHÔNG đụng `POST /order-groups/:id/fulfillment/ship` hiện có (giữ nguyên, FE
 * cũ không vỡ) — endpoint này tạo vận đơn thật (hãng, cước, ETA, mã chuyến)
 * cùng lúc chuyển trạng thái. Gọi được cho cả 1 group lẫn nhiều group cùng
 * người nhận (giao chung chuyến).
 * ===================================================================
 */
@ApiTags('Shipments')
@ApiBearerAuth('JWT-auth')
@Controller('shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('batch')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tạo vận đơn cho 1 hoặc nhiều Order Group đã "packed" với hãng + dịch vụ đã chọn — cước tính từ các kiện thật, có thời gian giao dự kiến và lịch lấy hàng tùy chọn. Nhiều group PHẢI cùng người nhận (recipient_key), chung 1 mã chuyến. Mỗi group chuyển sang "shipped".',
  })
  async createBatch(
    @Body() body: CreateShipmentBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShipmentBatchResult> {
    return this.shipmentsService.createBatch(
      body.order_group_ids,
      body.carrier_code,
      body.service_code,
      body.note,
      user.userId,
      body.pickup_at ? new Date(body.pickup_at) : undefined,
    );
  }

  @Get()
  @Roles(
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.WAREHOUSE_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Danh sách vận đơn mới nhất trước — lọc theo mã chuyến hoặc hãng.',
  })
  @ApiQuery({ name: 'trip_code', required: false })
  @ApiQuery({ name: 'carrier_code', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('trip_code') tripCode?: string,
    @Query('carrier_code') carrierCode?: string,
    @Query('limit') limit?: string,
  ): Promise<ShipmentResponse[]> {
    const docs = await this.shipmentsService.listShipments({
      tripCode,
      carrierCode,
      limit: limit ? Number(limit) : undefined,
    });
    return docs.map(toShipmentResponse);
  }

  @Get('group/:groupId')
  @Roles(
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.WAREHOUSE_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Vận đơn của 1 Order Group (theo dõi: hãng, mã, ETA, lịch lấy hàng). null nếu chưa tạo.',
  })
  async byGroup(
    @Param('groupId') groupId: string,
  ): Promise<{ shipment: ShipmentResponse | null }> {
    const doc = await this.shipmentsService.findByGroup(groupId);
    return { shipment: doc ? toShipmentResponse(doc) : null };
  }

  @Patch(':id/pickup')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Hẹn/đổi lịch hãng đến lấy hàng cho 1 vận đơn (chỉ lưu lịch — chưa gọi API hãng).',
  })
  async schedulePickup(
    @Param('id') id: string,
    @Body() body: SchedulePickupDto,
  ): Promise<ShipmentResponse> {
    return toShipmentResponse(
      await this.shipmentsService.schedulePickup(id, new Date(body.pickup_at)),
    );
  }
}
