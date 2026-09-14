import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService, SyncResult } from './orders.service';
import { SyncLazadaOrdersQueryDto } from './dto/sync-lazada-orders-query.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderStatus } from './enums/order-status.enum';
import { aggregateOrderItems, AggregatedOrderItemView } from './utils/aggregate-order-items.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

// Hình dạng response public — KHÔNG trả thẳng OrderDocument ra ngoài
// (tránh lộ field nội bộ như __v, Mongoose internals). Cùng nguyên tắc
// "response tối thiểu" đã áp dụng ở marketplace-integration.controller.ts.
interface OrderResponse {
  id: string;
  platform: string;
  shopId: string;
  platformOrderId: string;
  platformOrderNumber?: string;
  status: OrderStatus;
  recipientName: string;
  recipientCity: string;
  isConsolidated: boolean;
  consolidatedGroupId: string | null;
  totalAmount: number;
  currency: string;
  itemCount: number;
  createdAt: Date;
}

// GET /orders/:id trả THÊM những gì list không cần (địa chỉ đầy đủ,
// items đã gộp theo SKU) — tách interface riêng thay vì "OrderResponse
// + optional fields", để FE biết CHẮC CHẮN field nào luôn có ở endpoint
// nào (tường minh theo đúng yêu cầu, không dùng optional để né việc
// khai rõ 2 hình dạng response khác nhau).
interface OrderDetailResponse extends OrderResponse {
  recipientPhone: string;
  recipientAddressLine1: string;
  recipientAddressLine2: string | null;
  recipientPostalCode: string | null;
  recipientCountry: string;
  items: AggregatedOrderItemView[];
}

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('lazada/sync')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Kích hoạt tay 1 lần đồng bộ đơn từ Lazada cho 1 shop đã kết nối — dùng để demo Mainflow 1 (GetOrders → GetOrderItems → chuẩn hóa → check gộp đơn → lưu Mongo)',
  })
  async syncLazada(@Query() query: SyncLazadaOrdersQueryDto): Promise<SyncResult> {
    return this.ordersService.syncLazadaOrders(query.shop_id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Danh sách đơn đã đồng bộ, phân trang kiểu cursor theo created_at' })
  async list(
    @Query() query: ListOrdersQueryDto,
  ): Promise<{ orders: OrderResponse[]; nextCursor: string | null }> {
    const { orders, nextCursor } = await this.ordersService.listOrders({
      shopId: query.shop_id,
      status: query.status,
      consolidatedGroupId: query.consolidated_group_id,
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit ?? 20,
    });

    return {
      orders: orders.map((order) => ({
        id: order._id.toString(),
        platform: order.platform,
        shopId: order.shop_id,
        platformOrderId: order.platform_order_id,
        platformOrderNumber: order.platform_order_number,
        status: order.status,
        recipientName: order.recipient.full_name,
        recipientCity: order.recipient.city,
        isConsolidated: order.is_consolidated,
        consolidatedGroupId: order.consolidated_group_id ? order.consolidated_group_id.toString() : null,
        totalAmount: order.total_amount,
        currency: order.currency,
        itemCount: order.items.length,
        createdAt: order.created_at ?? new Date(0),
      })),
      nextCursor,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({
    summary:
      'Chi tiết 1 đơn hàng, bao gồm sản phẩm (đã gộp theo SKU+trạng thái) và địa chỉ đầy đủ — dùng cho màn hình chi tiết đơn của FE',
  })
  async findOne(@Param('id') id: string): Promise<OrderDetailResponse> {
    const order = await this.ordersService.findOrderDetail(id);

    return {
      id: order._id.toString(),
      platform: order.platform,
      shopId: order.shop_id,
      platformOrderId: order.platform_order_id,
      platformOrderNumber: order.platform_order_number,
      status: order.status,
      recipientName: order.recipient.full_name,
      recipientPhone: order.recipient.phone,
      recipientAddressLine1: order.recipient.address_line1,
      recipientAddressLine2: order.recipient.address_line2 ?? null,
      recipientCity: order.recipient.city,
      recipientPostalCode: order.recipient.postal_code ?? null,
      recipientCountry: order.recipient.country,
      isConsolidated: order.is_consolidated,
      consolidatedGroupId: order.consolidated_group_id ? order.consolidated_group_id.toString() : null,
      totalAmount: order.total_amount,
      currency: order.currency,
      itemCount: order.items.length,
      items: aggregateOrderItems(order.items),
      createdAt: order.created_at ?? new Date(0),
    };
  }
}
