import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { AppException } from '../../common/exceptions/app-exception';
import { PRODUCT_MASTER_ERROR_CODES } from './product-master.errors';
import { UpdateProductMasterDto } from './dto/update-product-master.dto';

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

      // K1 (26/09/2026) — xung đột với luồng cũ: trước đây cron ghi đè
      // dimension mỗi lần chạy. Nay Admin có thể sửa tay (manual_override)
      // -> với các SKU đó CHỈ cập nhật last_synced_at, giữ nguyên số Admin nhập.
      const manualSkus = new Set(
        (
          await this.productMasterModel
            .find({
              platform: MarketplacePlatform.LAZADA,
              shop_id: shopId,
              seller_sku: { $in: batch },
              manual_override: true,
            })
            .select('seller_sku')
            .lean()
        ).map((d) => d.seller_sku),
      );

      const bulkOps = rawProducts.flatMap((product) =>
        product.skus.map((sku) => ({
          updateOne: {
            filter: {
              platform: MarketplacePlatform.LAZADA,
              shop_id: shopId,
              seller_sku: sku.SellerSku,
            },
            update: manualSkus.has(sku.SellerSku)
              ? { $set: { last_synced_at: now } }
              : {
              $set: {
                dimension: {
                  // Lazada trả STRING — parse về number, mặc định an
                  // toàn (20cm/0.5kg) nếu field thiếu/parse lỗi, KHÔNG
                  // để NaN lọt vào DB làm hỏng tính toán bin-packing.
                  package_length_cm: this.parseDimension(sku.package_length),
                  package_width_cm: this.parseDimension(sku.package_width),
                  package_height_cm: this.parseDimension(sku.package_height),
                  package_weight_kg: this.parseWeight(sku.package_weight ?? sku.product_weight),
                },
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

  private parseDimension(raw?: string): number {
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20; // mặc định 20cm — cồng kềnh nhẹ, an toàn hơn ước lượng quá nhỏ
  }

  private parseWeight(raw?: string): number {
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.5; // mặc định 0.5kg
  }
  // ===================================================================
  // K1 (26/09/2026) — API xem/sửa tay Product Master. Trước K1 module này
  // KHÔNG có controller: dữ liệu kích thước sai/thiếu chỉ sửa được bằng
  // cách vào thẳng MongoDB (đúng lỗi thiếu `dimension` gây 500 ngày 19/09).
  // ===================================================================

  async listProducts(params: {
    shopId?: string;
    search?: string;
    manualOnly?: boolean;
    page: number;
    limit: number;
  }): Promise<{ items: ProductMasterDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (params.shopId) filter.shop_id = params.shopId;
    if (params.manualOnly) filter.manual_override = true;
    if (params.search) {
      // escape ký tự đặc biệt regex — tránh lỗi/ReDoS khi user gõ "(" hay "*"
      const escaped = params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.seller_sku = { $regex: escaped, $options: 'i' };
    }
    const [items, total] = await Promise.all([
      this.productMasterModel
        .find(filter)
        .sort({ seller_sku: 1 })
        .skip((params.page - 1) * params.limit)
        .limit(params.limit)
        .lean(),
      this.productMasterModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async getProduct(id: string): Promise<ProductMasterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.INVALID_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const doc = await this.productMasterModel.findById(id);
    if (!doc) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.NOT_FOUND,
        `Không tìm thấy sản phẩm với id "${id}".`,
        HttpStatus.NOT_FOUND,
        { id },
      );
    }
    return doc;
  }

  async updateProduct(
    id: string,
    dto: UpdateProductMasterDto,
    actorUserId: string,
  ): Promise<ProductMasterDocument> {
    const set: Record<string, unknown> = {};
    if (dto.package_length_cm !== undefined) set['dimension.package_length_cm'] = dto.package_length_cm;
    if (dto.package_width_cm !== undefined) set['dimension.package_width_cm'] = dto.package_width_cm;
    if (dto.package_height_cm !== undefined) set['dimension.package_height_cm'] = dto.package_height_cm;
    if (dto.package_weight_kg !== undefined) set['dimension.package_weight_kg'] = dto.package_weight_kg;
    if (dto.is_fragile !== undefined) set.is_fragile = dto.is_fragile;
    if (Object.keys(set).length === 0) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.NOTHING_TO_UPDATE,
        'Không có trường nào để cập nhật.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.getProduct(id);
    const updated = await this.productMasterModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...set,
          manual_override: true,
          manual_override_at: new Date(),
          manual_override_by: actorUserId,
        },
      },
      { returnDocument: 'after' },
    );
    return updated ?? this.getProduct(id);
  }
}
