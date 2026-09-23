import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackagingBagService } from './packaging-bag.service';
import { CreatePackagingBagDto, UpdatePackagingBagDto } from './dto/packaging-bag.dto';
import { PackagingBagDocument } from './schemas/packaging-bag.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

export interface PackagingBagResponse {
  id: string;
  code: string;
  name: string;
  widthMm: number;
  lengthMm: number;
  priceVnd: number | null;
  isSample: boolean;
  isActive: boolean;
}

function toBagResponse(doc: PackagingBagDocument): PackagingBagResponse {
  return {
    id: doc._id.toString(),
    code: doc.code,
    name: doc.name,
    widthMm: doc.width_mm,
    lengthMm: doc.length_mm,
    priceVnd: doc.price_vnd,
    isSample: doc.is_sample,
    isActive: doc.is_active,
  };
}

@ApiTags('Packaging Bags')
@ApiBearerAuth('JWT-auth')
@Controller('packaging/bags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingBagController {
  constructor(private readonly bagService: PackagingBagService) {}

  @Get()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiQuery({ name: 'active', required: false, description: 'true (mặc định) = chỉ túi đang dùng' })
  @ApiOperation({ summary: 'Danh mục túi zip bọc hàng (kích thước trải phẳng, mm).' })
  async list(@Query('active') active?: string): Promise<PackagingBagResponse[]> {
    const docs = await this.bagService.list(active !== 'false');
    return docs.map(toBagResponse);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm túi zip vào danh mục (Admin).' })
  async create(@Body() dto: CreatePackagingBagDto): Promise<PackagingBagResponse> {
    return toBagResponse(await this.bagService.create(dto));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa túi zip hoặc ngừng dùng (is_active=false) — Admin.' })
  async update(@Param('id') id: string, @Body() dto: UpdatePackagingBagDto): Promise<PackagingBagResponse> {
    return toBagResponse(await this.bagService.update(id, dto));
  }
}
