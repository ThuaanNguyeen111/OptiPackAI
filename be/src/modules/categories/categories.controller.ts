import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryDocument } from './schemas/category.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

interface CategoryResponse {
  code: string;
  name: string;
  parentCode: string | null;
  level: 1 | 2;
  sizeScale: string[];
  isActive: boolean;
}
function toResponse(doc: CategoryDocument): CategoryResponse {
  return { code: doc.code, name: doc.name, parentCode: doc.parent_code, level: doc.level, sizeScale: doc.size_scale, isActive: doc.is_active };
}

/** K2 (26/09/2026) — danh mục sản phẩm 2 cấp. Dùng `code` làm định danh trên URL (dễ đọc, không đổi). */
@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: '🆕 K2 — Cây danh mục (cấp 1 kèm danh sách cấp 2). ?include_inactive=true để thấy cả mục đã tắt.' })
  async listTree(@Query('include_inactive') includeInactive?: string): Promise<(CategoryResponse & { children: CategoryResponse[] })[]> {
    const tree = await this.categoriesService.listTree(includeInactive === 'true');
    return tree.map((n) => ({ ...toResponse(n.category), children: n.children.map(toResponse) }));
  }

  @Get(':code')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: '🆕 K2 — Chi tiết 1 danh mục.' })
  async get(@Param('code') code: string): Promise<CategoryResponse> {
    return toResponse(await this.categoriesService.getByCode(code));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K2 — Tạo danh mục. Không có parent_code = cấp 1; có = cấp 2 (bắt buộc size_scale).' })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return toResponse(await this.categoriesService.create(dto));
  }

  @Patch(':code')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K2 — Sửa tên/thang size. Bỏ size đang được kệ dùng -> 409 CAT_SIZE_IN_USE.' })
  async update(@Param('code') code: string, @Body() dto: UpdateCategoryDto): Promise<CategoryResponse> {
    return toResponse(await this.categoriesService.update(code, dto));
  }

  @Delete(':code')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K2 — Vô hiệu hóa. Chặn nếu còn danh mục con đang bật hoặc ô kệ đang đăng ký.' })
  async deactivate(@Param('code') code: string): Promise<CategoryResponse> {
    return toResponse(await this.categoriesService.deactivate(code));
  }

  @Post(':code/reactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K2 — Kích hoạt lại (danh mục cha phải đang bật).' })
  async reactivate(@Param('code') code: string): Promise<CategoryResponse> {
    return toResponse(await this.categoriesService.reactivate(code));
  }
}
