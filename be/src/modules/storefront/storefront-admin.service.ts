import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { CatalogService } from './catalog.service';
import { AurelleWebhookPublisher } from './aurelle-webhook.publisher';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Color, ColorDocument } from '../master-skus/schemas/color.schema';
import { buildMasterSkuCode } from '../master-skus/master-skus.service';
import { SaveAdminProductDto } from './dto/storefront-admin.dto';
import {
  StorefrontCategory, StorefrontCategoryDocument, StorefrontInventoryStock, StorefrontInventoryStockDocument,
  StorefrontProduct, StorefrontProductDocument, StorefrontProductVariant, StorefrontProductVariantDocument,
} from './schemas/storefront.schema';

export type AdminCatalogProduct = Awaited<ReturnType<CatalogService['shape']>>;

/** 22/10/2026 — lựa chọn để ghép SKU theo quy tắc OptiPack trên form Admin website. */
export interface SkuOptions {
  rule: string;
  categories: { code: string; name: string; parentCode: string | null; sizes: string[] }[];
  colors: { code: string; name: string; hex: string | null }[];
}

@Injectable()
export class StorefrontAdminService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(StorefrontProduct.name) private readonly products: Model<StorefrontProductDocument>,
    @InjectModel(StorefrontProductVariant.name) private readonly variants: Model<StorefrontProductVariantDocument>,
    @InjectModel(StorefrontInventoryStock.name) private readonly stocks: Model<StorefrontInventoryStockDocument>,
    @InjectModel(StorefrontCategory.name) private readonly categories: Model<StorefrontCategoryDocument>,
    private readonly catalog: CatalogService,
    // 22/10/2026 — danh mục cấp 2 + màu của OptiPack (nguồn quy tắc SKU) và webhook báo SKU mới.
    @InjectModel(Category.name) private readonly skuCategories: Model<CategoryDocument>,
    @InjectModel(Color.name) private readonly skuColors: Model<ColorDocument>,
    @Optional() private readonly publisher?: AurelleWebhookPublisher,
  ) {}

  /** 22/10/2026 — danh mục cấp 2 đang dùng (kèm thang size) + màu đang dùng của OptiPack. */
  async skuOptions(): Promise<SkuOptions> {
    const [categories, colors] = await Promise.all([
      this.skuCategories.find({ level: 2, is_active: true }).sort({ code: 1 }).lean(),
      this.skuColors.find({ is_active: true }).sort({ code: 1 }).lean(),
    ]);
    return {
      rule: '{DANH MỤC CẤP 2}-{SỐ MẪU 3 SỐ}-{MÀU}-{SIZE}, VD ATHUN-005-DEN-M',
      categories: categories.map((c) => ({ code: c.code, name: c.name, parentCode: c.parent_code, sizes: c.size_scale })),
      colors: colors.map((c) => ({ code: c.code, name: c.name, hex: c.hex })),
    };
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Mã sản phẩm không hợp lệ');
    return new Types.ObjectId(id);
  }

  async list(): Promise<AdminCatalogProduct[]> {
    const [products, categories] = await Promise.all([
      this.products.find({ deleted_at: null }).sort({ created_at: -1 }),
      this.categories.find().lean(),
    ]);
    const categoryNames = new Map(categories.map((category) => [category._id.toString(), category.name]));
    return Promise.all(products.map((product) => this.catalog.shape(
      product, categoryNames.get(product.category_id?.toString() ?? ''), true,
    )));
  }

  async findOne(id: string): Promise<AdminCatalogProduct> {
    const product = await this.products.findOne({ _id: this.objectId(id), deleted_at: null });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    const category = product.category_id ? await this.categories.findById(product.category_id).lean() : null;
    return this.catalog.shape(product, category?.name, true);
  }

  private validate(dto: SaveAdminProductDto): void {
    if (!dto.name.trim()) throw new BadRequestException('Tên sản phẩm không được để trống');
    const images = [dto.thumbnailUrl, ...dto.galleryImages];
    if (images.some((url) => {
      if (/^\/kaira-assets\/images\/[a-zA-Z0-9_.-]+$/.test(url)) return false;
      try { return !['http:', 'https:'].includes(new URL(url).protocol); } catch { return true; }
    })) throw new BadRequestException('Ảnh sản phẩm phải là đường dẫn ảnh hợp lệ');
    const ids = dto.variants.flatMap((variant) => variant.id ? [variant.id] : []);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Biến thể bị lặp');
  }

  async save(dto: SaveAdminProductDto, id?: string): Promise<AdminCatalogProduct> {
    this.validate(dto);
    if (!id && dto.variants.some((variant) => variant.id)) {
      throw new BadRequestException('Sản phẩm mới không được dùng biến thể đã tồn tại');
    }
    const productId = id ? this.objectId(id) : new Types.ObjectId();
    const createdSkus: string[] = [];
    try {
      await this.connection.transaction(async (session) => {
        const product = id
          ? await this.products.findOne({ _id: productId, deleted_at: null }).session(session)
          : new this.products({
            _id: productId,
            slug: `${dto.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
              .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'san-pham'}-${productId.toHexString()}`,
          });
        if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
        if (dto.categoryId && !await this.categories.exists({ _id: dto.categoryId, is_active: true }).session(session)) {
          throw new BadRequestException('Danh mục không tồn tại hoặc đã bị ẩn');
        }

        const existing = await this.variants.find({ product_id: productId, is_active: true }).session(session);
        const existingById = new Map(existing.map((variant) => [variant.id, variant]));
        const keptIds = dto.variants.flatMap((variant) => variant.id ? [variant.id] : []);
        if (keptIds.some((variantId) => !existingById.has(variantId))) {
          throw new BadRequestException('Biến thể không thuộc sản phẩm hoặc đã bị xóa');
        }
        const defaultId = existing.find((variant) => variant.is_default && keptIds.includes(variant.id))?.id;
        const rule = await this.resolveSkuRule(dto, product, existing, session);
        product.set({
          sku_category_code: rule.categoryCode,
          sku_model_no: rule.modelNo,
          name: dto.name.trim(), description: dto.description, category_id: dto.categoryId ?? null,
          thumbnail_url: dto.thumbnailUrl,
          gallery_images: [...new Set([dto.thumbnailUrl, ...dto.galleryImages])],
          status: dto.status, is_featured: dto.isFeatured,
        });
        await product.save({ session });

        const seenSkus = new Set<string>();
        for (const [index, input] of dto.variants.entries()) {
          let variant: StorefrontProductVariantDocument | undefined;
          let color: string | null;
          let size: string | null;
          if (input.id) {
            variant = existingById.get(input.id);
            if (!variant) throw new BadRequestException('Biến thể không hợp lệ');
            if (variant.sku_color_code) {
              // 22/10/2026 — SKU theo quy tắc đã cố định: màu/size là một phần của mã, không đổi được.
              const wantSize = input.size?.trim().toUpperCase();
              if ((input.colorCode && input.colorCode !== variant.sku_color_code) || (wantSize && wantSize !== variant.size)) {
                throw new BadRequestException(`Biến thể ${variant.sku}: màu/size nằm trong SKU nên không đổi được — thêm biến thể mới với màu/size khác.`);
              }
              color = variant.color;
              size = variant.size;
            } else {
              color = input.color?.trim() ?? null;
              size = input.size?.trim() ?? null;
            }
          } else {
            // 22/10/2026 — biến thể MỚI: SKU bắt buộc theo quy tắc OptiPack.
            const built = this.buildRuleSku(rule, input, index);
            if (seenSkus.has(built.sku)) throw new BadRequestException(`Biến thể ${String(index + 1)} trùng SKU ${built.sku} với dòng khác.`);
            seenSkus.add(built.sku);
            const taken = await this.variants.findOne({ sku: built.sku }).session(session);
            if (taken && !taken.product_id.equals(productId)) {
              throw new ConflictException(`SKU ${built.sku} đã dùng cho sản phẩm khác — đổi số mẫu.`);
            }
            if (taken?.is_active) throw new ConflictException(`SKU ${built.sku} đã có trong sản phẩm này.`);
            // Biến thể đã bỏ trước đó cùng mã → dùng lại (giữ liên kết tồn/kệ bên OptiPack).
            variant = taken ?? new this.variants({ product_id: productId, sku: built.sku });
            variant.set({ is_active: true, sku_color_code: built.colorCode });
            color = built.colorName;
            size = built.size;
            createdSkus.push(built.sku);
          }
          variant.set({
            color, size,
            variant_name: [color, size].filter(Boolean).join(' / ') || 'Mặc định',
            price: input.price, is_default: defaultId ? variant.id === defaultId : index === 0,
          });
          await variant.save({ session });
          // (21/10/2026, phương án A) Tồn của SKU đã nối kho OptiPack do OptiPack đẩy sang —
          // bỏ qua số Admin nhập, tránh 2 nơi cùng sửa rồi ghi đè lẫn nhau.
          if (variant.stock_source === 'optipack') continue;
          const stock = await this.stocks.findOne({ variant_id: variant._id, warehouse_id: null }).session(session);
          if (input.quantityOnHand < (stock?.reserved_quantity ?? 0)) {
            throw new BadRequestException(`Tồn kho ${variant.sku} không được thấp hơn số lượng đang giữ chỗ`);
          }
          await this.stocks.updateOne(
            { variant_id: variant._id, warehouse_id: null },
            { $set: { quantity_on_hand: input.quantityOnHand }, $setOnInsert: { reserved_quantity: 0, reorder_level: 0 } },
            { upsert: true, session, runValidators: true },
          );
        }
        await this.variants.updateMany(
          { product_id: productId, _id: { $in: existing.filter((variant) => !keptIds.includes(variant.id)).map((variant) => variant._id) } },
          { $set: { is_active: false, is_default: false } }, { session },
        );
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new ConflictException('Slug hoặc SKU đã tồn tại, vui lòng thử lại');
      }
      throw error;
    }
    // 22/10/2026 — báo đối tác (OptiPack) kéo hồ sơ SKU mới ngay → tự nối SKU nội bộ cùng mã.
    if (createdSkus.length > 0) this.publisher?.notifyProductsChanged(createdSkus);
    return this.findOne(productId.toHexString());
  }

  /**
   * 22/10/2026 — Danh mục cấp 2 + số mẫu của sản phẩm (phần đầu SKU). Lấy từ form, không có
   * thì dùng giá trị đã lưu. Đã có biến thể theo quy tắc thì KHOÁ (đổi sẽ làm 2 nhóm mã khác nhau).
   */
  private async resolveSkuRule(
    dto: SaveAdminProductDto,
    product: StorefrontProductDocument,
    existing: StorefrontProductVariantDocument[],
    session: ClientSession,
  ): Promise<{ categoryCode: string | null; modelNo: number | null; sizes: string[]; colors: Map<string, string> }> {
    const categoryCode = dto.skuCategoryCode ?? product.sku_category_code ?? null;
    const modelNo = dto.skuModelNo ?? product.sku_model_no ?? null;
    const hasRuleVariants = existing.some((v) => v.sku_color_code)
      || (await this.variants.exists({ product_id: product._id, sku_color_code: { $ne: null } }).session(session)) !== null;
    if (hasRuleVariants && (categoryCode !== product.sku_category_code || modelNo !== product.sku_model_no)) {
      throw new BadRequestException(
        `Danh mục/số mẫu SKU đã khoá (${String(product.sku_category_code)}-${String(product.sku_model_no ?? '').padStart(3, '0')}) vì sản phẩm đã có biến thể theo mã OptiPack.`,
      );
    }
    const needsRule = dto.variants.some((v) => !v.id);
    if (!needsRule) return { categoryCode, modelNo, sizes: [], colors: new Map() };
    if (!categoryCode || !modelNo) {
      throw new BadRequestException('Chọn danh mục OptiPack và số mẫu trước khi thêm biến thể — SKU phải theo quy tắc OptiPack (VD ATHUN-005-DEN-M).');
    }
    const category = await this.skuCategories.findOne({ code: categoryCode, level: 2, is_active: true }).session(session).lean();
    if (!category) throw new BadRequestException(`Danh mục "${categoryCode}" không phải danh mục cấp 2 đang dùng của OptiPack.`);
    const codes = [...new Set(dto.variants.flatMap((v) => (!v.id && v.colorCode ? [v.colorCode] : [])))];
    const colors = await this.skuColors.find({ code: { $in: codes }, is_active: true }).session(session).lean();
    return { categoryCode, modelNo, sizes: category.size_scale, colors: new Map(colors.map((c) => [c.code, c.name])) };
  }

  /** 22/10/2026 — ghép SKU biến thể mới theo quy tắc OptiPack; màu và size phải có trong danh mục OptiPack. */
  private buildRuleSku(
    rule: { categoryCode: string | null; modelNo: number | null; sizes: string[]; colors: Map<string, string> },
    input: SaveAdminProductDto['variants'][number],
    index: number,
  ): { sku: string; colorCode: string; colorName: string; size: string } {
    if (!rule.categoryCode || !rule.modelNo) throw new BadRequestException('Thiếu danh mục / số mẫu SKU.');
    const colorName = input.colorCode ? rule.colors.get(input.colorCode) : undefined;
    if (!input.colorCode || !colorName) {
      throw new BadRequestException(`Biến thể ${String(index + 1)}: chọn màu trong danh mục màu OptiPack.`);
    }
    const size = input.size?.trim().toUpperCase() ?? '';
    if (!rule.sizes.includes(size)) {
      throw new BadRequestException(`Biến thể ${String(index + 1)}: size phải thuộc thang size của ${rule.categoryCode} (${rule.sizes.join(', ')}).`);
    }
    return {
      sku: buildMasterSkuCode({ category_code: rule.categoryCode, model_no: rule.modelNo, color_code: input.colorCode, size }),
      colorCode: input.colorCode,
      colorName,
      size,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const productId = this.objectId(id);
    await this.connection.transaction(async (session) => {
      const product = await this.products.findOneAndUpdate(
        { _id: productId, deleted_at: null },
        { $set: { deleted_at: new Date(), status: 'hidden' } }, { session },
      );
      if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
      await this.variants.updateMany(
        { product_id: productId }, { $set: { is_active: false, is_default: false } }, { session },
      );
    });
    return { message: 'Đã xóa sản phẩm' };
  }
}
