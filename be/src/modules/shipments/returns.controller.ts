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
    externalRef: d.external_ref ?? null, // 21/10/2026 — id yêu cầu trả bên sàn (AURELLE) khi source = marketplace
    sourceOrderId: d.source_order_id?.toString() ?? null,
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
  @ApiOperation({ summary: '[Admin] Tạo phiếu trong 15 ngày từ lúc giao. return_refund trả đủ nhóm (cộng dồn phiếu đã đóng) → nhóm returning, phiếu requested.' })
  async create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.createSimulated(dto, user.userId));
  }

  @Post(':id/approve')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Duyệt] return_refund trả đủ nhóm → nhóm returned, phiếu awaiting_receipt. refund_only đóng phiếu luôn. Người tạo không tự duyệt.' })
  async approve(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.approve(id, dto.expected_version, user.userId, dto.note));
  }

  @Post(':id/reject')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Từ chối] Bắt buộc lý do; return_refund trả đủ nhóm khôi phục nhóm delivered.' })
  async reject(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.reject(id, dto.expected_version, user.userId, dto.note));
  }

  @Post(':id/cancel')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Hủy phiếu đã duyệt] Khách không gửi hàng: awaiting_receipt → canceled, bắt buộc note. return_refund trả đủ nhóm khôi phục nhóm delivered.' })
  async cancel(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.cancel(id, dto.expected_version, user.userId, dto.note));
  }

  @Post(':id/receive')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho] Nhận kiện: phiếu awaiting_receipt → received; nhóm trả đủ giữ returned, chưa nhập tồn/chưa canceled. Phiếu cũ tiếp tục xử lý được.' })
  async receive(@Param('id') id: string, @Body() dto: ReturnActionDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.receive(id, dto.expected_version, user.userId));
  }

  @Post(':id/inspect')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '[Kho] Kiểm đủ từng SKU: restock/quarantine/discard, phiếu → closed. return_refund trả đủ nhóm → canceled cùng transaction nhập tồn.' })
  async inspect(@Param('id') id: string, @Body() dto: InspectReturnDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toReturnResponse(await this.returnsService.inspect(id, dto, user.userId));
  }
}
