import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StorefrontReturnsService } from './storefront-returns.service';
import type { CreateStorefrontReturnDto } from './dto/storefront.dto';

const customerId = new Types.ObjectId().toString();
const orderId = new Types.ObjectId();

function orderDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: orderId,
    order_number: 'KA-1',
    public_order_id: 720000010,
    fulfillment_status: 'delivered',
    fulfillment_updated_at: new Date(Date.now() - 2 * 86_400_000),
    ...overrides,
  };
}

function build(options: {
  order?: Record<string, unknown> | null;
  open?: boolean;
  items?: { sku_snapshot: string; quantity: number }[];
  earlier?: { items: { sku: string; quantity: number }[] }[];
  createError?: unknown;
}) {
  const created = {
    _id: new Types.ObjectId(),
    id: 'ret1',
    order_id: orderId,
    type: 'return_refund',
    status: 'requested',
    items: [],
    customer_note: '',
    rma_code: null,
    decision_note: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const returnCreate = options.createError
    ? jest.fn<Promise<object>, [Record<string, unknown>]>().mockRejectedValue(options.createError)
    : jest.fn<Promise<object>, [Record<string, unknown>]>().mockResolvedValue(created);
  const eventCreate = jest.fn<Promise<object>, [Record<string, unknown>]>().mockResolvedValue({});
  const notify = jest.fn();
  const returnModel = {
    exists: jest.fn().mockResolvedValue(options.open ? { _id: new Types.ObjectId() } : null),
    find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(options.earlier ?? []) }) })),
    create: returnCreate,
  };
  const service = new StorefrontReturnsService(
    { findOne: jest.fn().mockResolvedValue(options.order === undefined ? orderDoc() : options.order) } as never,
    { find: () => ({ lean: () => Promise.resolve(options.items ?? [{ sku_snapshot: 'A-M', quantity: 2 }, { sku_snapshot: 'B-L', quantity: 1 }]) }) } as never,
    returnModel as never,
    { create: eventCreate } as never,
    { notifyReturnRequested: notify } as never,
  );
  return { service, returnCreate, eventCreate, notify, returnModel };
}

const dto = (items: { sku: string; quantity: number }[]): CreateStorefrontReturnDto => ({
  type: 'return_refund',
  items: items.map((item) => ({ ...item, reason_code: 'size_not_fit' })),
  customer_note: ' Chật quá ',
});

describe('StorefrontReturnsService.create', () => {
  it('không tìm thấy đơn của khách → 404', async () => {
    const { service } = build({ order: null });
    await expect(service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('đơn chưa giao → 409', async () => {
    const { service } = build({ order: orderDoc({ fulfillment_status: 'shipped' }) });
    await expect(service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]))).rejects.toBeInstanceOf(ConflictException);
  });

  it('quá 15 ngày kể từ khi nhận hàng → 409', async () => {
    const { service } = build({ order: orderDoc({ fulfillment_updated_at: new Date(Date.now() - 16 * 86_400_000) }) });
    await expect(service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]))).rejects.toMatchObject({
      response: { error_code: 'SF_RETURN_WINDOW_EXPIRED' },
    });
  });

  it('đang có yêu cầu mở → 409', async () => {
    const { service } = build({ open: true });
    await expect(service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]))).rejects.toMatchObject({
      response: { error_code: 'SF_RETURN_OPEN_EXISTS' },
    });
  });

  it.each([
    ['SKU không thuộc đơn', [{ sku: 'ZZZ', quantity: 1 }]],
    ['vượt số lượng đã mua', [{ sku: 'A-M', quantity: 3 }]],
    ['khai trùng SKU', [{ sku: 'B-L', quantity: 1 }, { sku: 'B-L', quantity: 1 }]],
  ])('%s → 400', async (_name, items) => {
    const { service, returnCreate } = build({});
    await expect(service.create(customerId, orderId.toString(), dto(items))).rejects.toBeInstanceOf(BadRequestException);
    expect(returnCreate).not.toHaveBeenCalled();
  });

  it('trừ số đã trả ở các yêu cầu trước (không rejected/canceled)', async () => {
    const { service } = build({ earlier: [{ items: [{ sku: 'A-M', quantity: 2 }] }] });
    await expect(service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hợp lệ: tạo yêu cầu, ghi hành trình của khách, báo OptiPack qua webhook', async () => {
    const { service, returnCreate, eventCreate, notify } = build({});
    const result = await service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]));

    expect(returnCreate.mock.calls[0]?.[0]).toMatchObject({
      type: 'return_refund',
      public_order_id: 720000010,
      customer_note: 'Chật quá',
      items: [{ sku: 'A-M', quantity: 1, reason_code: 'size_not_fit' }],
    });
    expect(eventCreate.mock.calls[0]?.[0]).toMatchObject({ status: 'return_requested', source: 'customer' });
    expect(notify).toHaveBeenCalledWith(720000010, expect.any(String));
    expect(result).toMatchObject({ status: 'requested', orderNumber: 'KA-1' });
  });

  it('2 lần bấm cùng lúc (E11000) → 409 thay vì 500', async () => {
    const { service } = build({ createError: { code: 11000 } });
    await expect(service.create(customerId, orderId.toString(), dto([{ sku: 'A-M', quantity: 1 }]))).rejects.toMatchObject({
      response: { error_code: 'SF_RETURN_OPEN_EXISTS' },
    });
  });
});
