import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AddCartItemDto, SyncCartDto } from './dto/storefront.dto';
import {
  StorefrontCart,
  StorefrontCartDocument,
  StorefrontCartItem,
  StorefrontCartItemDocument,
  StorefrontInventoryStock,
  StorefrontInventoryStockDocument,
  StorefrontProduct,
  StorefrontProductDocument,
  StorefrontProductVariant,
  StorefrontProductVariantDocument,
} from './schemas/storefront.schema';

@Injectable()
export class StorefrontCartService {
  constructor(
    @InjectModel(StorefrontCart.name)
    private readonly cartModel: Model<StorefrontCartDocument>,
    @InjectModel(StorefrontCartItem.name)
    private readonly itemModel: Model<StorefrontCartItemDocument>,
    @InjectModel(StorefrontProductVariant.name)
    private readonly variantModel: Model<StorefrontProductVariantDocument>,
    @InjectModel(StorefrontProduct.name)
    private readonly productModel: Model<StorefrontProductDocument>,
    @InjectModel(StorefrontInventoryStock.name)
    private readonly stockModel: Model<StorefrontInventoryStockDocument>,
  ) {}

  private objectId(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Mã biến thể không hợp lệ');
    }

    return new Types.ObjectId(value);
  }

  private async getOrCreate(customerId: string) {
    const customerObjectId = this.objectId(customerId);

    return this.cartModel.findOneAndUpdate(
      { customer_id: customerObjectId, status: 'active' },
      {
        $setOnInsert: {
          customer_id: customerObjectId,
          status: 'active',
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  }

  private async getAvailableQuantity(variantId: Types.ObjectId) {
    const stock = await this.stockModel.findOne({ variant_id: variantId }).lean();

    return Math.max(
      0,
      (stock?.quantity_on_hand ?? 0) - (stock?.reserved_quantity ?? 0),
    );
  }

  async get(customerId: string) {
    const cart = await this.getOrCreate(customerId);
    const items = await this.itemModel.find({ cart_id: cart._id }).lean();
    const variantIds = items.map((item) => item.variant_id);
    const variants = await this.variantModel
      .find({ _id: { $in: variantIds }, is_active: true })
      .lean();
    const products = await this.productModel
      .find({
        _id: { $in: variants.map((variant) => variant.product_id) },
        status: 'active',
      })
      .lean();
    const stocks = await this.stockModel.find({ variant_id: { $in: variantIds } }).lean();

    const variantMap = new Map(variants.map((variant) => [variant._id.toString(), variant]));
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));
    const stockMap = new Map(stocks.map((stock) => [stock.variant_id.toString(), stock]));

    return {
      id: cart.id,
      items: items.flatMap((item) => {
        const variant = variantMap.get(item.variant_id.toString());
        const product = variant ? productMap.get(variant.product_id.toString()) : undefined;

        if (!variant || !product) return [];

        const stock = stockMap.get(variant._id.toString());
        const availableQuantity = Math.max(
          0,
          (stock?.quantity_on_hand ?? 0) - (stock?.reserved_quantity ?? 0),
        );

        return [
          {
            variant: {
              id: variant._id.toString(),
              productId: product._id.toString(),
              sku: variant.sku,
              variantName: variant.variant_name,
              color: variant.color,
              size: variant.size,
              imageUrl: variant.image_url,
              price: variant.price,
              compareAtPrice: variant.compare_at_price,
              availableQuantity,
              isDefault: variant.is_default,
            },
            product: {
              id: product._id.toString(),
              name: product.name,
              slug: product.slug,
              thumbnailUrl: product.thumbnail_url,
            },
            quantity: item.quantity,
          },
        ];
      }),
    };
  }

  async add(customerId: string, dto: AddCartItemDto) {
    const variantId = this.objectId(dto.variant_id);
    const variant = await this.variantModel.findOne({ _id: variantId, is_active: true });

    if (!variant) throw new NotFoundException('Không tìm thấy biến thể');

    const availableQuantity = await this.getAvailableQuantity(variantId);
    const cart = await this.getOrCreate(customerId);
    const existing = await this.itemModel.findOne({
      cart_id: cart._id,
      variant_id: variantId,
    });
    const quantity = Math.min(
      availableQuantity,
      (existing?.quantity ?? 0) + dto.quantity,
    );

    if (quantity < 1) throw new BadRequestException('Sản phẩm đã hết hàng');

    await this.itemModel.findOneAndUpdate(
      { cart_id: cart._id, variant_id: variantId },
      {
        $set: {
          product_id: variant.product_id,
          sku: variant.sku,
          quantity,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return this.get(customerId);
  }

  async update(customerId: string, variantId: string, quantity: number) {
    if (quantity < 1) {
      throw new BadRequestException('Số lượng phải lớn hơn 0');
    }

    const variantObjectId = this.objectId(variantId);
    const availableQuantity = await this.getAvailableQuantity(variantObjectId);

    if (availableQuantity < quantity) {
      throw new BadRequestException('Số lượng vượt quá tồn kho');
    }

    const cart = await this.getOrCreate(customerId);
    const item = await this.itemModel.findOneAndUpdate(
      { cart_id: cart._id, variant_id: variantObjectId },
      { $set: { quantity } },
      { returnDocument: 'after' },
    );

    if (!item) throw new NotFoundException('Sản phẩm không có trong giỏ');

    return this.get(customerId);
  }

  async remove(customerId: string, variantId: string) {
    const cart = await this.getOrCreate(customerId);
    await this.itemModel.deleteOne({
      cart_id: cart._id,
      variant_id: this.objectId(variantId),
    });

    return this.get(customerId);
  }

  async clear(customerId: string) {
    const cart = await this.getOrCreate(customerId);
    await this.itemModel.deleteMany({ cart_id: cart._id });

    return this.get(customerId);
  }

  async sync(customerId: string, dto: SyncCartDto) {
    for (const item of dto.items) {
      await this.add(customerId, item);
    }

    return this.get(customerId);
  }
}
