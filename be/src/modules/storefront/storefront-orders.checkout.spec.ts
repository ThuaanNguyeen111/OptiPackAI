import { Types } from 'mongoose';
import { StorefrontOrdersService } from './storefront-orders.service';

// 22/11/2026 — shop đã gỡ giao hỏa tốc: đơn mới luôn giao tiêu chuẩn.
describe('StorefrontOrdersService.checkout — chỉ còn giao tiêu chuẩn', () => {
  const customerId = new Types.ObjectId().toString();
  const variantId = new Types.ObjectId();
  const productId = new Types.ObjectId();

  function build(): { service: StorefrontOrdersService; create: jest.Mock } {
    const create = jest.fn((doc: Record<string, unknown>) => Promise.resolve({ ...doc, _id: new Types.ObjectId(), id: 'o1', created_at: new Date() }));
    const service = new StorefrontOrdersService(
      { findOne: jest.fn().mockResolvedValue(null), create } as never,
      { insertMany: jest.fn().mockResolvedValue([]) } as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { find: jest.fn().mockResolvedValue([{ id: variantId.toString(), _id: variantId, product_id: productId, sku: 'AO-1', variant_name: 'Đen M', price: 300_000, image_url: null, stock_source: 'optipack' }]) } as never,
      { find: jest.fn().mockResolvedValue([{ _id: productId, name: 'Áo', thumbnail_url: '' }]) } as never,
      { find: jest.fn().mockResolvedValue([{ variant_id: variantId, quantity_on_hand: 10, reserved_quantity: 0 }]), updateOne: jest.fn().mockResolvedValue({}) } as never,
      { collection: { findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }) } } as never,
      {} as never,
      {} as never,
      { notifyOrderChanged: jest.fn() } as never,
    );
    return { service, create };
  }

  const dto = (): never => ({
    items: [{ variant_id: variantId.toString(), quantity: 1 }],
    shipping_address: { recipient_name: 'Lan', phone: '0901234567', province: 'Thành phố Hồ Chí Minh', ward: 'Phường Bến Thành', address_line: '12 Lê Lợi' },
    payment_method: 'cod',
  }) as never;

  it('phí 30.000đ, lưu standard, không có giờ hẹn', async () => {
    const { service, create } = build();
    await service.checkout(customerId, dto());
    const doc = (create.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(doc).toMatchObject({ delivery_option: 'standard', shipping_fee: 30_000, total_amount: 330_000, promised_delivery_at: null });
  });
});
