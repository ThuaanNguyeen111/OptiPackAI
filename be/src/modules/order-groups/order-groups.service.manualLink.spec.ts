import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

//!=============================================
// 13/10/2026 — LIÊN KẾT TAY nhóm đơn (Coordinator). Dùng khi recipient_key không
// tự khớp (đơn Lazada bị che tên/SĐT/địa chỉ). Nhóm cùng manual_link_id được coi
// là liên kết: findLinkedGroups trả về, giao chung chuyến được.
//!=============================================
describe('OrderGroupsService — liên kết tay (13/10/2026)', () => {
  const idA = new Types.ObjectId();
  const idB = new Types.ObjectId();
  let groups: Record<string, Record<string, unknown>>;
  let orderGroupModel: {
    findById: jest.Mock;
    find: jest.Mock;
    updateMany: jest.Mock;
    updateOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: OrderGroupsService;

  const group = (
    id: Types.ObjectId,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    _id: id,
    recipient_key: null,
    manual_link_id: null,
    fulfillment_status: GroupFulfillmentStatus.PACKED,
    ...extra,
  });

  beforeEach(() => {
    groups = { [idA.toString()]: group(idA), [idB.toString()]: group(idB) };
    orderGroupModel = {
      findById: jest.fn((id: string) => Promise.resolve(groups[id] ?? null)),
      find: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      countDocuments: jest
        .fn()
        .mockReturnValue({ session: jest.fn().mockResolvedValue(1) }),
    };
    session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrderGroupsService(
      orderGroupModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('liên kết 2 nhóm chưa có liên kết → cùng 1 manual_link_id mới, trong 1 transaction', async () => {
    await service.linkGroupsManually(
      idA.toString(),
      idB.toString(),
      ' Cùng khách ',
      'coord-1',
    );
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    const [filter, update] = orderGroupModel.updateMany.mock.calls[0] as [
      { _id: { $in: Types.ObjectId[] } },
      {
        $set: {
          manual_link_id: Types.ObjectId;
          manual_linked_by: string;
          manual_link_note: string;
        };
      },
    ];
    expect(filter._id.$in).toEqual([idA, idB]);
    expect(update.$set.manual_link_id).toBeInstanceOf(Types.ObjectId);
    expect(update.$set.manual_linked_by).toBe('coord-1');
    expect(update.$set.manual_link_note).toBe('Cùng khách');
  });

  it('target đã thuộc 1 bộ liên kết → nhóm mới nối vào ĐÚNG bộ đó', async () => {
    const existing = new Types.ObjectId();
    groups[idB.toString()] = group(idB, { manual_link_id: existing });
    await service.linkGroupsManually(
      idA.toString(),
      idB.toString(),
      undefined,
      'coord-1',
    );
    const firstCall = orderGroupModel.updateMany.mock.calls[0] as [
      unknown,
      { $set: { manual_link_id: Types.ObjectId } },
    ];
    const update = firstCall[1];
    expect(update.$set.manual_link_id).toBe(existing);
  });

  it('2 bộ liên kết khác nhau → gộp bộ của target vào bộ của nhóm gốc', async () => {
    const setA = new Types.ObjectId();
    const setB = new Types.ObjectId();
    groups[idA.toString()] = group(idA, { manual_link_id: setA });
    groups[idB.toString()] = group(idB, { manual_link_id: setB });
    await service.linkGroupsManually(
      idA.toString(),
      idB.toString(),
      undefined,
      'coord-1',
    );
    expect(orderGroupModel.updateMany).toHaveBeenNthCalledWith(
      1,
      { manual_link_id: setB },
      { $set: { manual_link_id: setA } },
      { session },
    );
  });

  it('liên kết với chính nó → 400 ORD_GROUP_LINK_SELF', async () => {
    await expect(
      service.linkGroupsManually(
        idA.toString(),
        idA.toString(),
        undefined,
        'c',
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.LINK_SELF,
    });
  });

  it('nhóm đã giao (shipped) → 409 ORD_GROUP_LINK_NOT_ALLOWED, không ghi gì', async () => {
    groups[idB.toString()] = group(idB, {
      fulfillment_status: GroupFulfillmentStatus.SHIPPED,
    });
    await expect(
      service.linkGroupsManually(
        idA.toString(),
        idB.toString(),
        undefined,
        'c',
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.LINK_NOT_ALLOWED,
    });
    expect(orderGroupModel.updateMany).not.toHaveBeenCalled();
  });

  it('findLinkedGroups: có cả recipient_key và manual_link_id → tìm theo $or', async () => {
    const linkId = new Types.ObjectId();
    groups[idA.toString()] = group(idA, {
      recipient_key: 'rk',
      manual_link_id: linkId,
    });
    await service.findLinkedGroups(idA.toString());
    expect(orderGroupModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ recipient_key: 'rk' }, { manual_link_id: linkId }],
      }),
    );
  });

  it('bỏ liên kết: bộ chỉ còn 1 nhóm → xoá liên kết của nhóm còn lại', async () => {
    const linkId = new Types.ObjectId();
    groups[idA.toString()] = group(idA, { manual_link_id: linkId });
    await service.unlinkGroupManually(idA.toString());
    expect(orderGroupModel.updateOne).toHaveBeenCalledWith(
      { _id: idA },
      { $set: expect.objectContaining({ manual_link_id: null }) as unknown },
      { session },
    );
    expect(orderGroupModel.updateMany).toHaveBeenCalledWith(
      { manual_link_id: linkId },
      { $set: expect.objectContaining({ manual_link_id: null }) as unknown },
      { session },
    );
  });

  it('bỏ liên kết khi nhóm không có liên kết tay → 409 ORD_GROUP_NOT_MANUALLY_LINKED', async () => {
    await expect(
      service.unlinkGroupManually(idA.toString()),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.NOT_MANUALLY_LINKED,
    });
  });
});
