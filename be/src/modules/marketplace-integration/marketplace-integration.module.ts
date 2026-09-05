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

    {
      provide: MARKETPLACE_ADAPTERS,
      useFactory: (lazadaAdapter: LazadaAdapter) => ({
        [MarketplacePlatform.LAZADA]: lazadaAdapter,
      }),
      inject: [LazadaAdapter],
    },
  ],
  exports: [MarketplaceIntegrationService, LazadaAdapter],
})
export class MarketplaceIntegrationModule {}
