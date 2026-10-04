import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrderReturnsService } from './order-returns.service';
import { ReceiveReturnDto } from './dto/receive-return.dto';
import type { ReturnReceiptDocument } from './schemas/return-receipt.schema';

export interface ReturnReceiptResponse {
  id: string;
  orderGroupId: string;
  warehouseId: string;
  lines: {
    sku: string;
    goodQuantity: number;
    damagedQuantity: number;
    note: string | null;
  }[];
  totalGood: number;
  totalDamaged: number;
  receivedBy: string;
  note: string | null;
  createdAt: Date | null;
}

function toResponse(doc: ReturnReceiptDocument): ReturnReceiptResponse {
  return {
    id: doc._id.toString(),
    orderGroupId: doc.order_group_id.toString(),
    warehouseId: doc.warehouse_id.toString(),
    lines: doc.lines.map((l) => ({
      sku: l.seller_sku,
      goodQuantity: l.good_quantity,
      damagedQuantity: l.damaged_quantity,
      note: l.note,
    })),
    totalGood: doc.total_good,
    totalDamaged: doc.total_damaged,
    receivedBy: doc.received_by.toString(),
    note: doc.note,
    createdAt: doc.created_at ?? null,
  };
}

@ApiTags('Order Groups — Hàng hoàn')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderReturnsController {
  constructor(private readonly returnsService: OrderReturnsService) {}

  @Post(':id/fulfillment/return-receive')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Kho NHẬN hàng hoàn của nhóm đã `returned`: kiểm chất lượng từng SKU, số đạt được nhập lại tồn kho (cùng transaction), số hỏng chỉ ghi nhận. Mỗi nhóm nhận hoàn 1 lần.',
  })
  async receive(
    @Param('id') id: string,
    @Body() body: ReceiveReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReturnReceiptResponse> {
    return toResponse(
      await this.returnsService.receiveReturn(id, user.userId, body),
    );
  }

  @Get(':id/return-receipt')
  @Roles(
    UserRole.WAREHOUSE_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Biên nhận hàng hoàn của nhóm (null nếu chưa nhận).',
  })
  async get(
    @Param('id') id: string,
  ): Promise<{ receipt: ReturnReceiptResponse | null }> {
    const doc = await this.returnsService.getReceipt(id);
    return { receipt: doc ? toResponse(doc) : null };
  }
}
