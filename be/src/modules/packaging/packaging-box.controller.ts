import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackagingBoxService } from './packaging-box.service';
import { CreatePackagingBoxDto, UpdatePackagingBoxDto } from './dto/packaging-box.dto';
import { PackagingBoxDocument } from './schemas/packaging-box.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

interface DimensionsMmResponse {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PackagingBoxResponse {
  id: string;
  code: string;
  name: string;
  inner: DimensionsMmResponse;
  outer: DimensionsMmResponse;
  tareG: number;
  maxLoadG: number;
  priceVnd: number | null;
  isSample: boolean;
  isActive: boolean;
}

function toBoxResponse(doc: PackagingBoxDocument): PackagingBoxResponse {
  return {
    id: doc._id.toString(),
    code: doc.code,
    name: doc.name,
    inner: { lengthMm: doc.inner.length_mm, widthMm: doc.inner.width_mm, heightMm: doc.inner.height_mm },
    outer: { lengthMm: doc.outer.length_mm, widthMm: doc.outer.width_mm, heightMm: doc.outer.height_mm },
    tareG: doc.tare_g,
    maxLoadG: doc.max_load_g,
    priceVnd: doc.price_vnd,
    isSample: doc.is_sample,
    isActive: doc.is_active,
  };
}

@ApiTags('Packaging Boxes')
@ApiBearerAuth('JWT-auth')
@Controller('packaging/boxes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingBoxController {
  constructor(private readonly boxService: PackagingBoxService) {}

  @Get()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiQuery({ name: 'active', required: false, description: 'true (mặc định) = chỉ thùng đang dùng' })
  @ApiOperation({ summary: 'Danh mục thùng carton (đơn vị mm/g).' })
  async list(@Query('active') active?: string): Promise<PackagingBoxResponse[]> {
    const docs = await this.boxService.list(active !== 'false');
    return docs.map(toBoxResponse);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm thùng carton vào danh mục (Admin).' })
  async create(@Body() dto: CreatePackagingBoxDto): Promise<PackagingBoxResponse> {
    return toBoxResponse(await this.boxService.create(dto));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa thùng hoặc ngừng dùng (is_active=false) — Admin.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePackagingBoxDto,
  ): Promise<PackagingBoxResponse> {
    return toBoxResponse(await this.boxService.update(id, dto));
  }
}
