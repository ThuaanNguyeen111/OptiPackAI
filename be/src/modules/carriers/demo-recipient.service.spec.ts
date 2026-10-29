import { Types } from 'mongoose';
import { DemoRecipientService } from './demo-recipient.service';

//!=============================================
// 28/10/2026 — địa chỉ mô phỏng CHỈ ĐỌC DB (Thuận chốt không ghi DB). Số nhà = 10 + số đơn bị che
// tạo trước đơn neo; SĐT đơn đầu = SĐT cấu hình, sau đó cố định theo mã đơn; cả nhóm gộp dùng
// chung địa chỉ của đơn cũ nhất; đơn đủ địa chỉ / tắt tính năng → null, không truy vấn.
//!=============================================
describe('DemoRecipientService', () => {
  const config: Record<string, unknown> = {
    'carrier.demoRecipientPhone': '0377168254',
    'carrier.demoRecipient.enabled': true,
    'carrier.demoRecipient.streetTemplate': '47/{n} Nguyễn Văn Đậu',
    'carrier.demoRecipient.startNumber': 10,
    'carrier.demoRecipient.wardName': 'Phường Gia Định',
    'carrier.demoRecipient.provinceName': 'Hồ Chí Minh',
  };
  const configService = (overrides: Record<string, unknown> = {}): { get: jest.Mock } => ({
    get: jest.fn((k: string) => (k in overrides ? overrides[k] : config[k])),
  });
  const maskedRecipient = { full_name: 'N**n', phone: '8**5', address_line1: 'S**e', city: 'Phường Gia Định', province_name: null, ward_name: null };
  const realRecipient = {
    full_name: 'Nguyễn Văn A', phone: '0901234567', address_line1: '12 Lê Lợi', city: 'Hồ Chí Minh',
    province_name: 'Hồ Chí Minh', ward_name: 'Phường Bến Thành',
  };
  const masked = (
    created: string,
    group: Types.ObjectId | null = null,
  ): { _id: Types.ObjectId; recipient: typeof maskedRecipient; consolidated_group_id: Types.ObjectId | null; created_at: Date } => ({
    _id: new Types.ObjectId(),
    recipient: maskedRecipient,
    consolidated_group_id: group,
    created_at: new Date(created),
  });

  let orderModel: { countDocuments: jest.Mock; find: jest.Mock };
  const siblingsQuery = (rows: unknown[]): { select: () => unknown } => ({ select: () => ({ sort: () => ({ lean: () => Promise.resolve(rows) }) }) });

  beforeEach(() => {
    // Chỉ có 2 hàm ĐỌC — service gọi hàm ghi nào cũng sẽ lỗi ngay trong test.
    orderModel = { countDocuments: jest.fn().mockResolvedValue(0), find: jest.fn() };
  });

  it('đơn bị che đầu tiên → 47/10 + SĐT cấu hình', async () => {
    const svc = new DemoRecipientService(orderModel as never, configService() as never);
    expect(await svc.resolve(masked('2026-10-20T08:00:00Z') as never)).toEqual({
      seq: 10,
      street: '47/10 Nguyễn Văn Đậu',
      ward_name: 'Phường Gia Định',
      province_name: 'Hồ Chí Minh',
      phone: '0377168254',
    });
  });

  it('có 3 đơn bị che cũ hơn → 47/13, SĐT 03x/09x giống nhau ở mọi lần tính', async () => {
    orderModel.countDocuments.mockResolvedValue(3);
    const svc = new DemoRecipientService(orderModel as never, configService() as never);
    const order = masked('2026-10-21T08:00:00Z');
    const a = await svc.resolve(order as never);
    const b = await svc.resolve(order as never);
    expect(a?.street).toBe('47/13 Nguyễn Văn Đậu');
    expect(a?.phone).toMatch(/^0[39]\d{8}$/);
    expect(b).toEqual(a);
  });

  it('đơn cùng nhóm gộp dùng chung địa chỉ của đơn cũ nhất trong nhóm', async () => {
    const group = new Types.ObjectId();
    const oldest = masked('2026-10-20T08:00:00Z', group);
    const newer = masked('2026-10-20T09:00:00Z', group);
    orderModel.find.mockReturnValue(siblingsQuery([oldest, newer]));
    orderModel.countDocuments.mockResolvedValue(4);
    const svc = new DemoRecipientService(orderModel as never, configService() as never);
    const fromNewer = await svc.resolve(newer as never);
    const fromOldest = await svc.resolve(oldest as never);
    expect(fromNewer).toEqual(fromOldest);
    // đếm theo thời điểm của đơn neo (cũ nhất), không theo đơn đang hỏi
    const calls = orderModel.countDocuments.mock.calls as [{ $and: { $or: { created_at: unknown }[] }[] }][];
    const filter = calls[0]?.[0];
    expect(filter?.$and[1]?.$or[0]?.created_at).toEqual({ $lt: oldest.created_at });
  });

  it('đơn đủ địa chỉ thật, tính năng tắt, hoặc thiếu phường cấu hình → null và không truy vấn DB', async () => {
    const on = new DemoRecipientService(orderModel as never, configService() as never);
    expect(await on.resolve({ ...masked('2026-10-20T08:00:00Z'), recipient: realRecipient } as never)).toBeNull();
    const off = new DemoRecipientService(orderModel as never, configService({ 'carrier.demoRecipient.enabled': false }) as never);
    expect(await off.resolve(masked('2026-10-20T08:00:00Z') as never)).toBeNull();
    const noWard = new DemoRecipientService(orderModel as never, configService({ 'carrier.demoRecipient.wardName': null }) as never);
    expect(await noWard.resolve(masked('2026-10-20T08:00:00Z') as never)).toBeNull();
    expect(orderModel.countDocuments).not.toHaveBeenCalled();
  });
});
