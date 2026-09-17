import { Injectable, OnModuleInit } from '@nestjs/common';
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
export class StorefrontSeedService implements OnModuleInit {
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

  async onModuleInit() {
    const categories = await Promise.all([
      this.categoryModel.findOneAndUpdate(
        { slug: 'tops' },
        { $setOnInsert: { name: 'Tops', slug: 'tops', sort_order: 1, is_active: true } },
        { upsert: true, returnDocument: 'after' },
      ),
      this.categoryModel.findOneAndUpdate(
        { slug: 'dresses' },
        { $setOnInsert: { name: 'Dresses', slug: 'dresses', sort_order: 2, is_active: true } },
        { upsert: true, returnDocument: 'after' },
      ),
      this.categoryModel.findOneAndUpdate(
        { slug: 'bags' },
        { $setOnInsert: { name: 'Bags', slug: 'bags', sort_order: 3, is_active: true } },
        { upsert: true, returnDocument: 'after' },
      ),
      this.categoryModel.findOneAndUpdate(
        { slug: 'accessories' },
        { $setOnInsert: { name: 'Accessories', slug: 'accessories', sort_order: 4, is_active: true } },
        { upsert: true, returnDocument: 'after' },
      ),
      this.categoryModel.findOneAndUpdate(
        { slug: 'jewelry' },
        { $setOnInsert: { name: 'Jewelry', slug: 'jewelry', sort_order: 5, is_active: true } },
        { upsert: true, returnDocument: 'after' },
      ),
      this.categoryModel.findOneAndUpdate(
        { slug: 'shoes' },
        { $setOnInsert: { name: 'Shoes', slug: 'shoes', sort_order: 6, is_active: true } },
        { upsert: true, returnDocument: 'after' },
      ),
    ]);

    const records = [
      {
        slug: 'minimal-cotton-shirt',
        name: 'Minimal Cotton Shirt',
        category_id: categories[0]._id,
        description: 'Áo sơ mi cotton mềm nhẹ, phom dáng tối giản cho ngày thường.',
        thumbnail_url: '/kaira-assets/images/product-item-1.jpg',
        gallery_images: [
          '/kaira-assets/images/product-item-1.jpg',
          '/kaira-assets/images/single-image-2.jpg',
          '/kaira-assets/images/product-item-5.jpg',
          '/kaira-assets/images/banner-image-2.jpg',
        ],
        size_chart: [
          { size: 'S', bust_cm: 96, waist_cm: 92, hip_cm: 98, length_cm: 70 },
          { size: 'M', bust_cm: 100, waist_cm: 96, hip_cm: 102, length_cm: 72 },
          { size: 'L', bust_cm: 104, waist_cm: 100, hip_cm: 106, length_cm: 74 },
        ],
        size_guide_note: 'Đo vòng ngực, eo và hông tại vị trí lớn nhất. Sai số 1–2 cm do đặc tính vải.',
        is_featured: true,
        variants: [
          { sku: 'MCS-BLK-M', variant_name: 'Black / M', color: 'Black', size: 'M', price: 690000, compare_at_price: 790000, stock: 12, is_default: true },
          { sku: 'MCS-WHT-L', variant_name: 'White / L', color: 'White', size: 'L', price: 690000, compare_at_price: 790000, stock: 8, is_default: false },
        ],
      },
      {
        slug: 'linen-midi-dress',
        name: 'Linen Midi Dress',
        category_id: categories[1]._id,
        description: 'Đầm linen thanh lịch, chất liệu thoáng mát và dễ phối đồ.',
        thumbnail_url: '/kaira-assets/images/product-item-2.jpg',
        gallery_images: [
          '/kaira-assets/images/product-item-2.jpg',
          '/kaira-assets/images/product-item-3.jpg',
          '/kaira-assets/images/product-item-6.jpg',
          '/kaira-assets/images/banner-image-3.jpg',
        ],
        size_chart: [
          { size: 'S', bust_cm: 84, waist_cm: 68, hip_cm: 92, length_cm: 118 },
          { size: 'M', bust_cm: 88, waist_cm: 72, hip_cm: 96, length_cm: 119 },
          { size: 'L', bust_cm: 92, waist_cm: 76, hip_cm: 100, length_cm: 120 },
        ],
        size_guide_note: 'Phom váy midi hơi ôm. Nếu bạn nằm giữa hai size, nên chọn size lớn hơn.',
        is_featured: true,
        variants: [
          { sku: 'LMD-NAT-S', variant_name: 'Natural / S', color: 'Natural', size: 'S', price: 890000, compare_at_price: null, stock: 5, is_default: true },
        ],
      },
      {
        slug: 'everyday-leather-bag',
        name: 'Everyday Leather Bag',
        category_id: categories[2]._id,
        description: 'Túi da gọn nhẹ cho công việc và những chuyến đi cuối tuần.',
        thumbnail_url: '/kaira-assets/images/product-item-3.jpg',
        gallery_images: [
          '/kaira-assets/images/product-item-3.jpg',
          '/kaira-assets/images/product-item-4.jpg',
          '/kaira-assets/images/product-item-7.jpg',
          '/kaira-assets/images/banner-image-4.jpg',
        ],
        size_chart: [],
        size_guide_note: 'Kích thước: 28 × 22 × 10 cm. Quai đeo điều chỉnh được.',
        is_featured: false,
        variants: [
          { sku: 'ELB-TAN-ONE', variant_name: 'Tan / One size', color: 'Tan', size: null, price: 1290000, compare_at_price: null, stock: 3, is_default: true },
        ],
      },
      {
        slug: 'silk-signature-scarf',
        name: 'Silk Signature Scarf',
        category_id: categories[3]._id,
        description: 'Khăn lụa mềm nhẹ, điểm nhấn thanh lịch cho mọi outfit.',
        thumbnail_url: '/kaira-assets/images/product-item-8.jpg',
        gallery_images: [
          '/kaira-assets/images/product-item-8.jpg',
          '/kaira-assets/images/banner-image-5.jpg',
          '/kaira-assets/images/cat-sm-item.jpg',
          '/kaira-assets/images/single-image-2.jpg',
        ],
        size_chart: [],
        size_guide_note: 'Kích thước: 70 × 70 cm. Chất liệu lụa mềm, phù hợp nhiều cách thắt.',
        is_featured: false,
        variants: [
          { sku: 'SSS-CRM-ONE', variant_name: 'Cream / One size', color: 'Cream', size: null, price: 390000, compare_at_price: 450000, stock: 10, is_default: true },
        ],
      },
      {
        slug: 'pearl-drop-earrings',
        name: 'Pearl Drop Earrings',
        category_id: categories[4]._id,
        description: 'Đôi bông tai ngọc trai tối giản, tạo điểm sáng tinh tế.',
        thumbnail_url: '/kaira-assets/images/product-item-9.jpg',
        gallery_images: [
          '/kaira-assets/images/product-item-9.jpg',
          '/kaira-assets/images/banner-image-6.jpg',
          '/kaira-assets/images/cat-sm-item2.jpg',
          '/kaira-assets/images/product-item-10.jpg',
        ],
        size_chart: [],
        size_guide_note: 'Chiều dài 3.2 cm. Bảo quản trong túi vải, tránh tiếp xúc với nước hoa.',
        is_featured: false,
        variants: [
          { sku: 'PDE-GLD-ONE', variant_name: 'Gold / One size', color: 'Gold', size: null, price: 450000, compare_at_price: null, stock: 7, is_default: true },
        ],
      },
      {
        slug: 'soft-leather-loafers',
        name: 'Soft Leather Loafers',
        category_id: categories[5]._id,
        description: 'Loafer da mềm với phom thanh lịch, đồng hành từ văn phòng đến cuối tuần.',
        thumbnail_url: '/kaira-assets/images/product-item-10.jpg',
        gallery_images: [
          '/kaira-assets/images/product-item-10.jpg',
          '/kaira-assets/images/product-item-4.jpg',
          '/kaira-assets/images/banner-image-2.jpg',
          '/kaira-assets/images/cat-large-item3.jpg',
        ],
        size_chart: [
          { size: '36', bust_cm: null, waist_cm: null, hip_cm: null, length_cm: 23 },
          { size: '37', bust_cm: null, waist_cm: null, hip_cm: null, length_cm: 24 },
          { size: '38', bust_cm: null, waist_cm: null, hip_cm: null, length_cm: 25 },
          { size: '39', bust_cm: null, waist_cm: null, hip_cm: null, length_cm: 26 },
        ],
        size_guide_note: 'Chiều dài bàn chân tham khảo theo cm. Nếu ở giữa hai size, nên chọn size lớn hơn.',
        is_featured: false,
        variants: [
          { sku: 'SLL-BRN-37', variant_name: 'Brown / 37', color: 'Brown', size: '37', price: 1190000, compare_at_price: 1390000, stock: 4, is_default: true },
          { sku: 'SLL-BRN-38', variant_name: 'Brown / 38', color: 'Brown', size: '38', price: 1190000, compare_at_price: 1390000, stock: 5, is_default: false },
          { sku: 'SLL-BRN-39', variant_name: 'Brown / 39', color: 'Brown', size: '39', price: 1190000, compare_at_price: 1390000, stock: 3, is_default: false },
        ],
      },
    ];

    for (const record of records) {
      const product = await this.productModel.findOneAndUpdate(
        { slug: record.slug },
        {
          $set: {
            gallery_images: record.gallery_images,
            size_chart: record.size_chart,
            size_chart_type: record.slug === 'soft-leather-loafers' ? 'shoes' : 'apparel',
            size_guide_note: record.size_guide_note,
          },
          $setOnInsert: {
            name: record.name,
            slug: record.slug,
            category_id: record.category_id,
            description: record.description,
            thumbnail_url: record.thumbnail_url,
            status: 'active',
            is_featured: record.is_featured,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      for (const item of record.variants) {
        const variant = await this.variantModel.findOneAndUpdate(
          { sku: item.sku },
          {
            $setOnInsert: {
              product_id: product._id,
              sku: item.sku,
              variant_name: item.variant_name,
              color: item.color,
              size: item.size ?? null,
              price: item.price,
              compare_at_price: item.compare_at_price ?? null,
              is_default: item.is_default,
              is_active: true,
            },
          },
          { upsert: true, returnDocument: 'after' },
        );

        await this.stockModel.updateOne(
          { variant_id: variant._id, warehouse_id: null },
          {
            $setOnInsert: {
              variant_id: variant._id,
              warehouse_id: null,
              quantity_on_hand: item.stock,
              reserved_quantity: 0,
              reorder_level: 2,
            },
          },
          { upsert: true },
        );
      }
    }
  }
}
