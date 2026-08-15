import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { isUserRole, UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ForcePasswordChangeGuard } from '../auth/guards/force-password-change.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginatedUsers, UsersService } from './services/users.service';
import { UserDocument } from './schemas/user.schema';


interface PublicUserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  phone?: string;
  address?: string;
  employee_code?: string;
  department?: string;
  mfa_enabled: boolean;
  login_type: string;
  created_at?: Date;
}

function toPublicProfile(user: UserDocument): PublicUserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    phone: user.phone,
    address: user.address,
    employee_code: user.employee_code,
    department: user.department,
    mfa_enabled: user.mfa_enabled,
    login_type: user.login_type,
    created_at: user.created_at,
  };
}

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
      message: 'Tạo tài khoản thành công. Mật khẩu tạm cũng đã được gửi qua email nhân viên.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      temporary_password: temporaryPassword,
    };
  }

  @ApiOperation({ summary: 'Danh sách nhân viên trong hệ thống (có phân trang)' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @Get()
  async findAll(
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedUsers> {

    const roleNumber = role !== undefined ? Number(role) : undefined;
    const roleFilter = roleNumber !== undefined && isUserRole(roleNumber) ? { role: roleNumber } : {};
    return this.usersService.findAll(roleFilter, Number(page) || 1, Number(limit) || 20);
  }


  @ApiOperation({ summary: 'Xem hồ sơ cá nhân của chính mình' })
  @Get('me')
  async getMyProfile(@CurrentUser() user: AuthenticatedUser): Promise<ReturnType<typeof toPublicProfile>> {
    const fullUser = await this.usersService.findById(user.userId);
    return toPublicProfile(fullUser);
  }

  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân (SĐT, địa chỉ, avatar)' })
  @Patch('me')
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ReturnType<typeof toPublicProfile>> {
    const updated = await this.usersService.updateProfile(user.userId, dto);
    return toPublicProfile(updated);
  }

  @ApiOperation({ summary: 'Admin reset mật khẩu hộ nhân viên (sinh mật khẩu tạm mới, cũng dùng để MỞ KHÓA tài khoản bị khóa do quá hạn 72h)' })
  @Roles(UserRole.ADMIN)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
  ): Promise<{ message: string; temporary_password: string }> {
    const { temporaryPassword } = await this.usersService.adminResetPassword(id);
    return {
      message: 'Đã reset mật khẩu. Mật khẩu tạm cũng đã được gửi qua email nhân viên.',
      temporary_password: temporaryPassword,
    };
  }

  @ApiOperation({ summary: 'Admin tắt MFA hộ nhân viên bị khóa (mất điện thoại, hết mã dự phòng)' })
  @Roles(UserRole.ADMIN)
  @Post(':id/disable-mfa')
  async disableMfa(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.adminDisableMfa(id);
    return { message: 'Đã tắt MFA cho tài khoản này. Nhân viên cần setup lại MFA từ đầu nếu muốn bật lại.' };
  }

  @ApiOperation({ summary: 'Admin kích hoạt lại tài khoản đã xóa mềm' })
  @Roles(UserRole.ADMIN)
  @Post(':id/reactivate')
  async reactivate(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.reactivate(id);
    return { message: 'Đã kích hoạt lại tài khoản' };
  }

  @ApiOperation({ summary: 'Admin sửa thông tin 1 nhân viên (tên, role, SĐT, địa chỉ, mã NV, phòng ban)' })
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async adminUpdate(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<ReturnType<typeof toPublicProfile>> {
    const updated = await this.usersService.adminUpdateUser(id, dto);
    return toPublicProfile(updated);
  }

  @ApiOperation({ summary: 'Vô hiệu hóa tài khoản nhân viên (xóa mềm)' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.deactivate(id);
    return { message: 'Đã vô hiệu hóa tài khoản và thu hồi mọi phiên đăng nhập liên quan' };
  }
}
