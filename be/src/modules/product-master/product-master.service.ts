import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { PRODUCT_MASTER_ERROR_CODES } from './product-master.errors';
import { ProductCategory } from '../../common/enums/product-category.enum';
import { ConfirmPackagingProfileDto } from './dto/confirm-packaging-profile.dto';
import { ProductMaster, ProductMasterDocument } from './schemas/product-master.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { PackagingBag, PackagingBagDocument } from '../packaging/schemas/packaging-bag.schema';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { MarketplaceIntegrationService } from '../marketplace-integration';
// 🔄 ĐÃ ĐỔI (29/09/2026, AURELLE_MARKETPLACE_DESIGN.md Mục 9.3 #7) —
// trước đây inject thẳng LazadaAdapter (class cụ thể) vì getProducts()
// chưa nằm trong MarketplaceAdapter interface dùng chung. Giờ interface
// ĐÃ CÓ method này (tùy chọn) — tra qua registry giống orders.service.ts,
// thêm sàn mới không cần sửa gì trong service này nữa.
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from '../marketplace-integration/interfaces/marketplace-adapter.interface';

// Batch size Lazada công bố cho sku_seller_list — 50 SKU/lần gọi (AURELLE
// dùng cùng giới hạn, xem AURELLE_MARKETPLACE_DESIGN.md Mục 7.5).
const PRODUCT_BATCH_SIZE = 50;

@Injectable()
export class ProductMasterService {
  private readonly logger = new Logger(ProductMasterService.name);

  constructor(
    @InjectModel(ProductMaster.name)
    private readonly productMasterModel: Model<ProductMasterDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(PackagingBag.name)
    private readonly bagModel: Model<PackagingBagDocument>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<Record<MarketplacePlatform, MarketplaceAdapter>>,
  ) {}

  /**
   * Convenience wrapper (2026-09-09) — lấy danh sách SKU CẦN đồng bộ
   * TRỰC TIẾP từ đơn hàng thật đã có trong collection `orders`, thay vì
   * đồng bộ TOÀN BỘ catalog của shop (có thể có sản phẩm chưa từng bán
   * qua hệ thống này — không cần tốn quota API cho SKU không liên
   * quan tới bài toán đóng gói thực tế).
   */
  async syncProductsForShopFromOrders(
    platform: MarketplacePlatform,
    shopId: string,
  ): Promise<{ synced: number }> {
    const skus = await this.orderModel.distinct('items.sku', { platform, shop_id: shopId });
    if (skus.length === 0) {
      this.logger.log(`Shop ${shopId} (${platform}) chưa có SKU nào trong đơn hàng — bỏ qua lượt đồng bộ.`);
      return { synced: 0 };
    }
    return this.syncProductsForShop(platform, shopId, skus);
  }

