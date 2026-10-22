import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { ReturnsController } from '../shipments/returns.controller';
import { RETURN_ERROR_CODES } from '../shipments/returns.errors';
import { MarketplaceIntegrationService } from '../marketplace-integration/marketplace-integration.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { MKT_ERROR_CODES } from '../marketplace-integration/marketplace-integration.errors';
import { StaffAssignmentService } from '../order-groups/staff-assignment.service';
import { STAFF_ASSIGNMENT_ERROR_CODES } from '../order-groups/staff-assignment.errors';
import { UsersService } from './services/users.service';
import { USER_ERROR_CODES } from './users.errors';
import { isOnLeave, notOnLeaveFilter } from './utils/on-leave.util';

/** 22/10/2026 — bỏ giả lập trả hàng, ngắt kết nối shop, nghỉ phép nhân viên. */

describe('POST /returns đã tắt', () => {
  it('ném 410 RMA_SIMULATION_DISABLED, không gọi service', () => {
    const service = { createSimulated: jest.fn() };
    const controller = new ReturnsController(service as never);
    try {
      controller.create();
      throw new Error('phải ném lỗi');
    } catch (error: unknown) {
      expect(error).toMatchObject({ errorCode: RETURN_ERROR_CODES.SIMULATION_DISABLED });
      expect((error as { getStatus(): number }).getStatus()).toBe(HttpStatus.GONE);
    }
    expect(service.createSimulated).not.toHaveBeenCalled();
  });
});

describe('MarketplaceIntegrationService.disconnectShop', () => {
  function build(rows: { is_active: boolean }[]) {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: rows.filter((r) => r.is_active).length });
    const find = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(rows) }) }));
    const service = new MarketplaceIntegrationService({ find, updateMany } as never, {} as never, {}, {} as ConfigService);
    return { service, updateMany };
  }

  it('chỉ đặt is_active=false (không xoá), ghi người + thời điểm ngắt', async () => {
    const { service, updateMany } = build([{ is_active: true }]);
    const actor = new Types.ObjectId().toString();
    const result = await service.disconnectShop(MarketplacePlatform.AURELLE, '200000000101', actor);
    expect(result).toMatchObject({ shopId: '200000000101', isActive: false, wasActive: true });
    const [filter, update] = updateMany.mock.calls[0] as [Record<string, unknown>, { $set: Record<string, unknown> }];
    expect(filter).toEqual({ platform: MarketplacePlatform.AURELLE, shop_id: '200000000101', is_active: true });
    expect(update.$set).toMatchObject({ is_active: false, disconnected_by: new Types.ObjectId(actor) });
  });

  it('gọi lại khi đã ngắt → 200, wasActive=false, không ghi gì', async () => {
    const { service, updateMany } = build([{ is_active: false }]);
    const result = await service.disconnectShop(MarketplacePlatform.LAZADA, 'S1', new Types.ObjectId().toString());
    expect(result.wasActive).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('shop chưa từng kết nối → 404 MKT_SHOP_NOT_FOUND', async () => {
    const { service } = build([]);
    await expect(service.disconnectShop(MarketplacePlatform.LAZADA, 'X', new Types.ObjectId().toString())).rejects.toMatchObject({
      errorCode: MKT_ERROR_CODES.SHOP_NOT_FOUND,
    });
  });
});

describe('Nghỉ phép nhân viên', () => {
  const now = new Date('2026-10-22T08:00:00Z');

  it('isOnLeave: nghỉ không hạn / còn hạn = đang nghỉ; qua hạn hoặc tắt = đi làm', () => {
    expect(isOnLeave({ on_leave: true, on_leave_until: null }, now)).toBe(true);
    expect(isOnLeave({ on_leave: true, on_leave_until: new Date('2026-10-23T00:00:00Z') }, now)).toBe(true);
    expect(isOnLeave({ on_leave: true, on_leave_until: new Date('2026-10-21T00:00:00Z') }, now)).toBe(false);
    expect(isOnLeave({ on_leave: false }, now)).toBe(false);
    expect(isOnLeave(null, now)).toBe(false);
    expect(notOnLeaveFilter(now)).toEqual({ $or: [{ on_leave: { $ne: true } }, { on_leave_until: { $ne: null, $lte: now } }] });
  });

  it('tự giao lấy hàng bỏ qua người đang nghỉ (bộ lọc có notOnLeave)', async () => {
    const staffId = new Types.ObjectId();
    const userFind = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([{ _id: staffId }]) }) }));
    const groupModel = {
      aggregate: jest.fn().mockResolvedValue([]),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), assigned_staff_id: staffId }),
    };
    const service = new StaffAssignmentService(groupModel as never, { find: userFind } as never);
    await service.autoAssign(new Types.ObjectId().toString());
    const filter = (userFind.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(filter).toMatchObject({ role: UserRole.WAREHOUSE_STAFF, is_active: true });
    expect(filter.$and).toEqual([expect.objectContaining({ $or: expect.any(Array) as unknown })]);
  });

  it('giao tay cho người đang nghỉ → 409 ORD_GROUP_STAFF_ON_LEAVE', async () => {
    const staff = { _id: new Types.ObjectId(), name: 'An', is_active: true, role: UserRole.WAREHOUSE_STAFF, on_leave: true, on_leave_until: null };
    const service = new StaffAssignmentService({} as never, { findById: jest.fn().mockResolvedValue(staff) } as never);
    await expect(service.manualAssign(new Types.ObjectId().toString(), staff._id.toString())).rejects.toMatchObject({
      errorCode: STAFF_ASSIGNMENT_ERROR_CODES.STAFF_ON_LEAVE,
    });
  });

  function usersService(user: Record<string, unknown> | null): UsersService {
    return new UsersService(
      { findById: jest.fn().mockResolvedValue(user) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('setLeave: bật có hạn + ghi chú; tắt thì xoá hạn/ghi chú', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user: Record<string, unknown> = { role: UserRole.PACKAGING_STAFF, email: 'p@x.vn', on_leave: false, on_leave_since: null, save };
    const service = usersService(user);
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await service.setLeave(new Types.ObjectId().toString(), { on_leave: true, until, note: ' Nghỉ phép năm ' });
    expect(user).toMatchObject({ on_leave: true, on_leave_note: 'Nghỉ phép năm' });
    expect((user.on_leave_until as Date).toISOString()).toBe(until);
    expect(user.on_leave_since).toBeInstanceOf(Date);
    await service.setLeave(new Types.ObjectId().toString(), { on_leave: false });
    expect(user).toMatchObject({ on_leave: false, on_leave_until: null, on_leave_note: null, on_leave_since: null });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('setLeave: hạn đã qua → 400; Admin/Store Owner → 422 (không phải nhân viên vận hành)', async () => {
    const staff = usersService({ role: UserRole.WAREHOUSE_STAFF, save: jest.fn() });
    await expect(
      staff.setLeave(new Types.ObjectId().toString(), { on_leave: true, until: '2020-01-01T00:00:00Z' }),
    ).rejects.toMatchObject({ errorCode: USER_ERROR_CODES.LEAVE_UNTIL_PAST });
    const owner = usersService({ role: UserRole.STORE_OWNER, save: jest.fn() });
    await expect(owner.setLeave(new Types.ObjectId().toString(), { on_leave: true })).rejects.toMatchObject({
      errorCode: USER_ERROR_CODES.LEAVE_NOT_STAFF,
    });
  });
});
