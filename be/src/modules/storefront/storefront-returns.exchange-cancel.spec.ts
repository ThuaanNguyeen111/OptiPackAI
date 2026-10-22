import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StorefrontReturnsService } from './storefront-returns.service';
import type { CreateStorefrontReturnDto } from './dto/storefront.dto';

//!=============================================
// 21/10/2026 — Khách tự hủy yêu cầu trả hàng (mục 18) và đổi hàng trên website (mục 17).
//!=============================================
const customerId = new Types.ObjectId().toString();
const orderId = new Types.ObjectId();
const returnId = new Types.ObjectId();
const productAo = new Types.ObjectId();
const productQuan = new Types.ObjectId();
const variantAoL = new Types.ObjectId();
const variantQuan = new Types.ObjectId();

const lean = <T,>(value: T) => ({ lean: () => Promise.resolve(value), select: () => ({ lean: () => Promise.resolve(value) }), sort: () => ({ lean: () => Promise.resolve(value) }) });

function build(options: { cancelled?: Record<string, unknown> | null; exists?: boolean; stock?: number; variantActive?: boolean } = {}) {
  const returnDoc = {
    _id: returnId, id: returnId.toString(), order_id: orderId, public_order_id: 720000010, type: 'return_refund',
    status: 'canceled', items: [], exchange_items: [], customer_note: '', rma_code: null, decision_note: null,
  };
  const returnModel = {
    findOneAndUpdate: jest.fn().mockResolvedValue(options.cancelled === undefined ? returnDoc : options.cancelled),
    exists: jest.fn().mockResolvedValue(options.exists ? { _id: returnId } : null),
    find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) })),
    create: jest.fn((doc: Record<string, unknown>) => Promise.resolve({ ...returnDoc, ...doc, status: 'requested' })),
  };
  const orderModel = {
    findOne: jest.fn().mockResolvedValue({ _id: orderId, order_number: 'KA-1', public_order_id: 720000010, fulfillment_status: 'delivered', fulfillment_updated_at: new Date() }),
    findById: jest.fn(() => lean({ order_number: 'KA-1' })),
  };
  const itemModel = {
    find: jest.fn(() => lean([
      { sku_snapshot: 'AO-M', product_id: productAo, quantity: 1 },
      { sku_snapshot: 'QUAN-30', product_id: productQuan, quantity: 1 },
    ])),
  };
  const eventCreate = jest.fn().mockResolvedValue({});
  const publisher = { notifyReturnRequested: jest.fn(), notifyReturnCanceled: jest.fn() };
  const variantModel = {
    find: jest.fn(() => lean([
      { _id: variantAoL, sku: 'AO-L', product_id: productAo, is_active: options.variantActive ?? true, variant_name: 'Áo size L', color: null, size: 'L', stock_source: 'optipack' },
      { _id: variantQuan, sku: 'QUAN-31', product_id: productQuan, is_active: true, variant_name: 'Quần 31', color: null, size: '31', stock_source: 'optipack' },
    ])),
  };
  const stockModel = { find: jest.fn(() => lean([{ variant_id: variantAoL, quantity_on_hand: options.stock ?? 5, reserved_quantity: 1 }])) };
  const service = new StorefrontReturnsService(
    orderModel as never, itemModel as never, returnModel as never, { create: eventCreate } as never, publisher as never,
    variantModel as never, stockModel as never,
  );
  return { service, returnModel, eventCreate, publisher };
}

const exchangeDto = (exchange: { sku: string; quantity: number }[]): CreateStorefrontReturnDto => ({
  type: 'exchange',
  items: [{ sku: 'AO-M', quantity: 1, reason_code: 'size_not_fit' }],
  exchange_items: exchange,
});

describe('StorefrontReturnsService.cancel', () => {
  it('còn "requested" → hủy có điều kiện, ghi hành trình, báo OptiPack', async () => {
    const { service, returnModel, eventCreate, publisher } = build();
    const res = await service.cancel(customerId, returnId.toString());
    expect(res.status).toBe('canceled');
    const [filter] = returnModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toMatchObject({ status: 'requested' });
    expect(eventCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'return_canceled', source: 'customer' }));
    expect(publisher.notifyReturnCanceled).toHaveBeenCalledWith(720000010, returnId.toString());
  });

  it('cửa hàng đã xử lý (không còn "requested") → 409, không báo gì', async () => {
    const { service, publisher } = build({ cancelled: null, exists: true });
    await expect(service.cancel(customerId, returnId.toString())).rejects.toBeInstanceOf(ConflictException);
    expect(publisher.notifyReturnCanceled).not.toHaveBeenCalled();
  });

  it('yêu cầu của người khác / không có → 404', async () => {
    const { service } = build({ cancelled: null, exists: false });
    await expect(service.cancel(customerId, returnId.toString())).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancel(customerId, 'abc')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StorefrontReturnsService — đổi hàng', () => {
  it('đổi áo M sang áo L cùng sản phẩm, còn hàng → lưu exchange_items (mã viết hoa)', async () => {
    const { service, returnModel } = build();
    const res = await service.create(customerId, orderId.toString(), exchangeDto([{ sku: 'ao-l', quantity: 1 }]));
    expect(res.exchangeItems).toEqual([{ sku: 'AO-L', quantity: 1 }]);
    expect(returnModel.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'exchange', exchange_items: [{ sku: 'AO-L', quantity: 1 }] }));
  });

  it('không chọn hàng đổi sang / lệch số lượng → 400', async () => {
    const { service } = build();
    await expect(service.create(customerId, orderId.toString(), exchangeDto([]))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(customerId, orderId.toString(), exchangeDto([{ sku: 'AO-L', quantity: 2 }]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('đổi sang sản phẩm KHÁC (quần) hoặc biến thể ngừng bán → 400', async () => {
    const { service } = build();
    await expect(service.create(customerId, orderId.toString(), exchangeDto([{ sku: 'QUAN-31', quantity: 1 }]))).rejects.toBeInstanceOf(BadRequestException);
    const inactive = build({ variantActive: false });
    await expect(inactive.service.create(customerId, orderId.toString(), exchangeDto([{ sku: 'AO-L', quantity: 1 }]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('biến thể đổi sang hết hàng (tồn − giữ chỗ < số cần) → 400', async () => {
    const { service } = build({ stock: 1 }); // 1 − 1 giữ chỗ = 0
    await expect(service.create(customerId, orderId.toString(), exchangeDto([{ sku: 'AO-L', quantity: 1 }]))).rejects.toMatchObject({
      response: expect.objectContaining({ error_code: 'SF_OUT_OF_STOCK' }) as unknown,
    });
  });

  it('danh sách lựa chọn đổi: mỗi sản phẩm trong đơn kèm biến thể cùng sản phẩm + số còn bán', async () => {
    const { service } = build();
    const options = await service.exchangeOptions(customerId, orderId.toString());
    expect(options.find((o) => o.sku === 'AO-M')?.options).toEqual([expect.objectContaining({ sku: 'AO-L', available: 4 })]);
    expect(options.find((o) => o.sku === 'QUAN-30')?.options).toEqual([expect.objectContaining({ sku: 'QUAN-31', available: 0 })]);
  });
});
