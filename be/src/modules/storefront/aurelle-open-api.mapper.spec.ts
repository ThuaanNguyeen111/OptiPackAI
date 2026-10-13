import type { ConfigService } from '@nestjs/config';
import { AurelleAdapter } from '../marketplace-integration/adapters/aurelle.adapter';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { mapLazadaOrder } from '../orders/mappers/lazada-order.mapper';
import { OrderStatus } from '../orders/enums/order-status.enum';
import {
  ORDER_ITEM_ID_MULTIPLIER,
  PUBLIC_ORDER_ID_START,
  toOpenApiOrder,
  toOpenApiOrderItems,
  toOpenApiProducts,
  toOpenApiStatus,
  type StorefrontOrderLike,
} from './aurelle-open-api.mapper';
import { signAurelleWebhook } from './aurelle-webhook.publisher';
import { nextPublicOrderId, type CounterCollection } from './storefront-counter.util';

const ORDER: StorefrontOrderLike = {
  public_order_id: PUBLIC_ORDER_ID_START + 7,
  order_number: 'KA-ABC123',
  status: 'pending',
  payment_status: 'unpaid',
  fulfillment_status: 'awaiting_packaging',
  total_amount: 430000,
  shipping_address_snapshot: {
    recipient_name: 'Nguyễn Thị Lan',
    phone: '0901234567',
    province: 'TP. Hồ Chí Minh',
    ward: 'Phường Tân Phong',
    address_line: '12 Nguyễn Văn Linh',
  },
  customer_note: 'Giao giờ hành chính',
  placed_at: new Date('2026-10-04T09:00:00Z'),
  updated_at: new Date('2026-10-04T09:00:05Z'),
};

const ITEMS = [
  {
    sku_snapshot: 'ATD-M-01',
    product_name_snapshot: 'Áo thun basic',
    variant_snapshot: 'Đen / M',
    unit_price: 200000,
    quantity: 2,
    discount_amount: 0,
    line_total: 400000,
  },
  {
    sku_snapshot: 'VAY-S-02',
    product_name_snapshot: 'Váy linen',
    variant_snapshot: 'Kem / S',
    unit_price: 30000,
    quantity: 1,
    discount_amount: 0,
    line_total: 30000,
  },
];

describe('aurelle-open-api.mapper', () => {
  it('nở mỗi đơn vị thành 1 dòng, order_item_id không trùng', () => {
    const units = toOpenApiOrderItems(ORDER, ITEMS);
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.order_item_id)).toEqual([1, 2, 3].map(
      (n) => ORDER.public_order_id * ORDER_ITEM_ID_MULTIPLIER + n,
    ));
    expect(units.every((u) => u.order_id === ORDER.public_order_id)).toBe(true);
    expect(units[0]?.paid_price).toBe('200000.00');
  });

  it('đơn website đi qua đúng mapper OptiPack đang dùng cho Lazada/AURELLE', () => {
    const raw = toOpenApiOrder(ORDER, 3);
    const mapped = mapLazadaOrder(raw, toOpenApiOrderItems(ORDER, ITEMS), MarketplacePlatform.AURELLE);
    expect(mapped.platform_order_id).toBe(String(ORDER.public_order_id));
    expect(mapped.status).toBe(OrderStatus.PENDING);
    expect(mapped.recipient.full_name).toBe('Nguyễn Thị Lan');
    expect(mapped.recipient.city).toBe('TP. Hồ Chí Minh');
    expect(mapped.items).toHaveLength(3);
    expect(Number.isSafeInteger(Number(mapped.items[2]?.platform_order_item_id))).toBe(true);
  });

  it('đổi trạng thái website sang trạng thái kiểu Lazada', () => {
    expect(toOpenApiStatus({ status: 'cancelled', payment_status: 'unpaid', fulfillment_status: 'awaiting_packaging' })).toBe('canceled');
    expect(toOpenApiStatus({ status: 'confirmed', payment_status: 'refunded', fulfillment_status: 'shipped' })).toBe('canceled');
    expect(toOpenApiStatus({ status: 'confirmed', payment_status: 'paid', fulfillment_status: 'shipped' })).toBe('shipped');
    expect(toOpenApiStatus({ status: 'pending', payment_status: 'unpaid', fulfillment_status: 'awaiting_packaging' })).toBe('pending');
  });

  it('chặn đơn vượt 999 đơn vị (hết dải order_item_id)', () => {
    const [line] = ITEMS;
    if (!line) throw new Error('fixture rỗng');
    expect(() => toOpenApiOrderItems(ORDER, [{ ...line, quantity: 1000, line_total: 1 }])).toThrow();
  });

  it('sản phẩm: tồn bán được = tồn − giữ chỗ, số đo dạng chuỗi cm', () => {
    const [product] = toOpenApiProducts(
      [{ _id: 'p1', name: 'Áo thun basic', brand: '', status: 'active' }],
      [{
        _id: 'v1', product_id: 'p1', sku: 'ATD-M-01', price: 200000, color: 'Đen', size: 'M',
        weight_kg: 0.2, length_cm: 25, width_cm: 20, height_cm: null, is_active: true,
      }],
      new Map([['v1', 9]]),
      new Map([['v1', 12]]),
    );
    expect(product?.status).toBe('live');
    expect(product?.skus[0]).toMatchObject({
      SellerSku: 'ATD-M-01', quantity: 12, sellableQuantity: 9, package_length: '25', package_height: undefined,
    });
  });
});

describe('nextPublicOrderId', () => {
  it('cộng PUBLIC_ORDER_ID_START với seq (driver trả document hoặc { value })', async () => {
    const direct: CounterCollection = { findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'x', seq: 5 }) };
    const wrapped: CounterCollection = { findOneAndUpdate: jest.fn().mockResolvedValue({ value: { seq: 6 } }) };
    await expect(nextPublicOrderId(direct)).resolves.toBe(PUBLIC_ORDER_ID_START + 5);
    await expect(nextPublicOrderId(wrapped)).resolves.toBe(PUBLIC_ORDER_ID_START + 6);
  });
});

describe('chữ ký webhook website → OptiPack', () => {
  it('AurelleAdapter của OptiPack chấp nhận chữ ký website tạo ra', () => {
    const values: Record<string, string> = {
      'marketplace.aurelle.appKey': '5557435b929a7628bb1b7ac5',
      'marketplace.aurelle.appSecret': 'secret-test',
      'marketplace.aurelle.redirectUri': 'http://localhost:3000/marketplace/aurelle/callback',
    };
    const adapter = new AurelleAdapter({ get: (key: string) => values[key] } as unknown as ConfigService);
    const body = JSON.stringify({ message_id: 'm1', seller_id: '200000000101', message_type: 'order_status_changed', timestamp: 1, data: { trade_order_id: '710000007' } });
    const signature = signAurelleWebhook('5557435b929a7628bb1b7ac5', 'secret-test', body);
    expect(adapter.verifyWebhookSignature(Buffer.from(body, 'utf8'), signature)).toBe(true);
    expect(adapter.verifyWebhookSignature(Buffer.from(body + ' ', 'utf8'), signature)).toBe(false);
  });
});
