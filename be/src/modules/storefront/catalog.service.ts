import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  StorefrontCategory,
  StorefrontCategoryDocument,
  StorefrontInventoryStock,
  StorefrontInventoryStockDocument,
  StorefrontProduct,
  StorefrontProductDocument,
  StorefrontProductVariant,
  StorefrontProductVariantDocument,
} from './schemas/storefront.schema';

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(StorefrontCategory.name)
    private readonly categoryModel: Model<StorefrontCategoryDocument>,
    @InjectModel(StorefrontProduct.name)
    private readonly productModel: Model<StorefrontProductDocument>,
    @InjectModel(StorefrontProductVariant.name)
    private readonly variantModel: Model<StorefrontProductVariantDocument>,
    @InjectModel(StorefrontInventoryStock.name)
    private readonly stockModel: Model<StorefrontInventoryStockDocument>,
  ) {}

  private async shape(product: StorefrontProductDocument, categoryName?: string) {
    const variants = await this.variantModel
      .find({ product_id: product._id, is_active: true })
      .lean();
    const stocks = await this.stockModel
      .find({ variant_id: { $in: variants.map((variant) => variant._id) } })
      .lean();
    const stockMap = new Map(stocks.map((stock) => [stock.variant_id.toString(), stock]));

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.category_id?.toString() ?? null,
      categoryName: categoryName ?? null,
      thumbnailUrl: product.thumbnail_url,
      galleryImages: product.gallery_images,
      sizeChart: product.size_chart ?? [],
      sizeChartType: product.size_chart_type ?? 'apparel',
      sizeGuideNote: product.size_guide_note ?? '',
      status: product.status,
      isFeatured: product.is_featured,
      variants: variants.map((variant) => ({
        id: variant._id.toString(),
        productId: product.id,
        sku: variant.sku,
        variantName: variant.variant_name,
        color: variant.color,
        size: variant.size,
        imageUrl: variant.image_url,
        price: variant.price,
        compareAtPrice: variant.compare_at_price,
        availableQuantity: Math.max(
          0,
          (stockMap.get(variant._id.toString())?.quantity_on_hand ?? 0)
            - (stockMap.get(variant._id.toString())?.reserved_quantity ?? 0),
        ),
        isDefault: variant.is_default,
      })),
    };
  }

  async list() {
    const [products, categories] = await Promise.all([
      this.productModel
        .find({ status: 'active' })
        .sort({ is_featured: -1, created_at: -1 })
        .limit(100),
      this.categoryModel.find({ is_active: true }).lean(),
    ]);
    const categoryMap = new Map(categories.map((category) => [category._id.toString(), category.name]));

    return Promise.all(products.map((product) => this.shape(
      product,
      product.category_id ? categoryMap.get(product.category_id.toString()) : undefined,
    )));
  }

  async findBySlug(slug: string) {
    const product = await this.productModel.findOne({
      slug: slug.toLowerCase(),
      status: 'active',
    });

    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    await this.productModel.updateOne(
      { _id: product._id },
      { $inc: { view_count: 1 } },
    );

    const category = product.category_id
      ? await this.categoryModel.findOne({ _id: product.category_id }).lean()
      : null;

    return this.shape(product, category?.name);
  }

  async categories() {
    return this.categoryModel
      .find({ is_active: true })
      .sort({ sort_order: 1, name: 1 })
      .lean();
  }
}
