import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';

// AOFP-336 — vận đơn trả người nhận + tiền thu hộ cho app giao hàng.
describe('ShipmentsService.recipientsByGroup', () => {
  const groupId = new Types.ObjectId();
  const order = (over: Record<string, unknown>): Record<string, unknown> => ({
    consolidated_group_id: groupId,
    platform: 'aurelle',
    total_amount: 350000,
    recipient: { full_name: 'Nguyễn A', phone: '0909123456', address_line1: '12 Lê Lợi', ward_name: 'Bến Nghé', province_name: 'TP HCM', city: 'HCM' },
    ...over,
  });

  function serviceWith(orders: Record<string, unknown>[]): ShipmentsService {
    const find = jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(orders) }) });
    const args: unknown[] = new Array(14).fill(undefined);
    args[13] = { find };
    return new (ShipmentsService as unknown as new (...a: unknown[]) => ShipmentsService)(...args);
  }

  it('lấy người nhận đơn đầu, cộng COD mọi đơn của nhóm; đơn trả trước không thu', async () => {
    const service = serviceWith([
      order({}),
      order({ platform: 'lazada', payment_method: 'COD', total_amount: 100000 }),
      order({ platform: 'lazada', payment_method: 'PREPAID', total_amount: 999 }),
    ]);
    const r = (await service.recipientsByGroup([groupId.toString(), 'not-an-id'])).get(groupId.toString());
    expect(r).toEqual({ name: 'Nguyễn A', phone: '0909123456', address: '12 Lê Lợi, Bến Nghé, TP HCM', codAmountVnd: 450000 });
  });

  it('không có id hợp lệ → map rỗng, không truy vấn', async () => {
    const service = serviceWith([]);
    expect((await service.recipientsByGroup(['x'])).size).toBe(0);
  });
});
