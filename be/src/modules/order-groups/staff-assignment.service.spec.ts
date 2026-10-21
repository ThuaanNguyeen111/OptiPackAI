import { Types } from 'mongoose';
import { PICKING_WORKLOAD_STATUSES, StaffAssignmentService } from './staff-assignment.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';

//!=============================================
// Tự phân công người lấy hàng (21/10/2026): "việc" = nhóm còn ở bước lấy hàng,
// ít việc nhất được chọn; bằng nhau → người được giao lâu nhất (tính trên mọi nhóm).
//!=============================================
describe('StaffAssignmentService — Least-Busy theo bước lấy hàng', () => {
  const an = new Types.ObjectId();
  const binh = new Types.ObjectId();
  const chi = new Types.ObjectId();
  let userModel: { find: jest.Mock };
  let orderGroupModel: { aggregate: jest.Mock; findByIdAndUpdate: jest.Mock };
  let service: StaffAssignmentService;

  const chain = (value: unknown): { select: jest.Mock } => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
  });

  beforeEach(() => {
    userModel = {
      find: jest.fn().mockReturnValue(
        chain([
          { _id: an, name: 'An', email: 'an@x' },
          { _id: binh, name: 'Bình', email: 'binh@x' },
          { _id: chi, name: 'Chi', email: 'chi@x' },
        ]),
      ),
    };
    orderGroupModel = {
      aggregate: jest.fn(),
      findByIdAndUpdate: jest.fn((_id: string, update: { $set: { assigned_staff_id: Types.ObjectId } }) =>
        Promise.resolve({ _id, assigned_staff_id: update.$set.assigned_staff_id }),
      ),
    };
    service = new StaffAssignmentService(orderGroupModel as never, userModel as never);
  });

  it('chỉ coi nhóm chờ xử lý / đang lấy / thiếu hàng chờ quyết định là việc của người lấy hàng', () => {
    expect([...PICKING_WORKLOAD_STATUSES].sort()).toEqual(
      [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.PICKING, GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW].sort(),
    );
  });

  it('chọn người ít nhóm đang lấy nhất; nhóm đã lấy xong (đang đóng/giao) không còn tính', async () => {
    // An lấy xong nhiều nhóm (đều đã sang đóng gói) → count 0; Bình đang lấy 1; Chi đang lấy 2.
    orderGroupModel.aggregate.mockResolvedValue([
      { _id: an, count: 0, lastAssignedAt: new Date('2026-10-21T09:00:00Z') },
      { _id: binh, count: 1, lastAssignedAt: new Date('2026-10-21T08:00:00Z') },
      { _id: chi, count: 2, lastAssignedAt: new Date('2026-10-21T07:00:00Z') },
    ]);
    const group = await service.autoAssign(new Types.ObjectId().toString());
    expect(group.assigned_staff_id).toEqual(an);
    const [pipeline] = orderGroupModel.aggregate.mock.calls[0] as [Record<string, Record<string, unknown>>[]];
    expect(JSON.stringify(pipeline[1])).toContain('$cond');
    expect(JSON.stringify(pipeline[1])).toContain(GroupFulfillmentStatus.PICKING);
  });

  it('bằng số việc → người được giao lâu nhất trước; người chưa từng được giao ưu tiên nhất', async () => {
    orderGroupModel.aggregate.mockResolvedValue([
      { _id: an, count: 0, lastAssignedAt: new Date('2026-10-21T09:30:00Z') },
      { _id: binh, count: 0, lastAssignedAt: new Date('2026-10-21T08:45:00Z') },
    ]);
    expect((await service.autoAssign(new Types.ObjectId().toString())).assigned_staff_id).toEqual(chi);
    orderGroupModel.aggregate.mockResolvedValue([
      { _id: an, count: 0, lastAssignedAt: new Date('2026-10-21T09:30:00Z') },
      { _id: binh, count: 0, lastAssignedAt: new Date('2026-10-21T08:45:00Z') },
      { _id: chi, count: 0, lastAssignedAt: new Date('2026-10-21T09:00:00Z') },
    ]);
    expect((await service.autoAssign(new Types.ObjectId().toString())).assigned_staff_id).toEqual(binh);
  });

  it('danh sách nhân viên trả activeWorkload = số nhóm còn ở bước lấy hàng', async () => {
    orderGroupModel.aggregate.mockResolvedValue([{ _id: binh, count: 3 }]);
    const rows = await service.listStaffWithWorkload();
    expect(rows.find((r) => r.fullName === 'Bình')?.activeWorkload).toBe(3);
    expect(rows.find((r) => r.fullName === 'An')?.activeWorkload).toBe(0);
    const [pipeline] = orderGroupModel.aggregate.mock.calls[0] as [{ $match: { fulfillment_status: { $in: string[] } } }[]];
    expect(pipeline[0]?.$match.fulfillment_status.$in).toEqual(PICKING_WORKLOAD_STATUSES);
  });
});
