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
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderGroupsService, GroupOrderCounts, type GroupOrderView } from './order-groups.service';
import { ListOrderGroupsQueryDto } from './dto/list-order-groups-query.dto';
import { TransitionOrderGroupDto } from './dto/transition-order-group.dto';
import { PickItemDto } from './dto/pick-item.dto';
import { ReportMissingDto } from './dto/report-missing.dto';
import { DecidePartialDto } from './dto/decide-partial.dto';
import { SetPriorityDto } from './dto/set-priority.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { OrderGroupForPicking, PickableItem } from '../../common/interfaces/packaging.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrderGroupDocument } from './schemas/order-group.schema';
import {
  LazadaPackSyncService,
  LazadaPackSyncResult,
} from './lazada-pack-sync.service';

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
export interface OrderGroupResponse {
  stockShortage: boolean; // K5
  origin: 'marketplace' | 'replacement'; // đơn thay thế do đổi hàng
  sourceReturnId: string | null;
  stockShortageItems: {
    sku: string;
    needed: number;
    reserved: number;
    shortage: number;
  }[]; // K5
  id: string;
  platform: string;
  shopId: string;
  orderCount: number;
  activeOrderCount: number; // 01/10/2026 — đơn còn phải xử lý (cùng quy tắc Picking List)
  canceledOrderCount: number; // 01/10/2026 — đơn đã hủy (status canceled)
  // 02/10/2026 — kết quả báo "đã đóng gói" lên Lazada; status null = chưa từng gửi
  lazadaPack: {
    status: string | null;
    attemptedAt: Date | null;
    error: string | null;
    items: {
      orderId: string;
      orderItemId: string;
      ok: boolean;
      errorCode: string | null;
      message: string | null;
      packageId: string | null;
      trackingNumber: string | null;
      shipmentProvider: string | null;
    }[];
  };
  fulfillmentStatus: string;
  assignedStaffId: string | null;
  orderPriority: string;
  packagingDeadline: Date | null;
  isOverdue: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// MỚI (29/09/2026, Mục 9.5) — nhóm đơn khác (có thể khác sàn) cùng
// recipient_key, chưa giao xong — dùng cho cảnh báo "lệch nhịp" khi ship.
export interface LinkedPendingGroup {
  id: string;
  fulfillmentStatus: string;
}

// Trạng thái ĐÃ tới hoặc SAU packed — không còn tính là "đang chờ đóng gói".
export const PACKED_OR_LATER_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.PACKED,
  GroupFulfillmentStatus.SHIPPED,
  GroupFulfillmentStatus.DELIVERED,
  GroupFulfillmentStatus.RETURNED,
  GroupFulfillmentStatus.CANCELED,
];

export function toResponse(
  group: OrderGroupDocument,
  counts: GroupOrderCounts,
): OrderGroupResponse {
  return {
    stockShortage: group.stock_shortage === true, // K5
    origin: group.origin ?? 'marketplace',
    sourceReturnId: group.source_return_id?.toString() ?? null,
    stockShortageItems: group.stock_shortage_items ?? [], // K5
    id: group._id.toString(),
    platform: group.platform,
    shopId: group.shop_id,
    orderCount: group.order_count,
    activeOrderCount: counts.activeOrderCount,
    canceledOrderCount: counts.canceledOrderCount,
    lazadaPack: {
      status: group.lazada_pack_status ?? null,
      attemptedAt: group.lazada_pack_attempted_at ?? null,
      error: group.lazada_pack_error ?? null,
      items: (group.lazada_pack_items ?? []).map((i) => ({
        orderId: i.order_id,
        orderItemId: i.order_item_id,
        ok: i.ok,
        errorCode: i.item_err_code ?? null,
        message: i.msg ?? null,
        packageId: i.package_id ?? null,
        trackingNumber: i.tracking_number ?? null,
        shipmentProvider: i.shipment_provider ?? null,
      })),
    },
    fulfillmentStatus: group.fulfillment_status,
    assignedStaffId: group.assigned_staff_id
      ? group.assigned_staff_id.toString()
      : null,
    orderPriority: group.order_priority,
    packagingDeadline: group.packaging_deadline,
    isOverdue: group.is_overdue,
    version: group.__v,
    createdAt: group.created_at ?? new Date(0),
    updatedAt: group.updated_at ?? new Date(0),
  };
}

