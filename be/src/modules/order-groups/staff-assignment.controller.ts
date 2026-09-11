import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StaffAssignmentService } from './staff-assignment.service';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { OrderGroupDocument } from './schemas/order-group.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

interface StaffWithWorkload {
  staffId: string;
  fullName: string;
  email: string;
  activeWorkload: number;
}

/**
 * ===================================================================
 * staff-assignment.controller.ts — MỚI (2026-09-10)
 * ===================================================================
 * AUTO không khóa cứng — Admin VÀ chính Warehouse Staff đều gọi được
 * POST .../assign để đổi tay bất kỳ lúc nào, không chỉ Admin.
 * ===================================================================
 */
@ApiTags('Staff Assignment')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffAssignmentController {
  constructor(private readonly staffAssignmentService: StaffAssignmentService) {}

  @Post(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      'Phân công Warehouse Staff cho 1 Order Group. Không truyền staff_id = tự động (Least-Busy, ít việc nhất). Truyền staff_id = đổi tay, ghi đè kết quả auto bất kỳ lúc nào.',
  })
  async assign(@Param('id') id: string, @Body() body: AssignStaffDto): Promise<OrderGroupDocument> {
    return body.staff_id
      ? this.staffAssignmentService.manualAssign(id, body.staff_id)
      : this.staffAssignmentService.autoAssign(id);
  }

  @Get('staff/search')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiQuery({ name: 'q', required: false, description: 'Tìm theo tên hoặc email' })
  @ApiOperation({
    summary:
      'Danh sách Warehouse Staff kèm số việc đang xử lý (workload real-time) — dùng cho màn hình chọn tay khi Admin/Warehouse Staff muốn đổi phân công.',
  })
  async searchStaff(@Query('q') q?: string): Promise<StaffWithWorkload[]> {
    return this.staffAssignmentService.listStaffWithWorkload(UserRole.WAREHOUSE_STAFF, q);
  }
}
