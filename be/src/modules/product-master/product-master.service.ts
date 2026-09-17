import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductMaster, ProductMasterDocument } from './schemas/product-master.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
// Inject TRỰC TIẾP LazadaAdapter (class cụ thể, đã export sẵn từ
// MarketplaceIntegrationModule) — ĐÚNG THEO PATTERN đã có sẵn trong
// chính orders.service.ts (cũng inject thẳng LazadaAdapter, không qua
// MARKETPLACE_ADAPTERS registry), vì getProducts()/getOrders() KHÔNG
// nằm trong MarketplaceAdapter interface dùng chung (interface đó chỉ
// khai các method OAuth/webhook — buildAuthorizationUrl/
// exchangeCodeForToken/refreshAccessToken/verifyWebhookSignature).
// Nhất quán với code đã hoàn thành, KHÔNG tự sáng tạo pattern khác.
import { LazadaAdapter } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { MarketplaceIntegrationService } from '../marketplace-integration';

// Batch size Lazada công bố cho sku_seller_list — 50 SKU/lần gọi.
const LAZADA_PRODUCT_BATCH_SIZE = 50;

@Injectable()
export class ProductMasterService {
  private readonly logger = new Logger(ProductMasterService.name);

  constructor(
    @InjectModel(ProductMaster.name)
    private readonly productMasterModel: Model<ProductMasterDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly lazadaAdapter: LazadaAdapter,
  ) {}

  /**
   * Convenience wrapper (2026-09-09) — lấy danh sách SKU CẦN đồng bộ
   * TRỰC TIẾP từ đơn hàng thật đã có trong collection `orders`, thay vì
   * đồng bộ TOÀN BỘ catalog của shop (có thể có sản phẩm chưa từng bán
   * qua hệ thống này — không cần tốn quota API cho SKU không liên
   * quan tới bài toán đóng gói thực tế).
   */
  async syncProductsForShopFromOrders(shopId: string): Promise<{ synced: number }> {
    const skus = await this.orderModel.distinct('items.sku', { shop_id: shopId });
    if (skus.length === 0) {
      this.logger.log(`Shop ${shopId} chưa có SKU nào trong đơn hàng — bỏ qua lượt đồng bộ.`);
      return { synced: 0 };
    }
    return this.syncProductsForShop(shopId, skus);
  }

  /**
   * Đồng bộ kích thước/cân nặng sản phẩm cho 1 shop Lazada — gọi định
   * kỳ 1 lần/ngày (KHÔNG mỗi lần AI tính, xem CLAUDE.md mục Product
   * Master Data), hoặc gọi tay qua endpoint admin khi cần refresh sớm.
   *
   * Chia batch 50 SKU/lần (Rule tối ưu tương tự vòng lặp sync đơn) và
   * ghi bằng bulkWrite() — Rule #14 (CLAUDE.md), KHÔNG lặp N lần
   * updateOne riêng lẻ cho từng SKU.
   */
  async syncProductsForShop(shopId: string, sellerSkus: string[]): Promise<{ synced: number }> {
    // getValidAccessToken tự tra shop + tự refresh nếu token sắp hết
    // hạn — ĐÚNG signature thật (shopId, platform), không cần gọi
    // getConnectedShop() trước như bản nháp đầu (đã verify lại theo
    // đúng code thật của marketplace-integration.service.ts).
    const accessToken = await this.marketplaceIntegrationService.getValidAccessToken(
      shopId,
      MarketplacePlatform.LAZADA,
    );

    let synced = 0;
    const now = new Date();

    for (let i = 0; i < sellerSkus.length; i += LAZADA_PRODUCT_BATCH_SIZE) {
      const batch = sellerSkus.slice(i, i + LAZADA_PRODUCT_BATCH_SIZE);
      const rawProducts = await this.lazadaAdapter.getProducts(accessToken, batch);

      const bulkOps = rawProducts.flatMap((product) =>
        product.skus.map((sku) => ({
          updateOne: {
            filter: {
              platform: MarketplacePlatform.LAZADA,
              shop_id: shopId,
              seller_sku: sku.SellerSku,
            },
            update: {
              $set: {
                marketplace_dimension: {
                  // Lazada trả STRING — parse về number. Khi sàn thiếu
                  // hoặc trả dữ liệu lỗi, giữ undefined để hồ sơ chuyển
                  // sang needs_measurement thay vì bịa kích thước.
                  package_length_cm: this.parseDimension(sku.package_length),
                  package_width_cm: this.parseDimension(sku.package_width),
                  package_height_cm: this.parseDimension(sku.package_height),
                  package_weight_kg: this.parseWeight(sku.package_weight ?? sku.product_weight),
                },
                packaging_profile_status: 'needs_measurement' as const,
                last_synced_at: now,
              },
            },
            upsert: true,
          },
        })),
      );

      if (bulkOps.length > 0) {
        const result = await this.productMasterModel.bulkWrite(bulkOps);
        synced += result.upsertedCount + result.modifiedCount;
      }
    }

    this.logger.log(`Đồng bộ Product Master cho shop ${shopId}: ${String(synced)} SKU.`);
    return { synced };
  }

  private parseDimension(raw?: string): number | undefined {
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private parseWeight(raw?: string): number | undefined {
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
