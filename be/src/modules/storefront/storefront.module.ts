import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { CatalogService } from './catalog.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { StorefrontController } from './storefront.controller';
import { StorefrontOrdersService } from './storefront-orders.service';
import { StorefrontReturnsService } from './storefront-returns.service';
import { StorefrontSeedService } from './storefront-seed.service';
import { Customer, CustomerAddress, CustomerAddressSchema, CustomerSchema, StorefrontCart, StorefrontCartItem, StorefrontCartItemSchema, StorefrontCartSchema, StorefrontCategory, StorefrontCategorySchema, StorefrontCounter, StorefrontCounterSchema, StorefrontInventoryStock, StorefrontInventoryStockSchema, StorefrontOrder, StorefrontOrderItem, StorefrontOrderItemSchema, StorefrontOrderSchema, StorefrontPayment, StorefrontPaymentSchema, StorefrontProduct, StorefrontProductSchema, StorefrontProductVariant, StorefrontProductVariantSchema, StorefrontShipment, StorefrontShipmentSchema, StorefrontOrderEvent, StorefrontOrderEventSchema, StorefrontReturnRequest, StorefrontReturnRequestSchema } from './schemas/storefront.schema';
import { StorefrontCartService } from './storefront-cart.service';
import { AurelleWebhookPublisher } from './aurelle-webhook.publisher';
import { StorefrontAdminAuthController } from './storefront-admin-auth.controller';
import { StorefrontAdminAuthService } from './storefront-admin-auth.service';
import { StorefrontAdminController } from './storefront-admin.controller';
import { StorefrontAdminCategoriesController } from './storefront-admin-categories.controller';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';
import { StorefrontAdminService } from './storefront-admin.service';
import { StorefrontImagesController } from './storefront-images.controller';
import { StorefrontImage, StorefrontImageSchema } from './schemas/storefront.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Color, ColorSchema } from '../master-skus/schemas/color.schema';

@Module({
  imports: [ConfigModule, JwtModule.register({}), MongooseModule.forFeature([
    { name: Customer.name, schema: CustomerSchema }, { name: CustomerAddress.name, schema: CustomerAddressSchema }, { name: StorefrontCart.name, schema: StorefrontCartSchema }, { name: StorefrontCartItem.name, schema: StorefrontCartItemSchema }, { name: StorefrontCategory.name, schema: StorefrontCategorySchema }, { name: StorefrontProduct.name, schema: StorefrontProductSchema }, { name: StorefrontProductVariant.name, schema: StorefrontProductVariantSchema }, { name: StorefrontInventoryStock.name, schema: StorefrontInventoryStockSchema }, { name: StorefrontOrder.name, schema: StorefrontOrderSchema }, { name: StorefrontOrderItem.name, schema: StorefrontOrderItemSchema }, { name: StorefrontPayment.name, schema: StorefrontPaymentSchema }, { name: StorefrontShipment.name, schema: StorefrontShipmentSchema },
    { name: StorefrontCounter.name, schema: StorefrontCounterSchema },
    { name: StorefrontOrderEvent.name, schema: StorefrontOrderEventSchema },
    { name: StorefrontReturnRequest.name, schema: StorefrontReturnRequestSchema },
    { name: StorefrontImage.name, schema: StorefrontImageSchema },
    // 22/10/2026 — chỉ ĐỌC danh mục cấp 2 + màu của OptiPack để SKU website theo đúng quy tắc
    // OptiPack (bản demo chung DB; tách AURELLE riêng thì đổi thành gọi API danh mục).
    { name: Category.name, schema: CategorySchema },
    { name: Color.name, schema: ColorSchema },
  ])],
  controllers: [StorefrontController, CustomerAuthController, StorefrontAdminAuthController, StorefrontAdminController, StorefrontAdminCategoriesController, StorefrontImagesController],
  providers: [CatalogService, CustomerAuthService, CustomerJwtStrategy, StorefrontOrdersService, StorefrontReturnsService, StorefrontCartService, StorefrontSeedService, AurelleWebhookPublisher, StorefrontAdminAuthService, StorefrontAdminGuard, StorefrontAdminOriginGuard, StorefrontAdminService],
})
export class StorefrontModule {}
