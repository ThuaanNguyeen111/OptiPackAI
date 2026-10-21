import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketplaceIntegrationService } from '../marketplace-integration/marketplace-integration.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { ProductMaster, ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import { StockReservationService } from '../order-groups/stock-reservation.service';

/** Số SKU mỗi lần gọi `/product/stock/sellable/update` (Lazada khuyến nghị ≤ 20). */
const PUSH_CHUNK = 20;

export interface StockPushResult {
  checked: number;
  pushed: number;
  unchanged: number;
  unmanaged: number;
  failed: number;
}

/**
 * ===================================================================
 * Đẩy tồn bán được OptiPack → AURELLE (21/10/2026, phương án A)
 * ===================================================================
 * Kho OptiPack là nguồn tồn duy nhất cho SKU nào đã có ô trong kho:
 *   bán được trên website = tồn thực OptiPack − đang giữ chỗ (mọi kênh).
 * Website đặt `quantity_on_hand = số đẩy + giữ chỗ của website` nên đơn mới
 * đặt giữa 2 lượt đẩy vẫn bị trừ đúng 1 lần.
 *
 * - Chỉ SKU `managed` (kho đã từng nhập) — SKU kho chưa nhập để website tự quản.
 * - Chỉ đẩy khi số đổi so với lần đẩy thành công trước (nhớ trong bộ nhớ;
 *   khởi động lại thì đẩy lại 1 lượt — an toàn vì là ghi đè).
 * - Lazada KHÔNG đẩy (quyết định cũ: OptiPack không ghi ngược Lazada).
 * - Không bao giờ ném lỗi ra ngoài; lỗi 1 shop không chặn shop khác.
 * ===================================================================
 */
@Injectable()
export class MarketplaceStockPushService {
  private readonly logger = new Logger(MarketplaceStockPushService.name);
  /** `shopId|sellerSku` → số đã đẩy thành công gần nhất. */
  private readonly lastPushed = new Map<string, number>();

  constructor(
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<Record<MarketplacePlatform, MarketplaceAdapter>>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly stockReservationService: StockReservationService,
  ) {}

  /** `force` = bỏ qua bộ nhớ "đã đẩy", gửi lại mọi SKU managed (nút đồng bộ ngay). */
  async pushAurelle(options: { force?: boolean } = {}): Promise<StockPushResult> {
    const result: StockPushResult = { checked: 0, pushed: 0, unchanged: 0, unmanaged: 0, failed: 0 };
    const platform = MarketplacePlatform.AURELLE;
    const adapter = this.adapters[platform];
    if (!adapter?.updateSellableQuantity) return result;

    const shops = await this.marketplaceIntegrationService.listConnectedShops(platform);
    for (const shop of shops) {
      try {
        const skus = await this.productMasterModel
          .find({ platform, shop_id: shop.shop_id })
          .select('seller_sku')
          .lean();
        const changes: { sellerSku: string; quantity: number }[] = [];
        for (const { seller_sku: sellerSku } of skus) {
          result.checked += 1;
          const stock = await this.stockReservationService.availability(platform, shop.shop_id, sellerSku);
          if (!stock.managed) {
            result.unmanaged += 1;
            continue;
          }
          if (!options.force && this.lastPushed.get(`${shop.shop_id}|${sellerSku}`) === stock.available) {
            result.unchanged += 1;
            continue;
          }
          changes.push({ sellerSku, quantity: stock.available });
        }
        if (changes.length === 0) continue;

        const token = await this.marketplaceIntegrationService.getValidAccessToken(shop.shop_id, platform);
        for (let i = 0; i < changes.length; i += PUSH_CHUNK) {
          const chunk = changes.slice(i, i + PUSH_CHUNK);
          try {
            const results = await adapter.updateSellableQuantity(
              token,
              chunk.map((c) => ({ itemId: '', skuId: '', sellerSku: c.sellerSku, sellableQuantity: c.quantity })),
            );
            const ok = new Set(results.filter((r) => r.success).map((r) => r.sellerSku));
            for (const c of chunk) {
              if (ok.has(c.sellerSku)) {
                this.lastPushed.set(`${shop.shop_id}|${c.sellerSku}`, c.quantity);
                result.pushed += 1;
              } else {
                result.failed += 1;
              }
            }
          } catch (error: unknown) {
            result.failed += chunk.length;
            this.logger.warn(`Đẩy tồn AURELLE shop ${shop.shop_id} lỗi (${String(chunk.length)} SKU): ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error: unknown) {
        this.logger.warn(`Đẩy tồn AURELLE shop ${shop.shop_id} lỗi: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (result.pushed > 0 || result.failed > 0) {
      this.logger.log(`Đẩy tồn AURELLE: ${String(result.pushed)} SKU đã đẩy, ${String(result.failed)} lỗi, ${String(result.unchanged)} không đổi, ${String(result.unmanaged)} kho chưa quản.`);
    }
    return result;
  }
}
