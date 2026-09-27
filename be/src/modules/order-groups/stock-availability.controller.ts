import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StockReservationService } from './stock-reservation.service';
import { OrderGroupsService } from './order-groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

/** K5 (27/09/2026) — tồn khả dụng + giữ chỗ của nhóm đơn. */
@ApiTags('Stock Availability (K5)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class StockAvailabilityController {
  constructor(
    private readonly reservations: StockReservationService,
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  @Get('stock-availability')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Tồn thực / đã giữ / khả dụng của 1 SKU sàn (tự tra SKU nội bộ nếu đã nối). ?platform&shop_id&seller_sku' })
  availability(
    @Query('platform') platform: MarketplacePlatform,
    @Query('shop_id') shopId: string,
    @Query('seller_sku') sellerSku: string,
  ): ReturnType<StockReservationService['availability']> {
    return this.reservations.availability(platform, shopId, sellerSku);
  }

  @Get('order-groups/:id/stock-reservation')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Chi tiết giữ chỗ của nhóm đơn theo từng SKU.' })
  async list(@Param('id') id: string): Promise<Record<string, unknown>[]> {
    await this.orderGroupsService.findOrderGroupById(id);
    return (await this.reservations.listForGroup(id)).map((r) => ({
      sellerSku: r.seller_sku, masterSku: r.master_sku, stockKey: r.stock_key, status: r.status,
      quantityNeeded: r.quantity_needed, quantityPicked: r.quantity_picked, quantityReserved: r.quantity_reserved,
      shortage: Math.max(0, r.quantity_needed - r.quantity_picked - r.quantity_reserved),
    }));
  }

  @Post('order-groups/:id/stock-reservation/recheck')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Tính lại giữ chỗ (VD vừa nhập thêm hàng cho nhóm đơn đang thiếu).' })
  async recheck(@Param('id') id: string): Promise<{ stockShortage: boolean; stockShortageItems: unknown[] }> {
    await this.orderGroupsService.reconcileReservation(id);
    const g = await this.orderGroupsService.findOrderGroupById(id);
    return { stockShortage: g.stock_shortage === true, stockShortageItems: g.stock_shortage_items ?? [] };
  }

  @Post('order-groups/:id/stock-reservation/release')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Nhả toàn bộ giữ chỗ của nhóm đơn (VD nhóm đơn bị hủy/treo).' })
  async release(@Param('id') id: string): Promise<{ releasedUnits: number }> {
    await this.orderGroupsService.findOrderGroupById(id);
    return { releasedUnits: await this.orderGroupsService.releaseReservation(id) };
  }
}