  /**
   * Đồng bộ kích thước/cân nặng sản phẩm cho 1 shop — gọi định kỳ 1
   * lần/ngày (KHÔNG mỗi lần AI tính, xem CLAUDE.md mục Product Master
   * Data), hoặc gọi tay qua endpoint admin khi cần refresh sớm.
   *
   * Chia batch 50 SKU/lần (Rule tối ưu tương tự vòng lặp sync đơn) và
   * ghi bằng bulkWrite() — Rule #14 (CLAUDE.md), KHÔNG lặp N lần
   * updateOne riêng lẻ cho từng SKU.
   */
  async syncProductsForShop(
    platform: MarketplacePlatform,
    shopId: string,
    sellerSkus: string[],
  ): Promise<{ synced: number }> {
    const adapter = this.adapters[platform];
    if (!adapter?.getProducts) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.UNSUPPORTED_PLATFORM,
        `Sàn "${platform}" chưa hỗ trợ đồng bộ sản phẩm (adapter chưa implement getProducts).`,
        HttpStatus.NOT_IMPLEMENTED,
        { platform },
      );
    }

    // getValidAccessToken tự tra shop + tự refresh nếu token sắp hết
    // hạn — ĐÚNG signature thật (shopId, platform), không cần gọi
    // getConnectedShop() trước như bản nháp đầu (đã verify lại theo
    // đúng code thật của marketplace-integration.service.ts).
    const accessToken = await this.marketplaceIntegrationService.getValidAccessToken(
      shopId,
      platform,
    );

    let synced = 0;
    const now = new Date();

    for (let i = 0; i < sellerSkus.length; i += PRODUCT_BATCH_SIZE) {
      const batch = sellerSkus.slice(i, i + PRODUCT_BATCH_SIZE);
      const rawProducts = await adapter.getProducts(accessToken, batch);

      const bulkOps = rawProducts.flatMap((product) =>
        product.skus.map((sku) => ({
          updateOne: {
            filter: {
              platform,
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
                last_synced_at: now,
              },
              // SỬA (21/09/2026): trước đây `$set` status ở MỌI lượt sync
              // → hồ sơ kho đã xác nhận `ready` bị reset về
              // needs_measurement mỗi ngày. Chỉ đặt lúc tạo mới.
              $setOnInsert: { packaging_profile_status: 'needs_measurement' as const },
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

    this.logger.log(`Đồng bộ Product Master (${platform}) cho shop ${shopId}: ${String(synced)} SKU.`);
    return { synced };
  }

  /**
   * BỔ SUNG (21/09/2026, Bước 0) — danh sách hồ sơ SKU theo trạng thái,
   * cho màn "SKU cần đo" của kho. `.lean()` (Rule #12), giới hạn 200.
   */
  async listProfiles(filter: {
    status?: 'needs_measurement' | 'ready';
    shopId?: string;
  }): Promise<ProductMaster[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.packaging_profile_status = filter.status;
    if (filter.shopId) query.shop_id = filter.shopId;
    return this.productMasterModel.find(query).sort({ seller_sku: 1 }).limit(200).lean();
  }

  /**
   * BỔ SUNG (21/09/2026, Bước 0) — kho/Admin xác nhận đã đo SKU sau
   * gấp/bọc (giày đo nguyên hộp). Đây là writer DUY NHẤT của `dimension`
   * và trạng thái `ready`; sync sàn chỉ ghi `marketplace_dimension`.
   */
  async confirmPackagingProfile(
    id: string,
    userId: string,
    dto: ConfirmPackagingProfileDto,
  ): Promise<ProductMasterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.INVALID_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }

    if (dto.can_fold_in_half === true && dto.product_category === ProductCategory.SHOES) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.FOLD_NOT_ALLOWED,
        'Giày đựng trong hộp cứng không gập được — bỏ chọn "có thể gập đôi".',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { productCategory: dto.product_category },
      );
    }
    const zipBagCode = dto.zip_bag_code ?? null;
    if (zipBagCode !== null) {
      const bagExists = await this.bagModel.exists({ code: zipBagCode, is_active: true });
      if (!bagExists) {
        throw new AppException(
          PRODUCT_MASTER_ERROR_CODES.ZIP_BAG_NOT_FOUND,
          `Không có túi zip "${zipBagCode}" đang dùng trong danh mục.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { zipBagCode },
        );
      }
    }

    const updated = await this.productMasterModel.findByIdAndUpdate(
      id,
      {
        $set: {
          dimension: {
            package_length_cm: dto.length_cm,
            package_width_cm: dto.width_cm,
            package_height_cm: dto.height_cm,
            package_weight_kg: dto.weight_kg,
          },
          is_fragile: dto.is_fragile,
          orientation_rule: dto.orientation_rule,
          max_stack_load_kg: dto.max_stack_load_kg ?? null,
          product_category: dto.product_category,
          zip_bag_code: zipBagCode,
          zip_bag_folded: zipBagCode !== null && dto.zip_bag_folded === true,
          can_fold_in_half: dto.can_fold_in_half === true,
          packaging_profile_status: 'ready',
          profile_confirmed_by: new Types.ObjectId(userId),
          profile_confirmed_at: new Date(),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );

    if (!updated) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.NOT_FOUND,
        `Không tìm thấy hồ sơ sản phẩm "${id}".`,
        HttpStatus.NOT_FOUND,
        { id },
      );
    }
    this.logger.log(`Xác nhận hồ sơ đóng gói SKU ${updated.seller_sku} (shop ${updated.shop_id}).`);
    return updated;
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
