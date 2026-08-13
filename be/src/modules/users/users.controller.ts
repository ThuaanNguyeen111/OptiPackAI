import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { isUserRole, UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ForcePasswordChangeGuard } from '../auth/guards/force-password-change.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginatedUsers, UsersService } from './services/users.service';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Admin tạo tài khoản nhân viên mới' })
  @Roles(UserRole.ADMIN)
  @Post()
  async create(
    @Body() createDto: CreateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<{
    message: string;
    user: { id: string; name: string; email: string; role: UserRole };
    temporary_password: string;
  }> {
    const { user, temporaryPassword } = await this.usersService.createByAdmin(
      createDto,
      admin.userId,
    );
    return {
      message: 'Tạo tài khoản thành công. Gửi mật khẩu tạm này cho nhân viên qua kênh an toàn.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      temporary_password: temporaryPassword,
    };
  }

  @ApiOperation({ summary: 'Danh sách nhân viên trong hệ thống (có phân trang)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get()
  async findAll(
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedUsers> {
    //!=============================================
    // FIX: validate query string thành UserRole THẬT bằng isUserRole()
    // trước khi truyền xuống Service — không đưa string thô vào Mongoose
    // query nữa (khớp với type mới của UsersService.findAll).
    //!=============================================
    const roleFilter = role && isUserRole(role) ? { role } : {};
    return this.usersService.findAll(roleFilter, Number(page) || 1, Number(limit) || 20);
  }

  @ApiOperation({ summary: 'Admin reset mật khẩu hộ nhân viên (sinh mật khẩu tạm mới)' })
  @Roles(UserRole.ADMIN)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
  ): Promise<{ message: string; temporary_password: string }> {
    const { temporaryPassword } = await this.usersService.adminResetPassword(id);
    return {
      message: 'Đã reset mật khẩu. Gửi mật khẩu tạm này cho nhân viên qua kênh an toàn.',
      temporary_password: temporaryPassword,
    };
  }

  @ApiOperation({ summary: 'Vô hiệu hóa tài khoản nhân viên (xóa mềm)' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.deactivate(id);
    return { message: 'Đã vô hiệu hóa tài khoản và thu hồi mọi phiên đăng nhập liên quan' };
  }
}
