import { mapTikiOrder, mapTikiStatus, tikiConfirmationStatus } from './tiki-order.mapper';
import { OrderStatus } from '../enums/order-status.enum';
import { formatTikiTime, parseTikiTime, type TikiOrderRaw } from '../../marketplace-integration/adapters/tiki.types';

//!=============================================
// 31/10/2026 — đơn Tiki → đơn OptiPack: chỉ món ở kho nhà bán, số lượng thật, SKU nhà bán,
// trạng thái theo bảng Order Status của Tiki, hạn xác nhận đủ hàng (giờ VN).
//!=============================================
function first<T>(list: T[]): T {
  const [x] = list;
  if (x === undefined) throw new Error('rỗng');
  return x;
}

function order(over: Partial<TikiOrderRaw> = {}): TikiOrderRaw {
  return {
    code: '781534461',
    fulfillment_type: 'dropship',
    status: 'queueing',
    created_at: '2026-10-31 09:00:00',
    invoice: { grand_total: 250000 },
    tiki_warehouse: { code: 'sgn' },
    shipping: { address: { full_name: 'Nguyễn A', phone: '0901234567', street: '12 Nguyễn Huệ', ward: 'Phường Bến Nghé', district: 'Quận 1', region: 'Hồ Chí Minh' } },
    items: [
      { id: 1, product: { sku: '1810435389187', name: 'Áo polo', seller_product_code: 'POLO-001-DEN-M', inventory_type: 'backorder' }, invoice: { price: 100000, quantity: 2 }, confirmation: { status: 'waiting', available_confirm_sla: '2026-10-31 15:00:00' } },
      { id: 2, product: { sku: '999', name: 'Hàng kho Tiki', inventory_type: 'instock' }, invoice: { price: 50000, quantity: 1 }, confirmation: { status: 'waiting' } },
    ],
    ...over,
  };
}

describe('Tiki order mapper', () => {
  it('chỉ lấy món ở kho nhà bán, số lượng thật, SKU nhà bán, hạn xác nhận giờ VN', () => {
    const m = mapTikiOrder(order());
    expect(m).not.toBeNull();
    expect(m?.items).toEqual([expect.objectContaining({ platform_order_item_id: '1', sku: 'POLO-001-DEN-M', quantity: 2, unit_price: 100000, status: OrderStatus.PENDING })]);
    expect(m?.status).toBe(OrderStatus.PENDING);
    expect(m?.recipient).toMatchObject({ full_name: 'Nguyễn A', phone: '0901234567', ward_name: 'Phường Bến Nghé', province_name: 'Hồ Chí Minh', city: 'Phường Bến Nghé' });
    expect(m?.marketplace_meta).toEqual({ fulfillment_type: 'dropship', warehouse_code: 'sgn', confirmation_status: 'pending', confirm_sla_at: new Date('2026-10-31T08:00:00.000Z') });
  });

  it('không còn món ở kho nhà bán → null; thiếu mã nhà bán → dùng SKU Tiki; thiếu SĐT → "N/A"', () => {
    expect(mapTikiOrder(order({ items: order().items.slice(1) }))).toBeNull();
    const noCode = order({ shipping: { address: { full_name: 'B' } } });
    first(noCode.items).product.seller_product_code = null;
    const m = mapTikiOrder(noCode);
    expect(m?.items[0]?.sku).toBe('1810435389187');
    expect(m?.recipient.phone).toBe('N/A');
  });

  it('trạng thái Tiki → OrderStatus; món shop hủy → CANCELED', () => {
    expect(mapTikiStatus('picking')).toBe(OrderStatus.READY_TO_SHIP);
    expect(mapTikiStatus('shipping')).toBe(OrderStatus.SHIPPED);
    expect(mapTikiStatus('successful_delivery')).toBe(OrderStatus.DELIVERED);
    expect(mapTikiStatus('closed')).toBe(OrderStatus.CANCELED);
    expect(mapTikiStatus('returned')).toBe(OrderStatus.RETURNED);
    expect(mapTikiStatus('la_lam')).toBe(OrderStatus.PENDING);
    const canceled = order();
    first(canceled.items).confirmation = { status: 'seller_canceled' };
    expect(mapTikiOrder(canceled)?.items[0]?.status).toBe(OrderStatus.CANCELED);
  });

  it('trạng thái xác nhận: pending / confirmed / canceled', () => {
    const items = order().items.slice(0, 1);
    expect(tikiConfirmationStatus(order(), items)).toBe('pending');
    expect(tikiConfirmationStatus(order({ status: 'picking' }), [{ ...first(items), confirmation: { status: 'seller_confirmed' } }])).toBe('confirmed');
    expect(tikiConfirmationStatus(order({ status: 'canceled' }), [{ ...first(items), confirmation: { status: 'seller_canceled' } }])).toBe('canceled');
  });

  it('giờ Tiki (UTC+7) đọc/ghi đúng', () => {
    expect(parseTikiTime('2026-10-31 15:00:00')?.toISOString()).toBe('2026-10-31T08:00:00.000Z');
    expect(parseTikiTime('sai')).toBeNull();
    expect(formatTikiTime(new Date('2026-10-31T08:00:00.000Z'))).toBe('2026-10-31 15:00:00');
  });
});