const NO_ORDERS: GroupOrderCounts = {
  activeOrderCount: 0,
  canceledOrderCount: 0,
};

/** 01/10/2026 — response 1 nhóm đơn kèm số đơn còn hiệu lực / đã hủy (1 truy vấn đếm). */
export async function buildOrderGroupResponse(
  service: OrderGroupsService,
  group: OrderGroupDocument,
): Promise<OrderGroupResponse> {
  const counts = await service.getOrderCountsForGroups([group._id]);
  return toResponse(group, counts.get(group._id.toString()) ?? NO_ORDERS);
}

/** 01/10/2026 — response danh sách nhóm đơn: đếm cho cả danh sách trong 1 truy vấn. */
export async function buildOrderGroupResponses(
  service: OrderGroupsService,
  groups: OrderGroupDocument[],
): Promise<OrderGroupResponse[]> {
  const counts = await service.getOrderCountsForGroups(
    groups.map((g) => g._id),
  );
  return groups.map((g) =>
    toResponse(g, counts.get(g._id.toString()) ?? NO_ORDERS),
  );
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
  constructor(
    private readonly orderGroupsService: OrderGroupsService,
    private readonly lazadaPackSyncService: LazadaPackSyncService, // 02/10/2026
  ) {}

  @Get()
  @Roles(
    UserRole.WAREHOUSE_STAFF,
    UserRole.PACKAGING_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Danh sách Order Group, mới nhất trước — lọc theo fulfillment_status / assigned_staff_id / stock_shortage / is_overdue để mỗi role thấy đúng hàng đợi. Mặc định 100 dòng (tối đa 200); trang kế: ?before=<createdAt dòng cuối>.',
  })
  async list(
    @Query() query: ListOrderGroupsQueryDto,
  ): Promise<OrderGroupResponse[]> {
    const groups = await this.orderGroupsService.listOrderGroups({
      fulfillmentStatus: query.fulfillment_status,
      platform: query.platform,
      orderPriority: query.order_priority,
      assignedStaffId: query.assigned_staff_id,
      stockShortage: query.stock_shortage === undefined ? undefined : query.stock_shortage === 'true',
      isOverdue: query.is_overdue === undefined ? undefined : query.is_overdue === 'true',
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit,
    });
    return buildOrderGroupResponses(this.orderGroupsService, groups);
  }

  @Get(':id')
  @Roles(
    UserRole.WAREHOUSE_STAFF,
    UserRole.PACKAGING_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Chi tiết 1 Order Group — đọc field "version" để dùng cho các API chuyển trạng thái. "linkedGroupCount" (Mục 9.5): số nhóm khác (có thể khác sàn) cùng người nhận, chưa giao xong. "orders" (09/10/2026): các đơn trong nhóm kèm người nhận + món đã gộp (cả đơn đã hủy).',
  })
  async findOne(
    @Param('id') id: string,
  ): Promise<OrderGroupResponse & { linkedGroupCount: number; orders: GroupOrderView[] }> {
    const group = await this.orderGroupsService.findOrderGroupById(id);
    const [linked, orders] = await Promise.all([
      this.orderGroupsService.findLinkedGroups(id),
      this.orderGroupsService.listOrdersInGroup(id),
    ]);
    return {
      ...(await buildOrderGroupResponse(this.orderGroupsService, group)),
      linkedGroupCount: linked.length,
      orders,
    };
  }

  @Get(':id/linked')
  @Roles(
    UserRole.WAREHOUSE_STAFF,
    UserRole.PACKAGING_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'MỚI (Mục 9.5) — Các nhóm đơn KHÁC (có thể khác sàn) cùng người nhận với nhóm này, chưa giao xong. Dùng để hiển thị "Đi cùng: N kiện" và chuẩn bị giao chung chuyến.',
  })
  async linked(@Param('id') id: string): Promise<{ linkedGroups: OrderGroupResponse[] }> {
    const groups = await this.orderGroupsService.findLinkedGroups(id);
    return { linkedGroups: await buildOrderGroupResponses(this.orderGroupsService, groups) };
  }

  @Get(':id/picking-list')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách sản phẩm cần lấy: số đặt + đã quét trong lượt hiện tại (picked_quantity). Số đo chỉ có khi hồ sơ đóng gói đã ready — KHÔNG bắt buộc để lấy hàng. Bản có vị trí kệ: GET /warehouse/:warehouseId/picking-list/:groupId.',
  })
  async pickingList(@Param('id') id: string): Promise<OrderGroupForPicking> {
    return this.orderGroupsService.getPickableItemsForGroup(id);
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
  ): Promise<PickableItem> {
    return this.orderGroupsService.getPickableItemDetail(id, sku);
  }

  @Post(':id/fulfillment/pick-item')
  @SkipThrottle()
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Quét/nhập tay 1 SKU khi lấy hàng — trừ tồn kho ngay (atomic). Gọi NHIỀU LẦN, mỗi lần 1 SKU, TRƯỚC KHI bấm "pick" (xác nhận xong cả nhóm) bên dưới. Dùng client_event_id khi Mobile App offline-sync retry (chống trừ trùng).',
  })
  async pickItem(
    @Param('id') id: string,
    @Body() body: PickItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ sku: string; decrementedBy: number; remainingStock: number }> {
    return this.orderGroupsService.pickItem(
      id,
      body.warehouse_id,
      body.sku,
      body.scanned_quantity,
      body.scan_method,
      body.client_event_id,
      body.bin_location_id, // K3
      user.userId, // K3 — sổ cái
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
    return buildOrderGroupResponse(this.orderGroupsService, group);
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
    const group = await this.orderGroupsService.decidePartial(
      id,
      body.approve,
      body.expected_version,
    );
    return buildOrderGroupResponse(this.orderGroupsService, group);
  }

  @Post(':id/fulfillment/pick')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận ĐÃ LẤY XONG toàn bộ hàng trong Order Group (picking -> picked). Server đối soát mọi SKU đã quét đủ số đặt trong lượt hiện tại; thiếu → 409 ORD_GROUP_PICK_INCOMPLETE (dùng report-missing). Sau bước này hệ thống tự tính kế hoạch đóng gói.',
  })
  async pick(
    @Param('id') id: string,
    @Body() body: TransitionOrderGroupDto,
  ): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.confirmPicked(id, body.expected_version);
    return buildOrderGroupResponse(this.orderGroupsService, group);
  }

  // 🔄 GỘP main + thi_dev (04/10/2026): `POST :id/fulfillment/pack` đã GỠ. Đóng
  // gói xác nhận qua POST /order-groups/:groupId/packing-plan/pack (cân từng
  // kiện, trừ thùng/vật tư theo kế hoạch). Báo "đã đóng gói" lên Lazada
  // (LazadaPackSyncService) được gọi ở đó sau khi commit; route gửi lại bên dưới.

  @Post(':id/lazada-pack/retry')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      '02/10/2026 — Gửi lại "đã đóng gói" lên Lazada cho nhóm đơn đang "packed" mà lần trước chưa thành công (failed / partial / disabled / chưa gửi). Không đổi trạng thái OptiPack.',
  })
  async retryLazadaPack(
    @Param('id') id: string,
  ): Promise<OrderGroupResponse & { lazadaPackSync: LazadaPackSyncResult }> {
    const lazadaPackSync = await this.lazadaPackSyncService.retryGroup(id);
    const group = await this.orderGroupsService.findOrderGroupById(id);
    return {
      ...(await buildOrderGroupResponse(this.orderGroupsService, group)),
      lazadaPackSync,
    };
  }

  @Patch(':id/priority')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đánh dấu đơn Hỏa Tốc/Bình thường — Lazada KHÔNG cung cấp tín hiệu tự động (đã xác minh bằng doc thật), Store Owner/Admin tự tay quyết định. Tự tính packaging_deadline theo giờ hành chính (8h-17h, tính cả Thứ 7).',
  })
  async setPriority(
    @Param('id') id: string,
    @Body() body: SetPriorityDto,
  ): Promise<OrderGroupResponse> {
    const group = await this.orderGroupsService.setPriority(
      id,
      body.order_priority,
      body.deadline_hours,
    );
    return buildOrderGroupResponse(this.orderGroupsService, group);
  }
}

// G1 (27/09/2026) — tên rõ nghĩa khi dùng ngoài file (legacy-fulfillment.controller.ts).
export const toOrderGroupResponse = buildOrderGroupResponse;
// G1 — 3 route POST :id/fulfillment/{ship,deliver,return} đã CHUYỂN sang shipments/legacy-fulfillment.controller.ts (giữ nguyên URL/body/response).
