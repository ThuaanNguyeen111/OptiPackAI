import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { Features } from '../role-permissions/feature-scope';
import { CreatePrimitiveModelDto, ListModelsQueryDto, UpdateModelDto, UploadModelDto } from './dto/product-model.dto';
import { MAX_MODEL_BYTES, ProductModelsService, toModelResponse, type ModelFileInput } from './product-models.service';

/**
 * AOFP-352 — thư viện mô hình 3D. Cùng phạm vi trang với /product-master (màn Kho + form hồ sơ đóng gói)
 * để role đã lưu quyền trong DB không bị khoá khỏi thư viện.
 * Tải lên / gắn: ai xác nhận được hồ sơ đóng gói. Thay file, đổi thông số hình, ngừng dùng: Admin (Q11).
 */
@ApiTags('product-models')
@ApiBearerAuth()
@Controller('product-models')
@UseGuards(JwtAuthGuard, RolesGuard)
@Features('inventory', 'picking', 'packing', 'orders', 'order_groups', 'packaging_rules')
export class ProductModelsController {
  constructor(private readonly service: ProductModelsService) {}

  @Get()
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách mô hình 3D trong thư viện, kèm số SKU đang dùng.' })
  list(@Query() query: ListModelsQueryDto): ReturnType<ProductModelsService['list']> {
    return this.service.list(query);
  }

  @Get(':id')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Chi tiết mô hình + danh sách SKU đang dùng.' })
  detail(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.service.detail(id);
  }

  @Post('primitive')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo mô hình dựng từ hình cơ bản (hộp / trụ / chai / tuýp).' })
  async createPrimitive(@Body() dto: CreatePrimitiveModelDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toModelResponse(await this.service.createPrimitive(dto, user.userId), 0);
  }

  @Post('upload')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải file GLB (≤ 10 MB) lên thư viện; server kiểm tra đơn vị và rig quần áo.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MODEL_BYTES, files: 1 } }))
  async upload(
    @UploadedFile() file: ModelFileInput | undefined,
    @Body() dto: UploadModelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return toModelResponse(await this.service.upload(file, dto, user.userId), 0);
  }

  @Patch(':id')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa tên / nguồn; đổi thông số hình cơ bản (chỉ Admin — đổi hình của mọi SKU đang dùng).' })
  async update(@Param('id') id: string, @Body() dto: UpdateModelDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const touchesShape = dto.params !== undefined || dto.body_color !== undefined || dto.cap_color !== undefined;
    if (touchesShape && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ Admin được đổi thông số hình — thay đổi áp cho mọi SKU đang dùng mô hình.');
    }
    return toModelResponse(await this.service.update(id, dto, user.userId));
  }

  @Put(':id/file')
  @Roles(UserRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Admin thay file GLB — mọi SKU đang dùng đổi hình, kế hoạch đã lưu giữ hình cũ.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MODEL_BYTES, files: 1 } }))
  async replaceFile(
    @Param('id') id: string,
    @UploadedFile() file: ModelFileInput | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return toModelResponse(await this.service.replaceFile(id, file, user.userId));
  }

  @Post(':id/retire')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ngừng dùng: ẩn khỏi danh sách chọn, SKU đang dùng vẫn hợp lệ.' })
  async retire(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toModelResponse(await this.service.setStatus(id, 'retired', user.userId));
  }

  @Post(':id/restore')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Dùng lại mô hình đã ngừng dùng.' })
  async restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toModelResponse(await this.service.setStatus(id, 'active', user.userId));
  }
}
