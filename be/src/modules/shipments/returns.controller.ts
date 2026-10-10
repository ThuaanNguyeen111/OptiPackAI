import { ListReturnsQueryDto } from './dto/list-query.dto';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { ReturnRequestDocument } from './schemas/return-request.schema';
import { InspectionResult, RETURN_REASON_LABELS, ReturnReason, ReturnStatus } from './enums/return.enums';
import { CreateReturnDto, InspectReturnDto, ResolveQuarantineDto, ReturnActionDto } from './dto/return.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

function toReturnResponse(d: ReturnRequestDocument): Record<string, unknown> {
  return {
    id: d._id.toString(),
    rmaCode: d.rma_code,
    orderGroupId: d.order_group_id.toString(),
    shipmentId: d.shipment_id?.toString() ?? null,
    type: d.type,
    source: d.source,
    status: d.status,
    items: d.items.map((i) => ({ sellerSku: i.seller_sku, quantity: i.quantity, reasonCode: i.reason_code, reasonLabel: RETURN_REASON_LABELS[i.reason_code] })),
    inspection: d.inspection.map((l) => ({
      sellerSku: l.seller_sku, quantity: l.quantity, result: l.result,
      warehouseId: l.warehouse_id?.toString() ?? null, binLocationId: l.bin_location_id?.toString() ?? null, note: l.note,
      disposition: l.result === InspectionResult.QUARANTINE ? (l.disposition ?? 'pending') : null,
      disposedAt: l.disposed_at ?? null, disposedBy: l.disposed_by ?? null, dispositionNote: l.disposition_note ?? null,
    })),
    exchangeItems: d.exchange_items.map((i) => ({ sellerSku: i.seller_sku, quantity: i.quantity })),
    replacementStatus: d.replacement_status,
    replacementOrderId: d.replacement_order_id?.toString() ?? null,
    replacementGroupId: d.replacement_group_id?.toString() ?? null,
    replacementError: d.replacement_error,
    packagingInspection: d.packaging_inspection.map((p) => ({
      materialCode: p.material_code, quantity: p.quantity, grade: p.grade, reuseCycleSeen: p.reuse_cycle_seen,
      oldLabelRemoved: p.old_label_removed, recoveredToReuse: p.recovered_to_reuse, outcome: p.outcome,
    })),
    customerNote: d.customer_note,
    decisionNote: d.decision_note,
    createdBy: d.created_by,
    decidedBy: d.decided_by,
    receivedBy: d.received_by,
    inspectedBy: d.inspected_by,
    closedAt: d.closed_at,
    version: d.__v,
    createdAt: d.created_at ?? null,
    updatedAt: d.updated_at ?? null,
  };
}

/**
 * G3 (27/09/2026) — trả/hoàn hàng bản gọn (bấm nút, giả lập khách).
 * Luồng: [Admin đóng vai khách] tạo -> [Store Owner] duyệt/từ chối ->
 * [Kho] nhận hàng -> [Kho] kiểm hàng -> đóng. Kiện giao thất bại về kho
 * thì hệ thống tự tạo phiếu ở bước "đã nhận".
 */
@ApiTags('Returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get('reason-codes')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.SHIPPING_COORDINATOR)
  @ApiOperation({ summary: 'Danh sách lý do trả hàng (dropdown).' })
  reasonCodes(): { code: ReturnReason; label: string }[] {
    return Object.values(ReturnReason).filter((r) => r !== ReturnReason.FAILED_DELIVERY).map((code) => ({ code, label: RETURN_REASON_LABELS[code] }));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.SHIPPING_COORDINATOR)
  @ApiQuery({ name: 'status', required: false, enum: ReturnStatus })
  @ApiQuery({ name: 'order_group_id', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query() q: ListReturnsQueryDto,
  ): Promise<{ items: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const p = q.page ?? 1;
    const l = q.limit ?? 20;
    const { items, total } = await this.returnsService.list({
      status: q.status,
      orderGroupId: q.order_group_id,
      page: p,
      limit: l,
    });
    return { items: items.map(toReturnResponse), total, page: p, limit: l };
  }

  @Get('quarantine')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Hàng đang cách ly chờ xử lý (mọi phiếu), cũ nhất trước.' })
  quarantine(): ReturnType<ReturnsService['listQuarantine']> {
    return this.returnsService.listQuarantine();
  }

  @Post(':id/quarantine/:lineIndex/resolve')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xử lý 1 dòng cách ly: restock (nhập lại ô bán, ghi sổ cái) hoặc discard (loại bỏ).' })
  async resolveQuarantine(
    @Param('id') id: string,
    @Param('lineIndex', ParseIntPipe) lineIndex: number,
    @Body() dto: ResolveQuarantineDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.resolveQuarantine(id, lineIndex, dto, user.userId));
  }

  @Post(':id/create-replacement')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo lại đơn thay thế cho phiếu đổi hàng (khi lần tạo tự động bị lỗi).' })
  async createReplacement(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.createReplacement(id, user.userId));
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.SHIPPING_COORDINATOR)
  async get(@Param('id') id: string): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.get(id));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Giả lập khách] Yêu cầu trả hàng / hoàn tiền cho nhóm đơn đã giao (trong 15 ngày).' })
  async create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.createSimulated(dto, user.userId));
  }

  @Post(':id/approve')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Duyệt] Hoàn tiền không trả hàng -> đóng luôn; trả hàng -> chờ hàng về kho. Người tạo phiếu không được tự duyệt.' })
  async approve(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.approve(id, dto.expected_version, user.userId, dto.note));
  }

  @Post(':id/reject')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Từ chối] Bắt buộc ghi lý do.' })
  async reject(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.reject(id, dto.expected_version, user.userId, dto.note));
  }

  @Post(':id/cancel')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Hủy phiếu đã duyệt] Hàng khách không gửi về — phiếu awaiting_receipt → canceled. Bắt buộc lý do (note).' })
  async cancel(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.cancel(id, dto.expected_version, user.userId, dto.note));
  }

  @Post(':id/receive')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho] Hàng khách trả đã về kho. Trả toàn bộ -> nhóm đơn -> returned.' })
  async receive(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.receive(id, dto.expected_version, user.userId));
  }

  @Post(':id/inspect')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho] Kiểm hàng: restock (nhập lại ô, ghi sổ cái) / quarantine (cách ly) / discard (loại bỏ). Tổng mỗi SKU phải khớp số trả.' })
  async inspect(@Param('id') id: string, @Body() dto: InspectReturnDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.inspect(id, dto, user.userId));
  }
}
