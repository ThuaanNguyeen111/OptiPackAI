import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { TransitionOrderGroupDto } from '../order-groups/dto/transition-order-group.dto';
import {
  OrderGroupResponse,
  toOrderGroupResponse,
} from '../order-groups/order-groups.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * G1 (27/09/2026) — 3 route CŨ giữ NGUYÊN đường dẫn, body, response, quyền —
 * FE đang gọi không gãy. Được CHUYỂN từ OrderGroupsController sang đây để mọi
 * lần bấm đều đi qua vận đơn (nếu để 2 nơi cùng đổi trạng thái giao hàng thì
 * nhóm đơn và vận đơn sẽ lệch nhau). Đặt ở module shipments để tránh phụ thuộc
 * vòng (shipments -> order-groups, không có chiều ngược lại).
 * ⚠️ Lỗi thời — FE mới dùng /shipments/*.
 */
@ApiTags('Order Groups (legacy fulfillment)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('order-groups')
export class LegacyFulfillmentController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  @Post(':id/fulfillment/ship')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    deprecated: true,
    summary:
      '(Cũ) packed -> shipped. Nay tạo vận đơn out_for_delivery. Dùng POST /shipments.',
  })
  async ship(
    @Param('id') id: string,
    @Body() body: TransitionOrderGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderGroupResponse> {
    await this.shipmentsService.startDelivery(
      id,
      { userId: user.userId, role: user.role },
      'Qua route cũ fulfillment/ship',
      body.expected_version,
    );
    return toOrderGroupResponse(
      this.orderGroupsService,
      await this.orderGroupsService.findOrderGroupById(id),
    );
  }

  @Post(':id/fulfillment/deliver')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    deprecated: true,
    summary:
      '(Cũ) shipped -> delivered. Nay đi qua vận đơn. Dùng POST /shipments/:id/deliver.',
  })
  async deliver(
    @Param('id') id: string,
    @Body() body: TransitionOrderGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderGroupResponse> {
    await this.shipmentsService.legacyDeliver(id, body.expected_version, {
      userId: user.userId,
      role: user.role,
    });
    return toOrderGroupResponse(
      this.orderGroupsService,
      await this.orderGroupsService.findOrderGroupById(id),
    );
  }

  @Post(':id/fulfillment/return')
  @Roles(
    UserRole.SHIPPING_COORDINATOR,
    UserRole.WAREHOUSE_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    deprecated: true,
    summary:
      '(Cũ) shipped/delivered -> returned. Nay ghi lịch sử vận đơn. Dùng luồng /shipments.',
  })
  async returnGroup(
    @Param('id') id: string,
    @Body() body: TransitionOrderGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderGroupResponse> {
    await this.shipmentsService.legacyReturn(id, body.expected_version, {
      userId: user.userId,
      role: user.role,
    });
    return toOrderGroupResponse(
      this.orderGroupsService,
      await this.orderGroupsService.findOrderGroupById(id),
    );
  }
}
