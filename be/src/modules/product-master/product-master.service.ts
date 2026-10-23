import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { PRODUCT_MASTER_ERROR_CODES } from './product-master.errors';
import { ConfirmPackagingProfileDto } from './dto/confirm-packaging-profile.dto';
import { ACTIVE_SELLER_SKU_FILTER, ProductMaster, ProductMasterDocument } from './schemas/product-master.schema';
import { MasterSkusService } from '../master-skus/master-skus.service';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { PackagingBag, PackagingBagDocument } from '../packaging/schemas/packaging-bag.schema';
import { OrderGroup, OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { bagFits, suggestSmallestBag } from '../packaging/bag-fit.util';
import { FLAT_CATEGORIES } from '../packaging/engine/units';
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
import type { LazadaProductRaw } from '../marketplace-integration/adapters/lazada.adapter';

// Batch size Lazada công bố cho sku_seller_list — 50 SKU/lần gọi (AURELLE
// dùng cùng giới hạn, xem AURELLE_MARKETPLACE_DESIGN.md Mục 7.5).
const PRODUCT_BATCH_SIZE = 50;

// Đồng bộ theo catalog (04/10/2026, từ main)
const CATALOG_PAGE_SIZE = 50; // tối đa của GetProducts
const CATALOG_MAX_OFFSET = 10_000; // giới hạn offset của Lazada GetProducts
const CATALOG_SYNC_OVERLAP_MS = 10 * 60 * 1000; // lùi mốc 10 phút để không lọt sản phẩm sửa sát mốc

/** Các sàn đồng bộ catalog/product master định kỳ. */
export const PRODUCT_SYNC_PLATFORMS = [
  MarketplacePlatform.LAZADA,
  MarketplacePlatform.AURELLE,
] as const;

export interface CatalogSyncResult {
  platform: MarketplacePlatform;
  shopId: string;
  mode: 'full' | 'incremental';
  since: Date | null;
  products: number;
  synced: number;
  complete: boolean;
}

export type CatalogSyncShopOutcome =
  | ({ ok: true } & CatalogSyncResult)
  | { ok: false; platform: MarketplacePlatform; shopId: string; error: string };

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
    // 22/10/2026 — gỡ cờ kẹt đóng gói khi đo xong SKU. @Optional: test cũ không đăng ký.
    @Optional() @InjectModel(OrderGroup.name) private readonly orderGroupModel?: Model<OrderGroupDocument>,
    @Optional() @InjectModel(PackingPlan.name) private readonly packingPlanModel?: Model<PackingPlanDocument>,
    // 22/10/2026 — SKU sàn trùng mã SKU nội bộ → tự nối khi vừa đồng bộ về. @Optional: test cũ.
    @Optional() private readonly masterSkusService?: MasterSkusService,
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
      synced += await this.upsertProducts(platform, shopId, rawProducts, now);
    }

    this.logger.log(`Đồng bộ Product Master (${platform}) cho shop ${shopId}: ${String(synced)} SKU.`);
    return { synced };
  }

  /**
   * 04/10/2026 (từ main) — ĐỒNG BỘ THEO CATALOG CỦA SHOP (không phụ thuộc đơn
   * hàng): SKU mới / vừa đổi mã có trong hệ thống ngay cả khi chưa ai đặt.
   * Mặc định TĂNG DẦN theo `last_product_synced_at` (lùi 10 phút); `full`
   * hoặc chưa từng đồng bộ → lấy toàn bộ. Chỉ ghi mốc khi quét hết trang.
   * Ghi theo cùng quy tắc với đồng bộ theo đơn (`upsertProducts`).
   */
  async syncCatalogForShop(
    platform: MarketplacePlatform,
    shopId: string,
    options: { full?: boolean } = {},
  ): Promise<CatalogSyncResult> {
    const adapter = this.adapters[platform];
    if (!adapter?.listProductsPage) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.UNSUPPORTED_PLATFORM,
        `Sàn "${platform}" chưa hỗ trợ đồng bộ catalog sản phẩm.`,
        HttpStatus.NOT_IMPLEMENTED,
        { platform },
      );
    }
    const shop = await this.marketplaceIntegrationService.getConnectedShop(shopId, platform);
    const accessToken = await this.marketplaceIntegrationService.getValidAccessToken(
      shopId,
      platform,
    );
    const startedAt = new Date();
    const last = shop.last_product_synced_at;
    const since =
      options.full || !last ? null : new Date(last.getTime() - CATALOG_SYNC_OVERLAP_MS);

    let offset = 0;
    let products = 0;
    let synced = 0;
    let complete = true;
    for (;;) {
      const page = await adapter.listProductsPage(accessToken, {
        updatedAfter: since,
        offset,
        limit: CATALOG_PAGE_SIZE,
      });
      products += page.products.length;
      synced += await this.upsertProducts(platform, shopId, page.products, startedAt);
      if (page.products.length < CATALOG_PAGE_SIZE) break;
      offset += CATALOG_PAGE_SIZE;
      if (offset >= CATALOG_MAX_OFFSET) {
        complete = false;
        this.logger.warn(
          `Catalog shop ${shopId} (${platform}) vượt giới hạn offset ${String(CATALOG_MAX_OFFSET)} — dừng, giữ mốc cũ để lần sau quét lại.`,
        );
        break;
      }
    }

    if (complete) {
      await this.marketplaceIntegrationService.markShopProductsSynced(shop._id, startedAt);
    }
    this.logger.log(
      `Đồng bộ catalog shop ${shopId} (${platform}, ${since ? 'tăng dần' : 'toàn bộ'}): ${String(products)} sản phẩm, ${String(synced)} SKU ghi mới/cập nhật.`,
    );
    return { platform, shopId, mode: since ? 'incremental' : 'full', since, products, synced, complete };
  }

  /** Đồng bộ catalog cho mọi shop đang kết nối của các sàn hỗ trợ; lỗi 1 shop không chặn shop khác. */
  async syncCatalogAllShops(options: { full?: boolean } = {}): Promise<CatalogSyncShopOutcome[]> {
    const results: CatalogSyncShopOutcome[] = [];
    for (const platform of PRODUCT_SYNC_PLATFORMS) {
      if (!this.adapters[platform]?.listProductsPage) continue;
      const shops = await this.marketplaceIntegrationService.listConnectedShops(platform);
      for (const shop of shops) {
        try {
          results.push({ ok: true, ...(await this.syncCatalogForShop(platform, shop.shop_id, options)) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Đồng bộ catalog shop ${shop.shop_id} (${platform}) thất bại, bỏ qua, tiếp tục shop khác.`,
            error,
          );
          results.push({ ok: false, platform, shopId: shop.shop_id, error: message });
        }
      }
    }
    return results;
  }

  /**
   * Ghi product_master cho danh sách sản phẩm từ sàn (dùng chung cho đồng bộ
   * theo đơn và theo catalog). Số đo sàn chỉ vào `marketplace_dimension` —
   * `dimension` + trạng thái `ready` CHỈ do kho xác nhận
   * (`confirmPackagingProfile`). Quyết định 04/10/2026 khi gộp main: bỏ
   * `manual_override` và mặc định 20 cm/0,5 kg của main.
   */
  private async upsertProducts(
    platform: MarketplacePlatform,
    shopId: string,
    rawProducts: LazadaProductRaw[],
    now: Date,
  ): Promise<number> {
    const skus = rawProducts.flatMap((product) => product.skus).filter((sku) => Boolean(sku.SellerSku));
    const bulkOps = skus
      .map((sku) => ({
        updateOne: {
          filter: { platform, shop_id: shopId, seller_sku: sku.SellerSku },
          update: {
            $set: {
              // 22/10/2026 — sàn báo ngừng bán thì ẩn SKU khỏi các danh sách vận hành.
              marketplace_status: sku.Status === 'inactive' ? ('inactive' as const) : sku.Status === 'active' ? ('active' as const) : null,
              marketplace_dimension: {
                // Sàn trả STRING — parse về number. Thiếu/lỗi giữ undefined để
                // hồ sơ ở needs_measurement thay vì bịa kích thước.
                package_length_cm: this.parseDimension(sku.package_length),
                package_width_cm: this.parseDimension(sku.package_width),
                package_height_cm: this.parseDimension(sku.package_height),
                package_weight_kg: this.parseWeight(sku.package_weight ?? sku.product_weight),
              },
              last_synced_at: now,
            },
            // Chỉ đặt lúc tạo mới — không reset hồ sơ kho đã xác nhận (lỗi 21/09).
            $setOnInsert: { packaging_profile_status: 'needs_measurement' as const },
          },
          upsert: true,
        },
      }));
    if (bulkOps.length === 0) return 0;
    const result = await this.productMasterModel.bulkWrite(bulkOps);
    // 22/10/2026 — AURELLE đặt SKU đúng quy tắc mà OptiPack chưa có SKU nội bộ → tự tạo trước khi nối.
    if (platform === MarketplacePlatform.AURELLE) {
      await this.autoCreateMasters(rawProducts);
    }
    await this.autoMap(platform, shopId, skus.filter((sku) => sku.Status !== 'inactive').map((sku) => sku.SellerSku));
    return result.upsertedCount + result.modifiedCount;
  }

  private async autoCreateMasters(rawProducts: LazadaProductRaw[]): Promise<void> {
    if (!this.masterSkusService) return;
    try {
      await this.masterSkusService.autoCreateFromSellerSkus(
        rawProducts.flatMap((product) =>
          product.skus
            .filter((sku) => Boolean(sku.SellerSku) && sku.Status !== 'inactive')
            .map((sku) => ({ sellerSku: sku.SellerSku, name: product.attributes?.name ?? null }))),
      );
    } catch (error: unknown) {
      this.logger.warn(`Tự tạo SKU nội bộ từ AURELLE thất bại: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 22/10/2026 — tự nối SKU sàn với SKU nội bộ cùng mã (best-effort, không chặn đồng bộ). */
  private async autoMap(platform: MarketplacePlatform, shopId: string, sellerSkus: string[]): Promise<void> {
    if (!this.masterSkusService || sellerSkus.length === 0) return;
    try {
      await this.masterSkusService.autoMapSellerSkus(platform, shopId, sellerSkus);
    } catch (error: unknown) {
      this.logger.warn(`Tự nối SKU shop ${shopId} (${platform}) thất bại: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 22/10/2026 — Admin đánh dấu SKU sàn NGỪNG DÙNG (VD mã cũ của sản phẩm đã xoá/tạo lại):
   * ẩn khỏi "SKU chưa gán", "Chưa đo", "SKU chưa nối", đẩy tồn. Không xoá hồ sơ (đơn cũ
   * vẫn tra được). retired=false để dùng lại.
   */
  async setRetired(id: string, retired: boolean): Promise<ProductMasterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(PRODUCT_MASTER_ERROR_CODES.INVALID_ID, `"${id}" không đúng định dạng ObjectId hợp lệ.`, HttpStatus.BAD_REQUEST, { id });
    }
    const updated = await this.productMasterModel.findByIdAndUpdate(
      id,
      { $set: { retired, retired_at: retired ? new Date() : null } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(PRODUCT_MASTER_ERROR_CODES.NOT_FOUND, `Không tìm thấy hồ sơ sản phẩm "${id}".`, HttpStatus.NOT_FOUND, { id });
    }
    this.logger.log(`SKU ${updated.seller_sku} (shop ${updated.shop_id}) ${retired ? 'ngừng dùng' : 'dùng lại'}.`);
    return updated;
  }

  /**
   * Danh sách hồ sơ SKU (màn "SKU cần đo" + tra cứu). Gộp 2 phiên bản:
   * lọc trạng thái/shop (thi_dev) + tìm theo SKU (main). `.lean()`, tối đa 200.
   */
  async listProfiles(filter: {
    status?: 'needs_measurement' | 'ready';
    shopId?: string;
    search?: string;
    includeRetired?: boolean;
  }): Promise<ProductMaster[]> {
    // 22/10/2026 — mặc định bỏ SKU sàn đã ngừng bán / ngừng dùng.
    const query: Record<string, unknown> = filter.includeRetired ? {} : { ...ACTIVE_SELLER_SKU_FILTER };
    if (filter.status) query.packaging_profile_status = filter.status;
    if (filter.shopId) query.shop_id = filter.shopId;
    if (filter.search) {
      // escape ký tự đặc biệt regex — tránh lỗi/ReDoS khi user gõ "(" hay "*"
      const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.seller_sku = { $regex: escaped, $options: 'i' };
    }
    return this.productMasterModel.find(query).sort({ seller_sku: 1 }).limit(200).lean();
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

    if (dto.can_fold_in_half === true && !FLAT_CATEGORIES.has(dto.product_category)) {
      throw new AppException(
        PRODUCT_MASTER_ERROR_CODES.FOLD_NOT_ALLOWED,
        'Chỉ quần áo mới gập đôi được — giày, dép, phụ kiện và hàng khác không gập: bỏ chọn "có thể gập đôi".',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { productCategory: dto.product_category },
      );
    }
    const zipBagCode = dto.zip_bag_code ?? null;
    if (zipBagCode !== null) {
      const bag = await this.bagModel.findOne({ code: zipBagCode, is_active: true }).lean();
      if (!bag) {
        throw new AppException(
          PRODUCT_MASTER_ERROR_CODES.ZIP_BAG_NOT_FOUND,
          `Không có túi zip "${zipBagCode}" đang dùng trong danh mục.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { zipBagCode },
        );
      }
      const pkg = { length_cm: dto.length_cm, width_cm: dto.width_cm, height_cm: dto.height_cm };
      if (!bagFits(pkg, bag)) {
        const suggested = await this.suggestZipBag(pkg);
        throw new AppException(
          PRODUCT_MASTER_ERROR_CODES.ZIP_BAG_TOO_SMALL,
          `Túi "${zipBagCode}" (${String(bag.width_mm)}×${String(bag.length_mm)} mm) không vừa gói ${String(dto.length_cm)}×${String(dto.width_cm)}×${String(dto.height_cm)} cm.` +
            (suggested ? ` Gợi ý: túi "${suggested}".` : ' Không túi nào trong danh mục đủ lớn — thêm túi lớn hơn.'),
          HttpStatus.UNPROCESSABLE_ENTITY,
          { zipBagCode, suggestedZipBagCode: suggested },
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
    await this.releasePackingBlocks(updated);
    return updated;
  }

  /**
   * 22/10/2026 — nhóm đã lấy xong nhưng kẹt đóng gói vì chờ đúng SKU này: gỡ kế hoạch
   * `failed` (thành superseded) + xoá cờ kẹt → cron đóng gói tự tính lại trong ~10 s.
   * Nhóm còn SKU khác chưa đo sẽ kẹt lại với danh sách SKU mới. Best-effort: lỗi chỉ log,
   * KHÔNG làm hỏng việc lưu số đo.
   */
  private async releasePackingBlocks(product: ProductMasterDocument): Promise<number> {
    if (!this.orderGroupModel || !this.packingPlanModel) return 0;
    try {
      const groups = await this.orderGroupModel
        .find({
          platform: product.platform,
          shop_id: product.shop_id,
          packing_blocked_skus: product.seller_sku,
          fulfillment_status: GroupFulfillmentStatus.PICKED,
        })
        .select('_id')
        .lean();
      if (groups.length === 0) return 0;
      const ids = groups.map((g) => g._id);
      await this.packingPlanModel.updateMany(
        { order_group_id: { $in: ids }, is_active: true, status: 'failed' },
        { $set: { is_active: false, status: 'superseded' } },
      );
      await this.orderGroupModel.updateMany(
        { _id: { $in: ids } },
        { $set: { packing_blocked_reason: null, packing_blocked_skus: [], packing_blocked_at: null } },
      );
      this.logger.log(
        `SKU ${product.seller_sku} đã đo — gỡ kẹt ${String(ids.length)} nhóm đơn, chờ tính lại kế hoạch đóng gói.`,
      );
      return ids.length;
    } catch (error: unknown) {
      this.logger.warn(
        `Gỡ kẹt đóng gói sau khi đo SKU ${product.seller_sku} thất bại: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /** Mã túi zip nhỏ nhất (theo diện tích) còn vừa gói đã đo (cm); null nếu không túi nào vừa. */
  async suggestZipBag(pkg: { length_cm: number; width_cm: number; height_cm: number }): Promise<string | null> {
    const bags = await this.bagModel.find({ is_active: true }).select('code width_mm length_mm').lean();
    return suggestSmallestBag(pkg, bags)?.code ?? null;
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
