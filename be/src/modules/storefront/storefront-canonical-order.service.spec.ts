import { Types } from 'mongoose';
import type { ConfigService } from '@nestjs/config';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { StorefrontCanonicalOrderService } from './storefront-canonical-order.service';

describe('StorefrontCanonicalOrderService', () => {
  it('projects a storefront order into orders, product_master and a deterministic order group', async () => {
    const storefrontOrderId = new Types.ObjectId();
    const itemId = new Types.ObjectId();
    const variantId = new Types.ObjectId();
    const canonicalOrder = {
      _id: new Types.ObjectId(),
      consolidated_group_id: null,
    };
    const storefrontOrder = {
      _id: storefrontOrderId,
      order_number: 'KA-ABC123',
      status: 'pending',
      payment_status: 'unpaid',
      fulfillment_status: 'awaiting_packaging',
      subtotal: 250000,
      discount_amount: 0,
      shipping_fee: 0,
      total_amount: 250000,
      currency: 'VND',
      canonical_sync_status: 'pending',
      canonical_order_id: null,
      shipping_address_snapshot: {
        recipient_name: 'Nguyễn Văn A',
        phone: '0901234567',
        province: 'Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        address_line: '1 Nguyễn Huệ',
      },
    };
    const item = {
      _id: itemId,
      order_id: storefrontOrderId,
      variant_id: variantId,
      sku_snapshot: 'SKU-1',
      product_name_snapshot: 'Áo thun',
      variant_snapshot: 'Đen / M',
      quantity: 2,
      unit_price: 125000,
    };

    const storefrontOrderModel = {
      findById: jest.fn().mockResolvedValue(storefrontOrder),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    const storefrontItemModel = { find: jest.fn().mockResolvedValue([item]) };
    const variantModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: variantId, weight_kg: 0.25 }]),
      }),
    };
    const orderModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue(canonicalOrder),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    const orderGroupModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    const productMasterModel = { bulkWrite: jest.fn().mockResolvedValue(undefined) };
    const configService = { get: jest.fn().mockReturnValue('AURELLE') } as unknown as ConfigService;

    const service = new StorefrontCanonicalOrderService(
      configService,
      storefrontOrderModel as never,
      storefrontItemModel as never,
      variantModel as never,
      orderModel as never,
      orderGroupModel as never,
      productMasterModel as never,
    );

    const result = await service.syncOrder(storefrontOrderId.toString());

    expect(result).toBe(canonicalOrder);
    expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: MarketplacePlatform.STOREFRONT,
        shop_id: 'storefront-main',
        platform_order_id: storefrontOrderId.toString(),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: OrderStatus.UNPAID,
          platform_order_number: 'KA-ABC123',
          items: [expect.objectContaining({ sku: 'SKU-1', quantity: 2 })],
        }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(orderGroupModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: canonicalOrder._id },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          platform: MarketplacePlatform.STOREFRONT,
          shop_id: 'storefront-main',
        }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(productMasterModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(storefrontOrderModel.updateOne).toHaveBeenCalledWith(
      { _id: storefrontOrderId },
      { $set: expect.objectContaining({ canonical_sync_status: 'synced' }) },
    );
  });

  it('does not create a second projection when the storefront order is already synced', async () => {
    const storefrontOrderId = new Types.ObjectId();
    const canonicalOrderId = new Types.ObjectId();
    const existingCanonicalOrder = { _id: canonicalOrderId };
    const storefrontOrder = {
      _id: storefrontOrderId,
      canonical_sync_status: 'synced',
      canonical_order_id: canonicalOrderId,
    };
    const storefrontOrderModel = {
      findById: jest.fn().mockResolvedValue(storefrontOrder),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    const orderModel = {
      findById: jest.fn().mockResolvedValue(existingCanonicalOrder),
      updateOne: jest.fn().mockResolvedValue(undefined),
      findOneAndUpdate: jest.fn(),
    };
    const orderGroupModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StorefrontCanonicalOrderService(
      { get: jest.fn().mockReturnValue('AURELLE') } as unknown as ConfigService,
      storefrontOrderModel as never,
      {} as never,
      {} as never,
      orderModel as never,
      orderGroupModel as never,
      {} as never,
    );

    await expect(service.syncOrder(storefrontOrderId.toString())).resolves.toBe(existingCanonicalOrder);
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
