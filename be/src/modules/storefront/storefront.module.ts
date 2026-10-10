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
import { StorefrontSeedService } from './storefront-seed.service';
import { Customer, CustomerAddress, CustomerAddressSchema, CustomerSchema, StorefrontCart, StorefrontCartItem, StorefrontCartItemSchema, StorefrontCartSchema, StorefrontCategory, StorefrontCategorySchema, StorefrontCounter, StorefrontCounterSchema, StorefrontInventoryStock, StorefrontInventoryStockSchema, StorefrontOrder, StorefrontOrderItem, StorefrontOrderItemSchema, StorefrontOrderSchema, StorefrontPayment, StorefrontPaymentSchema, StorefrontProduct, StorefrontProductSchema, StorefrontProductVariant, StorefrontProductVariantSchema, StorefrontShipment, StorefrontShipmentSchema } from './schemas/storefront.schema';
import { StorefrontCartService } from './storefront-cart.service';
import { AurelleWebhookPublisher } from './aurelle-webhook.publisher';

@Module({
  imports: [ConfigModule, JwtModule.register({}), MongooseModule.forFeature([
    { name: Customer.name, schema: CustomerSchema }, { name: CustomerAddress.name, schema: CustomerAddressSchema }, { name: StorefrontCart.name, schema: StorefrontCartSchema }, { name: StorefrontCartItem.name, schema: StorefrontCartItemSchema }, { name: StorefrontCategory.name, schema: StorefrontCategorySchema }, { name: StorefrontProduct.name, schema: StorefrontProductSchema }, { name: StorefrontProductVariant.name, schema: StorefrontProductVariantSchema }, { name: StorefrontInventoryStock.name, schema: StorefrontInventoryStockSchema }, { name: StorefrontOrder.name, schema: StorefrontOrderSchema }, { name: StorefrontOrderItem.name, schema: StorefrontOrderItemSchema }, { name: StorefrontPayment.name, schema: StorefrontPaymentSchema }, { name: StorefrontShipment.name, schema: StorefrontShipmentSchema },
    { name: StorefrontCounter.name, schema: StorefrontCounterSchema },
  ])],
  controllers: [StorefrontController, CustomerAuthController],
  providers: [CatalogService, CustomerAuthService, CustomerJwtStrategy, StorefrontOrdersService, StorefrontCartService, StorefrontSeedService, AurelleWebhookPublisher],
})
export class StorefrontModule {}
