import { Types } from 'mongoose';
import { ExpressOrderSlaScheduler, PRE_PACK_STATUSES } from './express-order-sla.scheduler';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

//!=============================================
// 29/10/2026 — SLA hỏa tốc 4 mốc, mỗi mốc báo 1 lần; sửa lỗi cũ: nhóm đã đóng/giao xong vẫn bị
// báo "QUÁ HẠN" (truy vấn cũ không xét trạng thái nhóm).
//!=============================================
describe('ExpressOrderSlaScheduler', () => {
  const now = new Date('2026-10-29T03:50:00.000Z'); // 10:50 VN
  const picker = new Types.ObjectId();
  const shipper = new Types.ObjectId();

  /** Bộ lọc → danh sách nhóm trả về; nhận biết mốc qua field `sla_*` có trong bộ lọc. */
  function build(byStage: Partial<Record<'packWarn' | 'packBreach' | 'deliveryWarn' | 'deliveryBreach', Record<string, unknown>[]>>) {
    const filters: Record<string, unknown>[] = [];
    const stageOf = (f: Record<string, unknown>): keyof typeof byStage => {
      if ('sla_pack_warned_at' in f) return 'packWarn';
      if ('sla_delivery_warned_at' in f) return 'deliveryWarn';
      if ('packaging_deadline' in f) return 'packBreach';
      return 'deliveryBreach';
    };
    const groupModel = {
      find: jest.fn((f: Record<string, unknown>) => {
        filters.push(f);
        const self = { select: () => self, lean: () => Promise.resolve(byStage[stageOf(f)] ?? []) };
        return self;
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const notify = jest.fn().mockResolvedValue({});
    const plans = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) };
    const shipments = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ shipper_id: shipper }) }) }) };
    const scheduler = new ExpressOrderSlaScheduler(groupModel as never, { notify } as never, plans as never, shipments as never);
    return { scheduler, groupModel, notify, filters };
  }

  it('mọi mốc đóng gói chỉ xét nhóm CHƯA đóng xong; mốc giao bỏ nhóm đã giao/hoàn/hủy (sửa lỗi báo "QUÁ HẠN" cho nhóm xong)', async () => {
    const { scheduler, filters } = build({});
    await scheduler.checkSlaDeadlines(now);
    const pack = filters.filter((f) => 'packaging_deadline' in f);
    expect(pack).toHaveLength(2);
    for (const f of pack) expect(f.fulfillment_status).toEqual({ $in: PRE_PACK_STATUSES });
    const delivery = filters.filter((f) => 'delivery_deadline' in f);
    expect(delivery).toHaveLength(2);
    for (const f of delivery) expect(f.fulfillment_status).toEqual({ $nin: ['delivered', 'returning', 'returned', 'canceled'] });
  });

  it('sắp hết hạn đóng gói (còn 10 phút) → báo người lấy hàng; ghi mốc có điều kiện', async () => {
    const g = { _id: new Types.ObjectId(), assigned_staff_id: picker, packaging_deadline: new Date(now.getTime() + 10 * 60_000), delivery_deadline: new Date(now.getTime() + 130 * 60_000) };
    const { scheduler, notify, groupModel } = build({ packWarn: [g] });
    await scheduler.checkSlaDeadlines(now);
    expect(groupModel.updateOne).toHaveBeenCalledWith({ _id: g._id, sla_pack_warned_at: null }, { $set: { sla_pack_warned_at: now } });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: String(picker), type: NotificationType.SLA_WARNING }));
  });

  it('đơn hỏa tốc AURELLE còn 40 phút tới hạn đóng gói → CHƯA báo (chỉ báo trước 15 phút)', async () => {
    const g = { _id: new Types.ObjectId(), assigned_staff_id: picker, packaging_deadline: new Date(now.getTime() + 40 * 60_000), delivery_deadline: new Date(now.getTime() + 160 * 60_000) };
    const { scheduler, notify } = build({ packWarn: [g] });
    await scheduler.checkSlaDeadlines(now);
    expect(notify).not.toHaveBeenCalled();
  });

  it('quá giờ hẹn giao → Store Owner + Admin + shipper, đánh dấu is_overdue', async () => {
    const g = { _id: new Types.ObjectId(), packaging_deadline: new Date(now.getTime() - 150 * 60_000), delivery_deadline: new Date(now.getTime() - 60_000) };
    const { scheduler, notify, groupModel } = build({ deliveryBreach: [g] });
    await scheduler.checkSlaDeadlines(now);
    expect(groupModel.updateOne).toHaveBeenCalledWith({ _id: g._id, sla_delivery_breached_at: null }, { $set: { sla_delivery_breached_at: now, is_overdue: true } });
    const targets = notify.mock.calls.map((c) => (c as [{ recipientUserId?: string; recipientRole?: UserRole }])[0]);
    expect(targets.map((t) => t.recipientUserId ?? t.recipientRole)).toEqual([String(shipper), UserRole.STORE_OWNER, UserRole.ADMIN]);
  });

  it('mốc đã ghi (lượt khác ghi trước) → không báo lại', async () => {
    const g = { _id: new Types.ObjectId(), packaging_deadline: new Date(now.getTime() - 60_000) };
    const { scheduler, notify, groupModel } = build({ packBreach: [g] });
    groupModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await scheduler.checkSlaDeadlines(now);
    expect(notify).not.toHaveBeenCalled();
  });
});
