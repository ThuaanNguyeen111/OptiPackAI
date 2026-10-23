import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

//!=============================================
// 23/10/2026 — ĐƠN GỘP: tách đơn khỏi nhóm, gộp 2 nhóm, cảnh báo nhiều người nhận khác tên.
// Tách/gộp chỉ khi nhóm chờ/đang lấy + CHƯA quét món nào (hàng đã quét tính theo nhóm).
//!=============================================

/** Query giả: await được trực tiếp hoặc qua .session(). */
const q = <T>(value: T): Promise<T> & { session: jest.Mock } =>
  Object.assign(Promise.resolve(value), { session: jest.fn().mockResolvedValue(value) });

describe('OrderGroupsService — tách / gộp nhóm đơn + cảnh báo khác tên (23/10/2026)', () => {
  const gA = new Types.ObjectId();
  const gB = new Types.ObjectId();
  const o1 = new Types.ObjectId();
  let groups: Map<string, Record<string, unknown>>;
  let orderGroupModel: { findById: jest.Mock; updateOne: jest.Mock; create: jest.Mock };
  let orderModel: {
    findOne: jest.Mock;
    countDocuments: jest.Mock;
    updateOne: jest.Mock;
    updateMany: jest.Mock;
    find: jest.Mock;
  };
  let pickEventModel: { exists: jest.Mock };
  let activityLogModel: { create: jest.Mock };
  let notificationsService: { notify: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: OrderGroupsService;
  let reconcile: jest.SpyInstance;
  let release: jest.SpyInstance;

  const group = (id: Types.ObjectId, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: id,
    platform: 'aurelle',
    shop_id: 'shop-1',
    shop_name_snapshot: 'shop-1',
    order_count: 2,
    pick_round: 0,
    __v: 3,
    order_priority: 'normal',
    packaging_deadline: null,
    assigned_staff_id: null,
    fulfillment_status: GroupFulfillmentStatus.PICKING,
    ...extra,
  });
  const order = {
    _id: o1,
    platform_order_id: 'AUR-2',
    status: 'pending',
    recipient: { full_name: 'Lê Văn C', phone: '0901234567', address_line1: '12 Lê Lợi', city: 'Hồ Chí Minh' },
  };

  beforeEach(() => {
    groups = new Map([
      [gA.toString(), group(gA)],
      [gB.toString(), group(gB, { order_count: 1, __v: 1 })],
    ]);
    orderGroupModel = {
      findById: jest.fn((id: Types.ObjectId | string) => Promise.resolve(groups.get(id.toString()) ?? null)),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
      create: jest.fn((docs: Record<string, unknown>[]) => {
        for (const d of docs) groups.set((d._id as Types.ObjectId).toString(), group(d._id as Types.ObjectId, { ...d, __v: 0 }));
        return Promise.resolve(docs);
      }),
    };
    orderModel = {
      findOne: jest.fn().mockResolvedValue(order),
      countDocuments: jest.fn(() => q(2)),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      find: jest.fn(() => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(), platform_order_id: 'AUR-9', status: 'pending', recipient: { full_name: 'Trần Thị B' } },
          ]),
        }),
      })),
    };
    pickEventModel = { exists: jest.fn(() => q(null)) };
    activityLogModel = { create: jest.fn().mockResolvedValue([{}]) };
    notificationsService = { notify: jest.fn().mockResolvedValue({}) };
    session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      {} as never,
      {} as never,
      pickEventModel as never,
      {} as never,
      {} as never,
      notificationsService as never,
      {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      activityLogModel as never,
    );
    reconcile = jest.spyOn(service, 'reconcileReservation').mockResolvedValue(undefined);
    release = jest.spyOn(service, 'releaseReservation').mockResolvedValue(0);
    jest.spyOn(service, 'refreshOrderCounts').mockResolvedValue(undefined);
    jest
      .spyOn(service as unknown as { startPickingPhase: (g: unknown) => Promise<unknown> }, 'startPickingPhase')
      .mockImplementation((g) => Promise.resolve(g));
  });

  describe('splitOrderFromGroup', () => {
    it('tách đơn → nhóm mới đóng (không tự gom), đơn chuyển nhóm, ghi lịch sử 2 nhóm, giữ chỗ tính lại', async () => {
      const { newGroup } = await service.splitOrderFromGroup(gA.toString(), o1.toString(), 3, 'Khách khác nhau', 'owner-1');

      const [[docs]] = orderGroupModel.create.mock.calls as [[Record<string, unknown>[]]];
      const [created] = docs as [Record<string, unknown>];
      expect(created).toMatchObject({ split_from_group_id: gA, consolidation_closed: true, order_count: 1, platform: 'aurelle' });
      expect(newGroup._id.toString()).toBe((created._id as Types.ObjectId).toString());
      expect(orderModel.updateOne).toHaveBeenCalledWith(
        { _id: o1, consolidated_group_id: gA },
        { $set: { consolidated_group_id: created._id, is_consolidated: false } },
        { session },
      );
      // nhóm gốc: kiểm version + trừ 1 đơn
      expect((orderGroupModel.updateOne.mock.calls as unknown[][])[0]?.[0]).toMatchObject({ _id: gA, __v: 3 });
      expect(activityLogModel.create).toHaveBeenCalledTimes(2);
      expect(reconcile).toHaveBeenCalledWith(gA.toString());
    });

    it('đã quét lấy hàng ở lượt hiện tại → 409 REGROUP_HAS_PICKS, không đụng dữ liệu', async () => {
      pickEventModel.exists.mockImplementation(() => q({ _id: new Types.ObjectId() }));
      await expect(service.splitOrderFromGroup(gA.toString(), o1.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.REGROUP_HAS_PICKS,
      });
      expect(orderGroupModel.create).not.toHaveBeenCalled();
    });

    it('nhóm đã lấy xong (picked) → 409 REGROUP_NOT_ALLOWED', async () => {
      groups.set(gA.toString(), group(gA, { fulfillment_status: GroupFulfillmentStatus.PICKED }));
      await expect(service.splitOrderFromGroup(gA.toString(), o1.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.REGROUP_NOT_ALLOWED,
      });
    });

    it('nhóm chỉ còn 1 đơn còn hiệu lực → 409 REGROUP_NOT_ALLOWED', async () => {
      orderModel.countDocuments.mockImplementation(() => q(1));
      await expect(service.splitOrderFromGroup(gA.toString(), o1.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.REGROUP_NOT_ALLOWED,
      });
    });

    it('version cũ → 409 STATE_CONFLICT', async () => {
      await expect(service.splitOrderFromGroup(gA.toString(), o1.toString(), 2, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      });
    });

    it('đơn không thuộc nhóm → 404 ORDER_NOT_FOUND', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await expect(service.splitOrderFromGroup(gA.toString(), o1.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.ORDER_NOT_FOUND,
      });
    });
  });

  describe('mergeGroups', () => {
    it('gộp B vào A → B canceled + merged_into_group_id, đơn chuyển sang A, nhả giữ chỗ B, tính lại A', async () => {
      await service.mergeGroups(gA.toString(), gB.toString(), 3, 'Cùng khách', 'coord-1');

      const closeCall = (orderGroupModel.updateOne.mock.calls as unknown[][]).find((c) => (c[0] as { _id: Types.ObjectId })._id.equals(gB)) as [
        unknown,
        { $set: Record<string, unknown> },
      ];
      expect(closeCall[1].$set).toMatchObject({
        fulfillment_status: GroupFulfillmentStatus.CANCELED,
        merged_into_group_id: gA,
      });
      expect(orderModel.updateMany).toHaveBeenCalledWith(
        { consolidated_group_id: gB },
        { $set: { consolidated_group_id: gA } },
        { session },
      );
      expect(release).toHaveBeenCalledWith(gB.toString());
      expect(reconcile).toHaveBeenCalledWith(gA.toString());
    });

    it('khác shop → 409 MERGE_SCOPE_MISMATCH (hướng dẫn dùng liên kết)', async () => {
      groups.set(gB.toString(), group(gB, { shop_id: 'shop-2' }));
      await expect(service.mergeGroups(gA.toString(), gB.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.MERGE_SCOPE_MISMATCH,
      });
    });

    it('2 nhóm có SĐT thật khác nhau → 409 MERGE_RECIPIENT_MISMATCH (SĐT bị che không tính)', async () => {
      orderModel.find.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(), platform_order_id: 'AUR-9', status: 'pending', recipient: { phone: '0901234567' } },
            { _id: new Types.ObjectId(), platform_order_id: 'AUR-8', status: 'pending', recipient: { phone: '+84 912 000 111' } },
            { _id: new Types.ObjectId(), platform_order_id: 'LZ-1', status: 'pending', recipient: { phone: '09******67' } },
          ]),
        }),
      }));
      await expect(service.mergeGroups(gA.toString(), gB.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.MERGE_RECIPIENT_MISMATCH,
      });
      expect(session.withTransaction).not.toHaveBeenCalled();
    });

    it('gộp với chính nó → 400 MERGE_SELF', async () => {
      await expect(service.mergeGroups(gA.toString(), gA.toString(), 3, 'x y z', 'u')).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.MERGE_SELF,
      });
    });
  });

  describe('cảnh báo nhiều người nhận khác tên', () => {
    const withNames = (names: string[]): void => {
      orderModel.find.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(names.map((n) => ({ recipient: { full_name: n } }))),
        }),
      }));
    };
    const warn = (g: Record<string, unknown>): Promise<void> =>
      (service as unknown as { warnIfRecipientNamesDiffer: (g: unknown, c: string | null) => Promise<void> }).warnIfRecipientNamesDiffer(
        g,
        'AUR-3',
      );

    it('2 tên khác nhau → báo Chủ shop, Điều phối, nhân viên kho đang giữ + ghi sổ', async () => {
      withNames(['Trần Thị B', 'Lê Văn C']);
      const staff = new Types.ObjectId();
      await warn(group(gA, { assigned_staff_id: staff }));
      const calls = (notificationsService.notify.mock.calls as unknown[][]).map((c) => c[0] as Record<string, unknown>);
      expect(calls.map((c) => c.recipientRole ?? c.recipientUserId)).toEqual([
        UserRole.STORE_OWNER,
        UserRole.SHIPPING_COORDINATOR,
        staff.toString(),
      ]);
      expect(calls[0]).toMatchObject({ type: NotificationType.CONSOLIDATION_NAME_MISMATCH, relatedEntityId: gA.toString() });
      expect(activityLogModel.create).toHaveBeenCalledTimes(1);
    });

    it('cùng tên khác cách viết / tên bị che → không báo', async () => {
      withNames(['Lê Văn C', 'le van c', 'L**C']);
      await warn(group(gA));
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });
});
