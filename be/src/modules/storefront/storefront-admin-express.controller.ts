import { Body, Controller, Delete, Get, Header, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateExpressWardsDto } from './dto/storefront.dto';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';
import { StorefrontExpressService, type ExpressOrderRow } from './storefront-express.service';

/** 29/10/2026 — Admin AURELLE: phường được giao hỏa tốc + theo dõi đơn hỏa tốc (nhãn "Trễ"). */
@ApiTags('Storefront Admin')
@Controller('storefront/admin/express')
@UseGuards(StorefrontAdminOriginGuard, StorefrontAdminGuard)
export class StorefrontAdminExpressController {
  constructor(private readonly express: StorefrontExpressService) {}

  @Get('wards') @Header('Cache-Control', 'no-store')
  wards(): Promise<{ wards: string[]; isDefault: boolean }> { return this.express.wards(); }

  @Put('wards') @Header('Cache-Control', 'no-store')
  updateWards(@Body() dto: UpdateExpressWardsDto): Promise<{ wards: string[]; isDefault: boolean }> { return this.express.updateWards(dto.wards); }

  @Delete('wards') @Header('Cache-Control', 'no-store')
  resetWards(): Promise<{ wards: string[]; isDefault: boolean }> { return this.express.resetWards(); }

  @Get('orders') @Header('Cache-Control', 'no-store')
  orders(@Query('days') days?: string): Promise<ExpressOrderRow[]> { return this.express.listExpressOrders(Number(days) || 7); }
}
