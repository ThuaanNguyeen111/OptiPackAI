import { Body, Controller, Delete, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SaveAdminProductDto } from './dto/storefront-admin.dto';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';
import { StorefrontAdminService } from './storefront-admin.service';
import type { AdminCatalogProduct } from './storefront-admin.service';

@ApiTags('Storefront Admin')
@Controller('storefront/admin/products')
@UseGuards(StorefrontAdminOriginGuard, StorefrontAdminGuard)
export class StorefrontAdminController {
  constructor(private readonly products: StorefrontAdminService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(): Promise<AdminCatalogProduct[]> { return this.products.list(); }
  @Get(':id') @Header('Cache-Control', 'no-store')
  findOne(@Param('id') id: string): Promise<AdminCatalogProduct> { return this.products.findOne(id); }
  @Post() @Header('Cache-Control', 'no-store')
  create(@Body() dto: SaveAdminProductDto): Promise<AdminCatalogProduct> { return this.products.save(dto); }
  @Patch(':id') @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() dto: SaveAdminProductDto): Promise<AdminCatalogProduct> { return this.products.save(dto, id); }
  @Delete(':id') @Header('Cache-Control', 'no-store')
  remove(@Param('id') id: string): Promise<{ message: string }> { return this.products.remove(id); }
}
