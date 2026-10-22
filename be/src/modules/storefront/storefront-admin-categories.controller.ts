import { Body, Controller, Delete, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SaveAdminCategoryDto } from './dto/storefront-admin.dto';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';
import { StorefrontAdminService } from './storefront-admin.service';
import type { AdminCategory } from './storefront-admin.service';

/**
 * 22/10/2026 — CRUD danh mục hiển thị của website AURELLE. Mỗi danh mục có thể nối 1 danh mục
 * CẤP 2 của OptiPack (`skuCategoryCode`) — sản phẩm trong danh mục đó dùng đúng mã này làm phần
 * đầu SKU, nên cây danh mục website và mã kho OptiPack không lệch nhau. Xoá = ẩn (soft).
 */
@ApiTags('Storefront Admin')
@Controller('storefront/admin/categories')
@UseGuards(StorefrontAdminOriginGuard, StorefrontAdminGuard)
export class StorefrontAdminCategoriesController {
  constructor(private readonly admin: StorefrontAdminService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(): Promise<AdminCategory[]> { return this.admin.listCategories(); }
  @Post() @Header('Cache-Control', 'no-store')
  create(@Body() dto: SaveAdminCategoryDto): Promise<AdminCategory> { return this.admin.saveCategory(dto); }
  @Patch(':id') @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() dto: SaveAdminCategoryDto): Promise<AdminCategory> { return this.admin.saveCategory(dto, id); }
  @Delete(':id') @Header('Cache-Control', 'no-store')
  remove(@Param('id') id: string): Promise<{ message: string }> { return this.admin.removeCategory(id); }
}
