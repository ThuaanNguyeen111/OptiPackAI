import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { HistoryService } from './history.service';

/** Chuỗi query giả: find().select().sort().limit().lean() đều trả về `rows`. */
function chain(rows: unknown[]) {
  const self = {
    select: () => self,
    sort: () => self,
    limit: () => self,
    lean: () => Promise.resolve(rows),
  };
  return self;
}
function model(rows: unknown[] = []) {
  return { find: jest.fn(() => chain(rows)) };
}

const user = (role: UserRole) => ({ userId: new Types.ObjectId().toHexString(), email: 'a@b.c', role, mustChangePassword: false });

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- bộ dựng test
function build(data: Partial<Record<'activity' | 'movement' | 'receipt' | 'bin' | 'shipEvent' | 'shipment' | 'returns' | 'plan' | 'packaging' | 'login' | 'user' | 'order', unknown[]>> = {}) {
  const m = (k: keyof typeof data) => model(data[k] ?? []);
  const models = {
    activity: m('activity'), movement: m('movement'), receipt: m('receipt'), bin: m('bin'), shipEvent: m('shipEvent'),
    shipment: m('shipment'), returns: m('returns'), plan: m('plan'), packaging: m('packaging'), login: m('login'),
    user: m('user'), order: m('order'),
  };
  const service = new HistoryService(
    models.activity as never, models.movement as never, models.receipt as never, models.bin as never,
    models.shipEvent as never, models.shipment as never, models.returns as never, models.plan as never,
    models.packaging as never, models.login as never, models.user as never, models.order as never,
  );
  return { service, models };
}

describe('HistoryService (23/10/2026)', () => {
  it('vai trò chỉ xem loại được phép: đóng gói hỏi lịch sử vận chuyển → 403', async () => {
    const { service } = build();
    await expect(service.list(user(UserRole.PACKAGING_STAFF), { category: 'shipping' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.allowedCategories(UserRole.SHIPPING_COORDINATOR)).toEqual(['orders', 'shipping', 'returns']);
    expect(service.allowedCategories(UserRole.STORE_OWNER)).not.toContain('auth');
  });

  it('gộp nhiều nguồn, mới → cũ, cắt theo limit, trả con trỏ trang sau và tên người làm', async () => {
    const packer = new Types.ObjectId();
    const bin = new Types.ObjectId();
    const now = Date.now();
    const { service } = build({
      movement: [
        { _id: new Types.ObjectId(), type: 'pick', delta: -2, quantity_before: 5, quantity_after: 3, seller_sku: 'AOPOLO-010-DEN-L', master_sku: null, bin_location_id: bin, assignment_id: new Types.ObjectId(), ref_type: 'order_group', ref_id: 'g1', actor_id: String(packer), created_at: new Date(now - 1000), reason_code: null, note: null },
      ],
      activity: [
        { _id: new Types.ObjectId(), occurred_at: new Date(now - 500), category: 'orders', action: 'order_group.status_changed', summary: 'Nhóm đơn …x: Đang lấy hàng → Đã lấy xong', actor_id: null, order_group_id: null, entity_type: 'order_group', entity_id: null, entity_code: null, from_status: 'picking', to_status: 'picked', skus: [], quantity: null, note: null },
        { _id: new Types.ObjectId(), occurred_at: new Date(now - 3000), category: 'orders', action: 'order.seller_canceled', summary: 'Người bán hủy đơn', actor_id: 'system', order_group_id: null, entity_type: 'order', entity_id: null, entity_code: null, from_status: null, to_status: null, skus: [], quantity: null, note: null },
      ],
      bin: [{ _id: bin, bin_code: 'KA-D1-T01-T01-1' }],
      user: [{ _id: packer, name: 'Hải Phượng', role: UserRole.WAREHOUSE_STAFF }],
    });
    const res = await service.list(user(UserRole.ADMIN), { limit: 2 });
    expect(res.items.map((i) => i.action)).toEqual(['order_group.status_changed', 'stock.pick']);
    expect(res.nextBefore).toBe(res.items[1]?.occurredAt.toISOString());
    expect(res.items[1]).toMatchObject({
      category: 'picking',
      summary: 'Lấy 2 AOPOLO-010-DEN-L từ ô KA-D1-T01-T01-1 cho nhóm đơn …g1',
      actor: { name: 'Hải Phượng', role: 'Nhân viên kho' },
    });
  });

  it('vận chuyển: câu mô tả có hãng, dịch vụ, mã vận đơn và người nhận', async () => {
    const gid = new Types.ObjectId();
    const sid = new Types.ObjectId();
    const { service } = build({
      shipEvent: [{ _id: new Types.ObjectId(), shipment_id: sid, order_group_id: gid, event_type: 'start_delivery', status_from: null, status_to: 'awaiting_pickup', attempt_no: 1, actor_id: 'system', reason_code: null, note: null, occurred_at: new Date(), source: null, carrier_status: null }],
      shipment: [{ _id: sid, shipment_code: 'SHP-1', carrier_name: 'GHN', service_name: 'Hàng nhẹ', tracking_code: 'GHN123', trip_code: null, parcel_count: 1, estimated_cost_vnd: 22000 }],
      order: [{ consolidated_group_id: gid, recipient: { full_name: 'Nguyễn Văn A', phone: '0912345678', address_line1: '12 Lê Lợi', ward_name: 'Phường Bến Nghé', province_name: 'Hồ Chí Minh' } }],
    });
    const res = await service.list(user(UserRole.SHIPPING_COORDINATOR), { category: 'shipping' });
    expect(res.items[0]?.summary).toBe('Bắt đầu giao SHP-1 qua GHN · Hàng nhẹ → Nguyễn Văn A (12 Lê Lợi, Phường Bến Nghé, Hồ Chí Minh) — mã GHN123');
    expect(res.items[0]?.details).toMatchObject({ trackingCode: 'GHN123', recipientPhone: '0912345678', costVnd: 22000 });
    expect(res.items[0]?.actor).toEqual({ id: 'system', name: 'Hệ thống', role: null });
  });

  it('dòng thời gian 1 nhóm: cũ → mới, có đơn về + niêm phong kiện', async () => {
    const gid = new Types.ObjectId();
    const t0 = new Date('2026-10-22T01:00:00Z');
    const { service } = build({
      order: [{ _id: new Types.ObjectId(), platform: 'aurelle', platform_order_id: '720000001', items: [{ sku: 'AOPOLO-010-DEN-L', quantity: 1 }], created_at: t0, consolidated_group_id: gid, origin: 'marketplace' }],
      plan: [{
        _id: new Types.ObjectId(), order_group_id: gid, revision: 1, source: 'solver', item_profiles: [{ sku: 'AOPOLO-010-DEN-L' }], activity: [],
        parcels: [{ parcel_no: 1, platform_order_id: '720000001', box: { code: 'SAMPLE-S' }, sealed_by: null, sealed_at: new Date('2026-10-22T03:00:00Z'), actual_weight_kg: 0.4, estimated_weight_g: 400 }],
        created_at: new Date('2026-10-22T02:00:00Z'),
      }],
    });
    const res = await service.timeline(gid.toHexString());
    expect(res.items.map((i) => i.action)).toEqual(['order.received', 'packing.plan_generated', 'packing.parcel_sealed']);
    expect(res.items[2]?.summary).toBe('Niêm phong kiện 1: thùng SAMPLE-S, 0.4 kg — đơn 720000001');
  });
});
