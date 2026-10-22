import { OrderGroupsService } from './order-groups.service';
import { parseMasterSkuCode } from '../master-skus/master-skus.service';

describe('OrderGroupsService.allocateShortage (22/10/2026)', () => {
  it('chia số đã lấy cho đơn cũ trước; chỉ trả đơn bị thiếu', () => {
    const orders = [
      { _id: 'o1', items: [{ sku: 'A', quantity: 2 }] },
      { _id: 'o2', items: [{ sku: 'A', quantity: 2 }, { sku: 'B', quantity: 1 }] },
    ];
    const out = OrderGroupsService.allocateShortage(orders, new Map([['A', 3], ['B', 1]]));
    expect(out).toEqual([{ orderId: 'o2', items: [{ sku: 'A', ordered: 2, shipped: 1 }, { sku: 'B', ordered: 1, shipped: 1 }] }]);
  });

  it('bỏ dòng đã hủy; đủ hàng → rỗng', () => {
    const orders = [{ _id: 'o1', items: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 3, status: 'canceled' }] }];
    expect(OrderGroupsService.allocateShortage(orders, new Map([['A', 1]]))).toEqual([]);
  });
});

describe('parseMasterSkuCode (22/10/2026)', () => {
  it('tách đúng quy tắc', () => {
    expect(parseMasterSkuCode('athun-005-den-m')).toEqual({ category_code: 'ATHUN', model_no: 5, color_code: 'DEN', size: 'M' });
    expect(parseMasterSkuCode('GIAY-012-TRANG-40.5')).toEqual({ category_code: 'GIAY', model_no: 12, color_code: 'TRANG', size: '40.5' });
  });
  it('sai dạng / số mẫu 000 → null', () => {
    expect(parseMasterSkuCode('SKU-RANDOM-1')).toBeNull();
    expect(parseMasterSkuCode('ATHUN-000-DEN-M')).toBeNull();
    expect(parseMasterSkuCode('ATHUN-05-DEN-M')).toBeNull();
  });
});
