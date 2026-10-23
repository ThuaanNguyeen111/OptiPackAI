import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { HistoryQueryDto } from './dto/history-query.dto';
import { HistoryService } from './history.service';

const ALL_ROLES = [UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.SHIPPING_COORDINATOR];

/**
 * 23/10/2026 — Xem lại lịch sử thao tác. Mọi vai trò đều dùng được; mỗi vai trò chỉ thấy
 * các loại việc thuộc phần mình (Admin: tất cả; Store Owner: tất cả trừ đăng nhập;
 * Kho: đơn, lấy hàng, kho, trả hàng, vật liệu; Đóng gói: đơn, lấy hàng, đóng gói, vật liệu;
 * Điều phối vận chuyển: đơn, vận chuyển, trả hàng).
 */
@ApiTags('History')
@ApiBearerAuth('JWT-auth')
@Controller('history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Lịch sử thao tác (mới → cũ), lọc theo loại/ngày/người/SKU/đơn; phân trang bằng `before` = `nextBefore` của trang trước. 403 khi lọc loại vai trò không được xem.' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: HistoryQueryDto) {
    return this.history.list(user, query);
  }

  @Get('categories')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Các loại lịch sử vai trò hiện tại được xem (dựng bộ lọc trên FE).' })
  categories(@CurrentUser() user: AuthenticatedUser) {
    return this.history.allowedCategories(user.role);
  }

  @Get('order-groups/:id/timeline')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Dòng thời gian đầy đủ của 1 nhóm đơn (cũ → mới): đơn về, đổi trạng thái, lấy hàng, đóng gói, vận chuyển (hãng, mã, người nhận), trả/hoàn, nhập lại kệ.' })
  timeline(@Param('id') id: string) {
    return this.history.timeline(id);
  }

  @Get('export')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="lich-su-thao-tac.csv"')
  @ApiOperation({ summary: 'Xuất CSV (Excel) theo cùng bộ lọc, tối đa 5.000 dòng.' })
  export(@CurrentUser() user: AuthenticatedUser, @Query() query: HistoryQueryDto): Promise<string> {
    return this.history.exportCsv(user, query);
  }
}
