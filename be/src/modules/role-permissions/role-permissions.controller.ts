import { Body, Controller, Get, HttpStatus, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/exceptions/app-exception';
import { CONFIGURABLE_ROLES, DEFAULT_ROLE_FEATURES, type Feature, FEATURE_VALUES } from '../../common/enums/feature.enum';
import { isUserRole, UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { type RoleFeatureMatrix, RolePermissionsService } from './role-permissions.service';

export interface RolePermissionsResponse {
  features: readonly Feature[];
  roles: readonly UserRole[];
  matrix: RoleFeatureMatrix;
  defaults: Readonly<Record<string, readonly Feature[]>>;
}

export interface MyPermissionsResponse {
  role: UserRole;
  features: Feature[];
}

@ApiTags('Role permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('role-permissions')
export class RolePermissionsController {
  constructor(private readonly service: RolePermissionsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Các trang role của tôi được vào (Admin: tất cả). FE dùng để dựng menu + chặn route.' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MyPermissionsResponse> {
    return { role: user.role, features: await this.service.getFeatures(user.role) };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ma trận trang × role đang áp dụng + mặc định (Admin).' })
  async matrix(): Promise<RolePermissionsResponse> {
    return {
      features: FEATURE_VALUES,
      roles: CONFIGURABLE_ROLES,
      matrix: await this.service.getMatrix(),
      defaults: DEFAULT_ROLE_FEATURES,
    };
  }

  @Put(':role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Đặt lại toàn bộ trang được bật cho 1 role (không áp dụng cho ADMIN). Chặn cả API của trang bị tắt.' })
  async update(
    @Param('role', ParseIntPipe) role: number,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RolePermissionsResponse> {
    if (!isUserRole(role)) {
      throw new AppException('AUTH_ROLE_INVALID', 'Vai trò không tồn tại', HttpStatus.BAD_REQUEST);
    }
    const matrix = await this.service.setFeatures(role, dto.features, user.userId);
    return { features: FEATURE_VALUES, roles: CONFIGURABLE_ROLES, matrix, defaults: DEFAULT_ROLE_FEATURES };
  }
}
