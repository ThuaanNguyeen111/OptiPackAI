import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MarketplaceShop,
  MarketplaceShopSchema,
} from './schemas/marketplace-shop.schema';
import {
  MarketplaceOauthState,
  MarketplaceOauthStateSchema,
} from './schemas/marketplace-oauth-state.schema';
import { MarketplaceIntegrationService } from './marketplace-integration.service';
import { MarketplaceIntegrationController } from './marketplace-integration.controller';
import { MARKETPLACE_ADAPTERS } from './interfaces/marketplace-adapter.interface';
import { MarketplacePlatform } from './enums/platform.enum';
import { LazadaAdapter } from './adapters/lazada.adapter';
import { AurelleAdapter } from './adapters/aurelle.adapter';
// import { TikTokShopAdapter } from './adapters/tiktok-shop.adapter';
// import { TikiAdapter } from './adapters/tiki.adapter';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketplaceShop.name, schema: MarketplaceShopSchema },
      { name: MarketplaceOauthState.name, schema: MarketplaceOauthStateSchema },
    ]),
  ],
  controllers: [MarketplaceIntegrationController],
  providers: [
    MarketplaceIntegrationService,
    LazadaAdapter,
    AurelleAdapter,

    {
      provide: MARKETPLACE_ADAPTERS,
      useFactory: (lazadaAdapter: LazadaAdapter, aurelleAdapter: AurelleAdapter) => ({
        [MarketplacePlatform.LAZADA]: lazadaAdapter,
        [MarketplacePlatform.AURELLE]: aurelleAdapter,
      }),
      inject: [LazadaAdapter, AurelleAdapter],
    },
  ],
  // BỔ SUNG (29/09/2026) — MARKETPLACE_ADAPTERS giờ CŨNG export: orders/
  // và product-master/ cần lookup adapter theo platform một cách tổng
  // quát (syncShopOrders(platform, shopId)) thay vì inject thẳng
  // LazadaAdapter như trước (xem AURELLE_MARKETPLACE_DESIGN.md Mục 9.3
  // #5). Trước đây token này CHỈ dùng nội bộ trong chính
  // MarketplaceIntegrationService — chưa có module ngoài nào cần.
  exports: [MarketplaceIntegrationService, LazadaAdapter, AurelleAdapter, MARKETPLACE_ADAPTERS],
})
export class MarketplaceIntegrationModule {}
