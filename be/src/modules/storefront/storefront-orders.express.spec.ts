import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StorefrontOrdersService } from './storefront-orders.service';

//!=============================================
// 29/10/2026 — Checkout giao hỏa tốc: BE kiểm lại điều kiện (không tin trình duyệt), tính phí
// 45.000đ, lưu cách giao + giờ hẹn giao (giờ đặt + 3 giờ).
//!=============================================
describe('StorefrontOrdersService.checkout — giao hỏa tốc', () => {
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

  const dto = (ward: string): never => ({
    items: [{ variant_id: variantId.toString(), quantity: 1 }],
    shipping_address: { recipient_name: 'Lan', phone: '0901234567', province: 'Thành phố Hồ Chí Minh', ward, address_line: '12 Lê Lợi' },
    payment_method: 'cod',
    delivery_option: 'express',
  }) as never;

  afterEach(() => jest.useRealTimers());

  it('phường trong danh sách, 9:00 thứ năm → phí 45.000đ, hẹn giao 12:00', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-29T02:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, create } = build();
    await service.checkout(customerId, dto('Phường Bến Thành'));
    const doc = (create.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(doc).toMatchObject({ delivery_option: 'express', shipping_fee: 45_000, total_amount: 345_000 });
    expect((doc.promised_delivery_at as Date).toISOString()).toBe('2026-10-29T05:00:00.000Z');
  });

  it('phường ngoài danh sách → 400 SF_EXPRESS_UNAVAILABLE, không tạo đơn', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-29T02:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, create } = build();
    await expect(service.checkout(customerId, dto('Phường Vũng Tàu'))).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('ngoài giờ (Chủ nhật) → 400', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-01T03:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service } = build();
    await expect(service.checkout(customerId, dto('Phường Bến Thành'))).rejects.toMatchObject({
      response: { error_code: 'SF_EXPRESS_UNAVAILABLE' },
    });
  });
});
