import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { computeConsolidationKey } from '../orders/utils/consolidation-key.util';
import { OrderGroup, OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { ProductMaster, ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import {
  StorefrontOrder,
  StorefrontOrderDocument,
  StorefrontOrderItem,
  StorefrontOrderItemDocument,
  StorefrontProductVariant,
  StorefrontProductVariantDocument,
} from './schemas/storefront.schema';

export const STOREFRONT_SHOP_ID = 'storefront-main';

@Injectable()
export class StorefrontCanonicalOrderService {
  private readonly logger = new Logger(StorefrontCanonicalOrderService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(StorefrontOrder.name)
    private readonly storefrontOrderModel: Model<StorefrontOrderDocument>,
    @InjectModel(StorefrontOrderItem.name)
    private readonly storefrontItemModel: Model<StorefrontOrderItemDocument>,
    @InjectModel(StorefrontProductVariant.name)
    private readonly variantModel: Model<StorefrontProductVariantDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(OrderGroup.name)
    private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(ProductMaster.name)
    private readonly productMasterModel: Model<ProductMasterDocument>,
  ) {}

  private getStoreName(): string {
    return this.configService.get<string>('storefront.name', 'AURELLE');
  }

  async syncOrder(storefrontOrderId: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(storefrontOrderId)) {
      throw new NotFoundException('Không tìm thấy đơn storefront');
    }

    const storefrontOrder = await this.storefrontOrderModel.findById(storefrontOrderId);
    if (!storefrontOrder) throw new NotFoundException('Không tìm thấy đơn storefront');

    if (storefrontOrder.canonical_sync_status === 'synced' && storefrontOrder.canonical_order_id) {
      const existing = await this.orderModel.findById(storefrontOrder.canonical_order_id);
      if (existing) {
        // Keep the canonical projection in sync when the order was created
        // before the financial breakdown fields were added.
        await this.orderModel.updateOne(
          { _id: existing._id },
          {
            $set: {
              subtotal_amount: storefrontOrder.subtotal,
              discount_amount: storefrontOrder.discount_amount,
              shipping_fee: storefrontOrder.shipping_fee,
              total_amount: storefrontOrder.total_amount,
              currency: storefrontOrder.currency,
            },
          },
        );
        await this.storefrontOrderModel.updateOne(
          { _id: storefrontOrder._id },
          { $set: { canonical_financials_synced_at: new Date() } },
        );
        await this.ensureOrderGroup(existing);
        return existing;
      }
    }

    try {
      const items = await this.storefrontItemModel.find({ order_id: storefrontOrder._id });
      if (items.length === 0) throw new Error('Đơn storefront chưa có item để canonical hóa');

      const variants = await this.variantModel.find({
        _id: { $in: items.map((item) => item.variant_id) },
      }).lean();
      const variantMap = new Map(variants.map((variant) => [variant._id.toString(), variant]));
      const status = this.mapOrderStatus(storefrontOrder);
      const address = storefrontOrder.shipping_address_snapshot;
      const city = [address.province, address.district, address.ward].filter(Boolean).join(', ');

      const canonicalItems = items.map((item) => ({
        platform_order_item_id: item._id.toString(),
        sku: item.sku_snapshot,
        name: item.product_name_snapshot,
        variation: item.variant_snapshot,
        quantity: item.quantity,
        unit_price: item.unit_price,
        status,
      }));

      const canonicalOrder = await this.orderModel.findOneAndUpdate(
        {
          platform: MarketplacePlatform.STOREFRONT,
          shop_id: STOREFRONT_SHOP_ID,
          platform_order_id: storefrontOrder._id.toString(),
        },
        {
          $set: {
            marketplace_shop: null,
            platform: MarketplacePlatform.STOREFRONT,
            shop_id: STOREFRONT_SHOP_ID,
            platform_order_id: storefrontOrder._id.toString(),
            platform_order_number: storefrontOrder.order_number,
            status,
            raw_statuses: [
              storefrontOrder.status,
              storefrontOrder.payment_status,
              storefrontOrder.fulfillment_status,
            ],
            recipient: {
              full_name: address.recipient_name,
              phone: address.phone,
              address_line1: address.address_line,
              city,
              country: 'VN',
            },
            consolidation_key: computeConsolidationKey(
              MarketplacePlatform.STOREFRONT,
              address.phone,
              address.address_line,
              city,
            ),
            items: canonicalItems,
            total_amount: storefrontOrder.total_amount,
            subtotal_amount: storefrontOrder.subtotal,
            discount_amount: storefrontOrder.discount_amount,
            shipping_fee: storefrontOrder.shipping_fee,
            currency: storefrontOrder.currency,
            synced_at: new Date(),
          },
          $setOnInsert: {
            need_cancel_confirm: false,
            is_cancel_pending: false,
            cancel_trigger_time: null,
            reverse_order_id: null,
            is_consolidated: false,
            consolidated_group_id: null,
            is_active: true,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );

      if (!canonicalOrder) throw new Error('Không thể tạo canonical order');

      await this.syncProductMaster(items, variantMap);
      await this.ensureOrderGroup(canonicalOrder);

      await this.storefrontOrderModel.updateOne(
        { _id: storefrontOrder._id },
        {
          $set: {
            canonical_order_id: canonicalOrder._id,
            canonical_sync_status: 'synced',
            canonical_sync_error: null,
            canonical_synced_at: new Date(),
            canonical_financials_synced_at: new Date(),
          },
        },
      );

      return canonicalOrder;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      await this.storefrontOrderModel.updateOne(
        { _id: storefrontOrder._id },
        { $set: { canonical_sync_status: 'failed', canonical_sync_error: message } },
      );
      this.logger.error(`Canonical hóa storefront order ${storefrontOrder.order_number} thất bại`, error);
      throw error;
    }
  }

  async syncPending(limit = 100): Promise<{ attempted: number; synced: number; failed: number }> {
    const pendingOrders = await this.storefrontOrderModel
      .find({
        $or: [
          { canonical_sync_status: { $in: ['pending', 'failed'] } },
          {
            canonical_sync_status: { $exists: false },
            status: { $nin: ['cancelled', 'completed'] },
          },
          {
            canonical_sync_status: 'synced',
            canonical_order_id: { $ne: null },
            $or: [
              { canonical_financials_synced_at: null },
              { canonical_financials_synced_at: { $exists: false } },
            ],
          },
        ],
      })
      .sort({ created_at: 1 })
      .limit(limit)
      .select('_id');

    let synced = 0;
    let failed = 0;
    for (const order of pendingOrders) {
      try {
        await this.syncOrder(order._id.toString());
        synced += 1;
      } catch {
        failed += 1;
      }
    }
    return { attempted: pendingOrders.length, synced, failed };
  }

  private async ensureOrderGroup(order: OrderDocument): Promise<void> {
    // Storefront orders are intentionally group-of-one for now. Using the
    // canonical order id makes this operation deterministic and retry-safe.
    const groupId = order.consolidated_group_id ?? order._id;
    await this.orderGroupModel.findOneAndUpdate(
      { _id: groupId },
      {
        $setOnInsert: {
          _id: groupId,
          platform: MarketplacePlatform.STOREFRONT,
          shop_id: STOREFRONT_SHOP_ID,
          order_count: 1,
          shop_name_snapshot: this.getStoreName(),
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    // Backfill groups created before the storefront name became configurable.
    await this.orderGroupModel.updateOne(
      { _id: groupId, shop_name_snapshot: 'Storefront' },
      { $set: { shop_name_snapshot: this.getStoreName() } },
    );
    if (!order.consolidated_group_id) {
      await this.orderModel.updateOne(
        { _id: order._id, consolidated_group_id: null },
        { $set: { consolidated_group_id: groupId } },
      );
    }
  }

  private async syncProductMaster(
    items: StorefrontOrderItemDocument[],
    variantMap: Map<string, StorefrontProductVariantDocument>,
  ): Promise<void> {
    const now = new Date();
    const operations = items.map((item) => {
      const variant = variantMap.get(item.variant_id.toString());
      const dimension = variant?.weight_kg && variant.weight_kg > 0
        ? { package_weight_kg: variant.weight_kg }
        : undefined;
      const setFields: Record<string, unknown> = { last_synced_at: now };
      if (dimension) setFields.marketplace_dimension = dimension;

      return {
        updateOne: {
          filter: {
            platform: MarketplacePlatform.STOREFRONT,
            shop_id: STOREFRONT_SHOP_ID,
            seller_sku: item.sku_snapshot,
          },
          update: {
            $set: setFields,
            $setOnInsert: { packaging_profile_status: 'needs_measurement' as const },
          },
          upsert: true,
        },
      };
    });
    if (operations.length > 0) await this.productMasterModel.bulkWrite(operations);
  }

  private mapOrderStatus(order: StorefrontOrderDocument): OrderStatus {
    if (order.status === 'cancelled' || order.payment_status === 'refunded') return OrderStatus.CANCELED;
    if (order.payment_status === 'failed') return OrderStatus.FAILED;
    switch (order.fulfillment_status) {
      case 'packed': return OrderStatus.PACKED;
      case 'shipped': return OrderStatus.SHIPPED;
      case 'delivered': return OrderStatus.DELIVERED;
      case 'returned': return OrderStatus.RETURNED;
      default: return order.payment_status === 'unpaid' ? OrderStatus.UNPAID : OrderStatus.PENDING;
    }
  }
}
