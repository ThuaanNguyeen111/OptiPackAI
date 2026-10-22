import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StorefrontOrdersService } from './storefront-orders.service';

const customerId = new Types.ObjectId().toString();
const orderId = new Types.ObjectId();

function build(options: { cancelled?: Record<string, unknown> | null; exists?: boolean; items?: Record<string, unknown>[] }) {
  const findOneAndUpdate = jest.fn().mockResolvedValue(options.cancelled ?? null);
  const exists = jest.fn().mockResolvedValue(options.exists ? { _id: orderId } : null);
  const stockUpdate = jest.fn().mockResolvedValue({});
  const paymentUpdate = jest.fn().mockResolvedValue({});
  const eventCreate = jest.fn<Promise<object>, [Record<string, unknown>]>().mockResolvedValue({});
  const notify = jest.fn();
  const variantA = new Types.ObjectId();
  const variantB = new Types.ObjectId();
  const service = new StorefrontOrdersService(
    { findOneAndUpdate, exists } as never,
    { find: () => ({ lean: () => Promise.resolve(options.items ?? [{ variant_id: variantA, quantity: 2 }, { variant_id: variantB, quantity: 1 }]) }) } as never,
    { updateOne: paymentUpdate } as never,
    {} as never,
    {} as never,
    { updateOne: stockUpdate } as never,
    {} as never,
    { create: eventCreate } as never,
    {} as never,
    { notifyOrderChanged: notify } as never,
  );
  return { service, findOneAndUpdate, exists, stockUpdate, paymentUpdate, eventCreate, notify, variantA, variantB };
}

const cancelledDoc = {
  _id: orderId,
  id: orderId.toString(),
  order_number: 'KA-1',
  public_order_id: 720000005,
  status: 'cancelled',
  payment_status: 'unpaid',
  fulfillment_status: 'awaiting_packaging',
  total_amount: 100,
  subtotal: 100,
  discount_amount: 0,
  shipping_fee: 0,
  currency: 'VND',
};

describe('StorefrontOrdersService.cancel', () => {
  it('id sai định dạng → 404', async () => {
    const { service } = build({});
    await expect(service.cancel(customerId, 'abc')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hủy được: cổng nguyên tử lọc đúng khách + pending + chưa đóng gói', async () => {
    const { service, findOneAndUpdate } = build({ cancelled: cancelledDoc });
    await service.cancel(customerId, orderId.toString());
    const [filter, update] = findOneAndUpdate.mock.calls[0] as [Record<string, unknown>, { $set: Record<string, unknown> }];
    expect(filter).toMatchObject({ status: 'pending', fulfillment_status: 'awaiting_packaging' });
    expect(String(filter.customer_id)).toBe(customerId);
    expect(update.$set).toEqual({ status: 'cancelled', stock_state: 'released', cancel_source: 'customer' });
  });

  it('trả lại đúng số tồn đã giữ của từng món, ghi hành trình của khách, báo OptiPack', async () => {
    const { service, stockUpdate, eventCreate, notify, paymentUpdate, variantA } = build({ cancelled: cancelledDoc });
    await service.cancel(customerId, orderId.toString(), '  Đặt nhầm size ');

    expect(stockUpdate).toHaveBeenCalledTimes(2);
    expect(stockUpdate.mock.calls[0]).toEqual([{ variant_id: variantA }, { $inc: { reserved_quantity: -2 } }]);
    expect(paymentUpdate).toHaveBeenCalledWith(
      { order_id: orderId, status: 'pending' },
      { $set: { status: 'failed', failure_reason: 'Khách hủy đơn' } },
    );
    expect(eventCreate.mock.calls[0]?.[0]).toMatchObject({
      status: 'canceled',
      source: 'customer',
      reason: 'Đặt nhầm size',
      public_order_id: 720000005,
    });
    expect(notify).toHaveBeenCalledWith(720000005, 'canceled');
  });

  it('đơn đã đóng gói/đã hủy: 409 và KHÔNG trả tồn lần nữa', async () => {
    const { service, stockUpdate, eventCreate, notify } = build({ cancelled: null, exists: true });
    await expect(service.cancel(customerId, orderId.toString())).rejects.toBeInstanceOf(ConflictException);
    expect(stockUpdate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('đơn của người khác hoặc không tồn tại: 404 (không lộ là có đơn)', async () => {
    const { service } = build({ cancelled: null, exists: false });
    await expect(service.cancel(customerId, orderId.toString())).rejects.toBeInstanceOf(NotFoundException);
  });
});
