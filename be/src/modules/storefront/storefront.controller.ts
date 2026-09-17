import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CatalogService } from './catalog.service';
import { StorefrontOrdersService } from './storefront-orders.service';
import { AddCartItemDto, CheckoutDto, SyncCartDto } from './dto/storefront.dto';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { StorefrontCartService } from './storefront-cart.service';
import { STOREFRONT_SHOP_ID } from './storefront-canonical-order.service';

type CustomerRequest = Request & { user: { customerId: string } };
@ApiTags('Storefront')
@Controller('storefront')
export class StorefrontController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly orders: StorefrontOrdersService,
    private readonly cart: StorefrontCartService,
    private readonly configService: ConfigService,
  ) {}
  @Get('settings') settings() {
    return {
      platform: 'storefront',
      shop_id: STOREFRONT_SHOP_ID,
      store_name: this.configService.get<string>('storefront.name', 'AURELLE'),
      connected: true,
      connection_type: 'internal',
    };
  }
  @Get('categories') categories() { return this.catalog.categories(); }
  @Get('products') products() { return this.catalog.list(); }
  @Get('products/:slug') product(@Param('slug') slug: string) { return this.catalog.findBySlug(slug); }
  @Get('cart') @UseGuards(CustomerJwtGuard) getCart(@Req() req: CustomerRequest) { return this.cart.get(req.user.customerId); }
  @Post('cart/items') @UseGuards(CustomerJwtGuard) addCartItem(@Req() req: CustomerRequest, @Body() dto: AddCartItemDto) { return this.cart.add(req.user.customerId, dto); }
  @Patch('cart/items/:variantId') @UseGuards(CustomerJwtGuard) updateCartItem(@Req() req: CustomerRequest, @Param('variantId') variantId: string, @Body() dto: AddCartItemDto) { return this.cart.update(req.user.customerId, variantId, dto.quantity); }
  @Delete('cart/items/:variantId') @UseGuards(CustomerJwtGuard) removeCartItem(@Req() req: CustomerRequest, @Param('variantId') variantId: string) { return this.cart.remove(req.user.customerId, variantId); }
  @Delete('cart') @UseGuards(CustomerJwtGuard) clearCart(@Req() req: CustomerRequest) { return this.cart.clear(req.user.customerId); }
  @Post('cart/sync') @UseGuards(CustomerJwtGuard) syncCart(@Req() req: CustomerRequest, @Body() dto: SyncCartDto) { return this.cart.sync(req.user.customerId, dto); }
  @Post('orders/checkout') @UseGuards(CustomerJwtGuard) checkout(@Req() req: CustomerRequest, @Body() dto: CheckoutDto) { return this.orders.checkout(req.user.customerId, dto); }
  @Get('orders') @UseGuards(CustomerJwtGuard) listOrders(@Req() req: CustomerRequest) { return this.orders.list(req.user.customerId); }
  @Get('orders/:id') @UseGuards(CustomerJwtGuard) order(@Req() req: CustomerRequest, @Param('id') id: string) { return this.orders.findOne(req.user.customerId, id); }
}
