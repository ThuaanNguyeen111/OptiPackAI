import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CustomerAddressSnapshot,
  StorefrontInventoryStock,
  StorefrontInventoryStockDocument,
  StorefrontOrder,
  StorefrontOrderDocument,
  StorefrontOrderItem,
  StorefrontOrderItemDocument,
  StorefrontPayment,
  StorefrontPaymentDocument,
  StorefrontProduct,
  StorefrontProductDocument,
  StorefrontProductVariant,
  StorefrontProductVariantDocument,
} from './schemas/storefront.schema';
import { CheckoutDto } from './dto/storefront.dto';
import { StorefrontCanonicalOrderService } from './storefront-canonical-order.service';
import { calculateOrderTotal } from './storefront-pricing';

@Injectable()
export class StorefrontOrdersService {
  constructor(
    @InjectModel(StorefrontOrder.name) private readonly orderModel: Model<StorefrontOrderDocument>,
    @InjectModel(StorefrontOrderItem.name) private readonly itemModel: Model<StorefrontOrderItemDocument>,
    @InjectModel(StorefrontPayment.name) private readonly paymentModel: Model<StorefrontPaymentDocument>,
    @InjectModel(StorefrontProductVariant.name) private readonly variantModel: Model<StorefrontProductVariantDocument>,
    @InjectModel(StorefrontProduct.name) private readonly productModel: Model<StorefrontProductDocument>,
    @InjectModel(StorefrontInventoryStock.name) private readonly stockModel: Model<StorefrontInventoryStockDocument>,
    private readonly canonicalOrders: StorefrontCanonicalOrderService,
  ) {}

  async checkout(customerId: string, dto: CheckoutDto) {
    if (!dto.items.length) throw new BadRequestException('Giỏ hàng đang trống');

    const customerObjectId = new Types.ObjectId(customerId);
    if (dto.client_order_id) {
      const existing = await this.orderModel.findOne({
        customer_id: customerObjectId,
        client_order_id: dto.client_order_id,
      });
      if (existing) {
        if (existing.canonical_sync_status !== 'synced') await this.tryCanonicalSync(existing);
        return this.toResponse(existing);
      }
    }

    const ids = dto.items.map((item) => new Types.ObjectId(item.variant_id));
    const variants = await this.variantModel.find({ _id: { $in: ids }, is_active: true });
    if (variants.length !== dto.items.length) throw new BadRequestException('Một sản phẩm không còn khả dụng');

    const products = await this.productModel.find({
      _id: { $in: variants.map((variant) => variant.product_id) },
      status: 'active',
    });
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));
    const stockMap = new Map(
      (await this.stockModel.find({ variant_id: { $in: ids } }))
        .map((stock) => [stock.variant_id.toString(), stock]),
    );

    const itemDocs = dto.items.map((input) => {
      const variant = variants.find((candidate) => candidate.id === input.variant_id);
      if (!variant) throw new NotFoundException('Không tìm thấy biến thể');
      const stock = stockMap.get(variant.id);
      const available = (stock?.quantity_on_hand ?? 0) - (stock?.reserved_quantity ?? 0);
      if (available < input.quantity) throw new BadRequestException(`SKU ${variant.sku} không đủ tồn kho`);
      const product = productMap.get(variant.product_id.toString());
      if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
      return {
        product_id: product._id,
        variant_id: variant._id,
        sku_snapshot: variant.sku,
        product_name_snapshot: product.name,
        variant_snapshot: variant.variant_name,
        image_snapshot: variant.image_url ?? product.thumbnail_url,
        unit_price: variant.price,
        quantity: input.quantity,
        discount_amount: 0,
        line_total: variant.price * input.quantity,
      };
    });

    const subtotal = itemDocs.reduce((sum, item) => sum + item.line_total, 0);
    const discountAmount = 0;
    const { shippingFee, total } = calculateOrderTotal(subtotal, discountAmount);
    let order: StorefrontOrderDocument;
    try {
      order = await this.orderModel.create({
        customer_id: customerObjectId,
        client_order_id: dto.client_order_id,
        order_number: `KA-${Date.now().toString(36).toUpperCase()}`,
        subtotal,
        discount_amount: discountAmount,
        shipping_fee: shippingFee,
        total_amount: total,
        currency: 'VND',
        shipping_address_snapshot: dto.shipping_address as CustomerAddressSnapshot,
        customer_note: dto.customer_note ?? '',
        placed_at: new Date(),
      });
    } catch (error) {
      if (!dto.client_order_id || !this.isDuplicateKeyError(error)) throw error;
      const existing = await this.orderModel.findOne({
        customer_id: customerObjectId,
        client_order_id: dto.client_order_id,
      });
      if (!existing) throw error;
      if (existing.canonical_sync_status !== 'synced') await this.tryCanonicalSync(existing);
      return this.toResponse(existing);
    }
    await this.itemModel.insertMany(itemDocs.map((item) => ({ ...item, order_id: order._id })));
    await this.paymentModel.create({
      order_id: order._id,
      payment_method: dto.payment_method,
      amount: order.total_amount,
      status: 'pending',
    });
    for (const item of itemDocs) {
      await this.stockModel.updateOne(
        { variant_id: item.variant_id },
        { $inc: { reserved_quantity: item.quantity } },
      );
    }

    await this.tryCanonicalSync(order);
    return this.toResponse(order);
  }

  async list(customerId: string) {
    const orders = await this.orderModel
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .limit(50);
    return orders.map((order) => this.toResponse(order));
  }

  async findOne(customerId: string, id: string) {
    const order = await this.orderModel.findOne({ _id: id, customer_id: new Types.ObjectId(customerId) });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    const [items, payment] = await Promise.all([
      this.itemModel.find({ order_id: order._id }).lean(),
      this.paymentModel.findOne({ order_id: order._id }).lean(),
    ]);
    return {
      ...this.toResponse(order),
      shippingAddress: order.shipping_address_snapshot,
      paymentMethod: payment?.payment_method ?? null,
      items,
    };
  }

  private async tryCanonicalSync(order: StorefrontOrderDocument): Promise<void> {
    try {
      await this.canonicalOrders.syncOrder(order._id.toString());
      const refreshed = await this.orderModel.findById(order._id);
      if (refreshed) Object.assign(order, refreshed.toObject());
    } catch {
      // The storefront order remains valid. The scheduler retries the
      // canonical projection after a transient sync failure.
    }
  }

  private toResponse(order: StorefrontOrderDocument) {
    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      totalAmount: order.total_amount,
      subtotal: order.subtotal,
      discountAmount: order.discount_amount,
      shippingFee: order.shipping_fee,
      currency: order.currency,
      createdAt: order.created_at ?? new Date(0),
      canonicalOrderId: order.canonical_order_id?.toString() ?? null,
      canonicalSyncStatus: order.canonical_sync_status ?? 'pending',
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
