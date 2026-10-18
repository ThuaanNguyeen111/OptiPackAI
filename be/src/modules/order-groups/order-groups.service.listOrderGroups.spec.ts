import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { ListOrderGroupsQueryDto } from './dto/list-order-groups-query.dto';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { OrderGroupsService } from './order-groups.service';
import { PackerAssignmentService } from '../packing/packer-assignment.service';

describe('OrderGroupsService — danh sách theo người đóng', () => {
  const packerA = new Types.ObjectId();
  const packerB = new Types.ObjectId();
  const picker = new Types.ObjectId();
  const newest = {
    _id: new Types.ObjectId(),
    created_at: new Date('2026-10-18T00:00:00Z'),
  };
  const assignedFirst = {
    _id: new Types.ObjectId(),
    created_at: new Date('2026-10-17T00:00:00Z'),
  };
  const assignedLast = {
    _id: new Types.ObjectId(),
    created_at: new Date('2026-10-16T00:00:00Z'),
  };
  const groups = [newest, assignedFirst, assignedLast];

  let plans: {
    _id: Types.ObjectId;
    order_group_id: Types.ObjectId;
    assigned_packer_id: Types.ObjectId;
    is_active: boolean;
    parcels: [];
  }[];
  let service: OrderGroupsService;
  let assignment: PackerAssignmentService;
  let find: jest.Mock;
  let distinct: jest.Mock;

  beforeEach(() => {
    plans = groups.map((g, index) => ({
      _id: new Types.ObjectId(),
      order_group_id: g._id,
      assigned_packer_id: index === 0 ? packerB : packerA,
      is_active: true,
      parcels: [],
    }));
    // Kế hoạch cũ của nhóm mới nhất từng giao A, nay chỉ kế hoạch đang hoạt động giao B có hiệu lực.
    plans.push({
      _id: new Types.ObjectId(),
      order_group_id: newest._id,
      assigned_packer_id: packerA,
      is_active: false,
      parcels: [],
    });
    find = jest.fn((query: Record<string, unknown>) => ({
      sort: () => ({
        limit: (limit: number) => ({
          lean: () =>
            Promise.resolve(
              groups
                .filter((g) => {
                  const ids = (
                    query._id as { $in: Types.ObjectId[] } | undefined
                  )?.$in;
                  const before = (query.created_at as { $lt: Date } | undefined)
                    ?.$lt;
                  return (
                    (!ids || ids.some((id) => id.equals(g._id))) &&
                    (!before || g.created_at < before)
                  );
                })
                .slice(0, limit),
            ),
        }),
      }),
    }));
    distinct = jest.fn(
      (
        _field: string,
        filter: { assigned_packer_id: Types.ObjectId; is_active: boolean },
      ) =>
        Promise.resolve(
          plans
            .filter(
              (p) =>
                p.is_active === filter.is_active &&
                p.assigned_packer_id.equals(filter.assigned_packer_id),
            )
            .map((p) => p.order_group_id),
        ),
    );
    const planModel = {
      distinct,
      findOneAndUpdate: jest.fn(
        (
          filter: { _id: Types.ObjectId },
          update: { $set: { assigned_packer_id: Types.ObjectId } },
        ) => {
          const plan = plans.find(
            (p) => p.is_active && p._id.equals(filter._id),
          );
          if (plan) Object.assign(plan, update.$set);
          return Promise.resolve(plan ?? null);
        },
      ),
    };
    service = new OrderGroupsService(
      { find } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      planModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    assignment = new PackerAssignmentService(
      planModel as never,
      { exists: jest.fn().mockResolvedValue({}) } as never,
      { notify: jest.fn().mockResolvedValue({}) } as never,
    );
  });

  it('lọc trước limit và con trỏ: không bỏ sót việc cũ, không lấy kế hoạch đã thay', async () => {
    const first = await service.listOrderGroups({
      assignedPackerId: String(packerA),
      limit: 1,
    });
    expect(first.map((g) => g._id)).toEqual([assignedFirst._id]);
    const next = await service.listOrderGroups({
      assignedPackerId: String(packerA),
      limit: 1,
      before: first[0]?.created_at,
    });
    expect(next.map((g) => g._id)).toEqual([assignedLast._id]);
  });

  it('gán lại bằng API service → lần đọc kế tiếp chuyển việc từ A sang B', async () => {
    const plan = plans.find((p) => p.order_group_id.equals(assignedFirst._id));
    if (!plan) throw new Error('thiếu kế hoạch test');
    await assignment.assign(plan as never, 'manual', String(packerB));
    const mine = await service.listOrderGroups({
      assignedPackerId: String(packerA),
    });
    const theirs = await service.listOrderGroups({
      assignedPackerId: String(packerB),
    });
    expect(mine.map((g) => g._id)).toEqual([assignedLast._id]);
    expect(theirs.map((g) => g._id)).toEqual([newest._id, assignedFirst._id]);
  });

  it('người chưa được giao việc nhận danh sách rỗng', async () => {
    expect(
      await service.listOrderGroups({
        assignedPackerId: String(new Types.ObjectId()),
      }),
    ).toEqual([]);
  });

  it('bộ lọc người đóng kết hợp với trạng thái và người lấy hàng', async () => {
    await service.listOrderGroups({
      assignedPackerId: String(packerA),
      assignedStaffId: String(picker),
      fulfillmentStatus: GroupFulfillmentStatus.PENDING_APPROVAL,
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_staff_id: picker,
        fulfillment_status: GroupFulfillmentStatus.PENDING_APPROVAL,
        _id: { $in: [assignedFirst._id, assignedLast._id] },
      }),
    );
  });

  it('không truyền người đóng giữ danh sách và bộ lọc người lấy hàng hiện có', async () => {
    expect(
      await service.listOrderGroups({ assignedStaffId: String(picker) }),
    ).toHaveLength(3);
    expect(distinct).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith({ assigned_staff_id: picker });
  });

  it('query assigned_packer_id phải là ObjectId; không bắt buộc', async () => {
    expect(await validate(new ListOrderGroupsQueryDto())).toEqual([]);
    expect(
      await validate(
        Object.assign(new ListOrderGroupsQueryDto(), {
          assigned_packer_id: String(packerA),
        }),
      ),
    ).toEqual([]);
    const errors = await validate(
      Object.assign(new ListOrderGroupsQueryDto(), {
        assigned_packer_id: 'invalid',
      }),
    );
    expect(errors.map((error) => error.property)).toEqual([
      'assigned_packer_id',
    ]);
    expect(errors[0]?.constraints?.isMongoId).toBe(
      'assigned_packer_id phải là ObjectId hợp lệ',
    );
  });
});
