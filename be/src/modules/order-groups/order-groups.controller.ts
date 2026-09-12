import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderGroupsService } from './order-groups.service';
import { ListOrderGroupsQueryDto } from './dto/list-order-groups-query.dto';
import { TransitionOrderGroupDto } from './dto/transition-order-group.dto';
import { PickItemDto } from './dto/pick-item.dto';
import { ReportMissingDto } from './dto/report-missing.dto';
import { DecidePartialDto } from './dto/decide-partial.dto';
import { SetPriorityDto } from './dto/set-priority.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { OrderGroupForPackaging, PackableItem } from '../../common/interfaces/packaging.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrderGroupDocument } from './schemas/order-group.schema';

// Response tối thiểu — cùng nguyên tắc "không trả thẳng Document ra
// ngoài" đã áp dụng ở orders.controller.ts (tránh lộ __v raw của
// Mongoose lẫn vào field khác). ĐÂY LÀ CANONICAL SHAPE — theo đúng
// Rule #22 (CLAUDE.md, "Canonical schema"): field trả ra ngoài chỉ
// gồm dữ liệu chuẩn hóa chung, không lộ field đặc thù sàn nào.
//
// `version` (MỚI, 2026-09-09) — lộ CÓ CHỦ ĐÍCH giá trị __v ra ngoài
// dưới tên rõ nghĩa hơn, để FE đọc rồi gửi lại đúng giá trị này vào
// body của 5 endpoint fulfillment (Rule #18, Optimistic Concurrency)
// — không phải rò rỉ Mongoose internal, mà là hợp đồng API có chủ đích.
interface OrderGroupResponse {
  id: string;
  platform: string;
  shopId: string;
  orderCount: number;
  fulfillmentStatus: string;
  activePackagingRecommendationId: string | null;
  assignedStaffId: string | null;
  orderPriority: string;
  packagingDeadline: Date | null;
  isOverdue: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(group: OrderGroupDocument): OrderGroupResponse {
  return {
    id: group._id.toString(),
    platform: group.platform,
    shopId: group.shop_id,
    orderCount: group.order_count,
    fulfillmentStatus: group.fulfillment_status,
    activePackagingRecommendationId: group.active_packaging_recommendation
      ? group.active_packaging_recommendation.toString()
      : null,
    assignedStaffId: group.assigned_staff_id ? group.assigned_staff_id.toString() : null,
    orderPriority: group.order_priority,
    packagingDeadline: group.packaging_deadline,
    isOverdue: group.is_overdue,
    version: group.__v,
    createdAt: group.created_at ?? new Date(0),
    updatedAt: group.updated_at ?? new Date(0),
  };
}

/**
 * ===================================================================
 * order-groups.controller.ts — MỚI (2026-09-09), bổ sung 5 endpoint
 * fulfillment cùng ngày (lượt code thứ 2 trong ngày)
 * ===================================================================
 * Lượt 1 (sáng): 3 route ĐỌC (list, detail, picking-list).
 * Lượt 2 (chiều, lượt này): 5 route GHI trạng thái — pick/pack/ship/
 * deliver/return — dùng CHUNG 1 hàm Service duy nhất
 * (transitionFulfillmentStatus), chỉ khác targetStatus truyền vào.
 *
 * MỖI route đều validate qua allowed-status-transitions.ts (không cho
 * nhảy trạng thái tùy tiện) VÀ áp Rule #18 Optimistic Concurrency
 * (bắt buộc body kèm expected_version, lấy từ field `version` của lần
 * GET gần nhất) — 2 lớp bảo vệ độc lập, không lớp nào thay thế lớp kia.
 *
 * ⚠️ GIỚI HẠN TRUNG THỰC cần biết trước khi test: các endpoint này CHỈ
 * chạy được khi group đang ở ĐÚNG trạng thái nguồn hợp lệ (VD `pick`
 * cần group đang APPROVED_FOR_PACKING) — nhưng UC-04 (nơi duy nhất đưa
 * group từ AWAITING_PACKAGING → PENDING_APPROVAL → APPROVED_FOR_PACKING)
 * CHƯA được code. Nghĩa là NGAY BÂY GIỜ, group mới tạo luôn dừng ở
 * AWAITING_PACKAGING — muốn test thật 5 endpoint này, cần TẠM sửa tay
 * `fulfillment_status` trong MongoDB Compass thành `approved_for_packing`
 * trước, cho tới khi UC-04 được code (việc 3 trong roadmap).
 * ===================================================================
 */
@ApiTags('Order Groups')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderGroupsController {
  constructor(private readonly orderGroupsService: OrderGroupsService) {}

  @Get()
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách Order Group — lọc theo fulfillment_status để mỗi role thấy đúng hàng đợi của mình (VD Warehouse Staff lọc approved_for_packing để biết cần lấy hàng gì)',
  })
  async list(@Query() query: ListOrderGroupsQueryDto): Promise<OrderGroupResponse[]> {
    const groups = await this.orderGroupsService.listOrderGroups({
      fulfillmentStatus: query.fulfillment_status,
      platform: query.platform,
      orderPriority: query.order_priority,
    });
    return groups.map(toResponse);
  }

  @Get(':id')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Chi tiết 1 Order Group — đọc field "version" để dùng cho 5 API chuyển trạng thái bên dưới' })
  async findOne(@Param('id') id: string): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.findOrderGroupById(id);
    return toResponse(group);
  }

  @Get(':id/picking-list')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách sản phẩm cần lấy cho 1 Order Group, kèm kích thước (đã cache từ Product Master) — dùng cho màn hình Warehouse Picking (Mobile App). CHƯA có vị trí kệ thật (module warehouse/ chưa code, xem CLAUDE.md).',
  })
  async pickingList(@Param('id') id: string): Promise<OrderGroupForPackaging> {
    // TÁI DÙNG ĐÚNG hàm đã có, viết cho mục đích bàn giao AI Packaging
    // — giờ dùng lại cho mục đích khác (Warehouse Staff xem) mà không
    // cần viết logic mới, đúng tinh thần "không thừa thãi".
    return this.orderGroupsService.getPackableItemsForGroup(id);
  }

  @Get(':id/picking-list/:sku')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Chi tiết 1 món hàng riêng lẻ trong Order Group — dùng cho màn hình Stepper số lượng/confirm từng item trước khi quét.',
  })
  async pickingListItemDetail(
    @Param('id') id: string,
    @Param('sku') sku: string,
  ): Promise<PackableItem> {
    return this.orderGroupsService.getPackableItemDetail(id, sku);
  }

  @Post(':id/fulfillment/pick-item')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Quét/nhập tay 1 SKU khi lấy hàng — trừ tồn kho ngay (atomic). Gọi NHIỀU LẦN, mỗi lần 1 SKU, TRƯỚC KHI bấm "pick" (xác nhận xong cả nhóm) bên dưới. Dùng client_event_id khi Mobile App offline-sync retry (chống trừ trùng).',
  })
  async pickItem(
    @Param('id') id: string,
    @Body() body: PickItemDto,
  ): Promise<{ sku: string; decrementedBy: number; remainingStock: number }> {
    return this.orderGroupsService.pickItem(
      id,
      body.warehouse_id,
      body.sku,
      body.scanned_quantity,
      body.scan_method,
      body.client_event_id,
    );
  }

  @Post(':id/fulfillment/report-missing')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Báo thiếu hàng khi lấy (UC-07 Alt Flow) — group chuyển "partial_needs_review", DỪNG LẠI chờ Packaging Staff/Admin quyết định (Hướng Y), thông báo Store Owner ngay.',
  })
  async reportMissing(
    @Param('id') id: string,
    @Body() body: ReportMissingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.reportMissing(
      id,
      user.userId,
      body.sku,
      body.missing_quantity,
      body.expected_version,
      body.note,
    );
    return toResponse(group);
  }

  @Post(':id/fulfillment/decide-partial')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Quyết định group đang "partial_needs_review" — approve=true: tiếp tục với phần có sẵn (picked); approve=false: hủy, quay lại awaiting_packaging.',
  })
  async decidePartial(
    @Param('id') id: string,
    @Body() body: DecidePartialDto,
  ): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.decidePartial(id, body.approve, body.expected_version);
    return toResponse(group);
  }

  @Post(':id/fulfillment/pick')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận ĐÃ LẤY XONG toàn bộ hàng trong Order Group (approved_for_packing -> picked). Warehouse Staff bấm sau khi soạn xong theo picking-list.',
  })
  async pick(@Param('id') id: string, @Body() body: TransitionOrderGroupDto): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.transitionFulfillmentStatus(
      id,
      GroupFulfillmentStatus.PICKED,
      body.expected_version,
    );
    return toResponse(group);
  }

  @Post(':id/fulfillment/pack')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xác nhận ĐÃ ĐÓNG GÓI xong (picked -> packed).' })
  async pack(@Param('id') id: string, @Body() body: TransitionOrderGroupDto): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.transitionFulfillmentStatus(
      id,
      GroupFulfillmentStatus.PACKED,
      body.expected_version,
    );
    return toResponse(group);
  }

  @Post(':id/fulfillment/ship')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xác nhận ĐÃ GIAO cho đơn vị vận chuyển (packed -> shipped).' })
  async ship(@Param('id') id: string, @Body() body: TransitionOrderGroupDto): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.transitionFulfillmentStatus(
      id,
      GroupFulfillmentStatus.SHIPPED,
      body.expected_version,
    );
    return toResponse(group);
  }

  @Post(':id/fulfillment/deliver')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xác nhận ĐÃ GIAO THÀNH CÔNG tới khách (shipped -> delivered).' })
  async deliver(@Param('id') id: string, @Body() body: TransitionOrderGroupDto): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.transitionFulfillmentStatus(
      id,
      GroupFulfillmentStatus.DELIVERED,
      body.expected_version,
    );
    return toResponse(group);
  }

  @Post(':id/fulfillment/return')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận HOÀN HÀNG (shipped hoặc delivered -> returned) — dùng chung cho cả Shipping Coordinator (khách trả hàng sau khi giao) và Warehouse Staff (phát hiện lỗi lúc soạn hàng, hủy giữa chừng).',
  })
  async returnGroup(@Param('id') id: string, @Body() body: TransitionOrderGroupDto): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.transitionFulfillmentStatus(
      id,
      GroupFulfillmentStatus.RETURNED,
      body.expected_version,
    );
    return toResponse(group);
  }

  @Patch(':id/priority')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đánh dấu đơn Hỏa Tốc/Bình thường — Lazada KHÔNG cung cấp tín hiệu tự động (đã xác minh bằng doc thật), Store Owner/Admin tự tay quyết định. Tự tính packaging_deadline theo giờ hành chính (8h-17h, tính cả Thứ 7).',
  })
  async setPriority(@Param('id') id: string, @Body() body: SetPriorityDto): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.setPriority(id, body.order_priority, body.deadline_hours);
    return toResponse(group);
  }
}
