import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CatalogService } from './catalog.service';
import { SaveAdminProductDto } from './dto/storefront-admin.dto';
import {
  StorefrontCategory, StorefrontCategoryDocument, StorefrontInventoryStock, StorefrontInventoryStockDocument,
  StorefrontProduct, StorefrontProductDocument, StorefrontProductVariant, StorefrontProductVariantDocument,
} from './schemas/storefront.schema';

export type AdminCatalogProduct = Awaited<ReturnType<CatalogService['shape']>>;

@Injectable()
export class StorefrontAdminService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(StorefrontProduct.name) private readonly products: Model<StorefrontProductDocument>,
    @InjectModel(StorefrontProductVariant.name) private readonly variants: Model<StorefrontProductVariantDocument>,
    @InjectModel(StorefrontInventoryStock.name) private readonly stocks: Model<StorefrontInventoryStockDocument>,
    @InjectModel(StorefrontCategory.name) private readonly categories: Model<StorefrontCategoryDocument>,
    private readonly catalog: CatalogService,
  ) {}

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
        product.set({
          name: dto.name.trim(), description: dto.description, category_id: dto.categoryId ?? null,
          thumbnail_url: dto.thumbnailUrl,
          gallery_images: [...new Set([dto.thumbnailUrl, ...dto.galleryImages])],
          status: dto.status, is_featured: dto.isFeatured,
        });
        await product.save({ session });

        for (const [index, input] of dto.variants.entries()) {
          const variant = input.id ? existingById.get(input.id) : new this.variants({
            product_id: productId, sku: `SF-${new Types.ObjectId().toHexString()}`,
          });
          if (!variant) throw new BadRequestException('Biến thể không hợp lệ');
          const color = input.color?.trim() ?? null;
          const size = input.size?.trim() ?? null;
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
    return this.findOne(productId.toHexString());
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
