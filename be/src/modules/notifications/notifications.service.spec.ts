import { Types } from 'mongoose';
import { NotificationsService, toNotificationView } from './notifications.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { NOTIFICATION_ERROR_CODES } from './notifications.errors';

//!=============================================
// FIX bảo mật (AOFP-XX, 2026-09-15): markAsRead() trước đây KHÔNG kiểm tra
// quyền sở hữu — bất kỳ user nào cũng đánh dấu "đã đọc" được thông báo của
// người/role khác. Test này tập trung xác nhận đúng điều kiện sở hữu mới
// thêm (recipient_user_id HOẶC recipient_role phải khớp người gọi), không
// test lại toàn bộ service (notify()/listForUser() đã ổn định từ trước).
//!=============================================
describe('NotificationsService — markAsRead (sở hữu + đọc riêng theo người)', () => {
  let service: NotificationsService;
  let notificationModel: { findOneAndUpdate: jest.Mock; updateMany: jest.Mock; find: jest.Mock; countDocuments: jest.Mock };

  const notificationId = new Types.ObjectId().toString();
  const callerUserId = new Types.ObjectId().toString();
  const roleIn = (role: UserRole): { $in: (UserRole | string)[] } => ({ $in: [role, String(role)] });
  const lean = (value: unknown): { lean: () => Promise<unknown> } => ({ lean: () => Promise.resolve(value) });
  const doc = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: new Types.ObjectId(notificationId),
    recipient_user_id: null,
    type: 'pending_approval',
    severity: 'info',
    title: 't',
    message: 'm',
    related_entity_type: 'order_group',
    related_entity_id: new Types.ObjectId(),
    is_read: false,
    read_by: [],
    created_at: new Date(),
    ...extra,
  });

  beforeEach(() => {
    notificationModel = {
      findOneAndUpdate: jest.fn(() => lean(null)),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      find: jest.fn(() => ({ sort: () => ({ limit: () => lean([]) }) })),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    service = new NotificationsService(notificationModel as never, {} as never, {} as never);
  });

  it('id sai định dạng ObjectId -> NOTI_INVALID_ID, KHÔNG chạm DB', async () => {
    await expect(service.markAsRead('khong-phai-object-id', callerUserId, UserRole.WAREHOUSE_STAFF)).rejects.toMatchObject({
      errorCode: NOTIFICATION_ERROR_CODES.INVALID_ID,
    });
    expect(notificationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('thông báo đích danh -> set is_read; trả dạng view (id, không _id)', async () => {
    notificationModel.findOneAndUpdate.mockReturnValueOnce(lean(doc({ recipient_user_id: new Types.ObjectId(callerUserId), is_read: true })));
    const view = await service.markAsRead(notificationId, callerUserId, UserRole.PACKAGING_STAFF);
    expect(notificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: notificationId, recipient_user_id: callerUserId },
      { $set: { is_read: true } },
      { returnDocument: 'after' },
    );
    expect(view.id).toBe(notificationId);
    expect(view.is_read).toBe(true);
    expect(view).not.toHaveProperty('_id');
  });

  it('thông báo theo role -> chỉ thêm người gọi vào read_by (người khác cùng role vẫn thấy chưa đọc)', async () => {
    notificationModel.findOneAndUpdate
      .mockReturnValueOnce(lean(null))
      .mockReturnValueOnce(lean(doc({ read_by: [new Types.ObjectId(callerUserId)] })));
    const view = await service.markAsRead(notificationId, callerUserId, UserRole.STORE_OWNER);
    const [filter, update] = notificationModel.findOneAndUpdate.mock.calls[1] as [Record<string, unknown>, { $addToSet: { read_by: Types.ObjectId } }];
    expect(filter).toEqual({ _id: notificationId, recipient_role: roleIn(UserRole.STORE_OWNER) });
    expect(String(update.$addToSet.read_by)).toBe(callerUserId);
    expect(view.is_read).toBe(true);
    expect(toNotificationView(doc() as never, new Types.ObjectId().toString()).is_read).toBe(false);
  });

  it('không thuộc về người gọi / không tồn tại -> cùng NOTI_NOT_FOUND 404', async () => {
    const error = await service.markAsRead(notificationId, callerUserId, UserRole.WAREHOUSE_STAFF).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(NOTIFICATION_ERROR_CODES.NOT_FOUND);
    expect((error as AppException).getStatus()).toBe(404);
  });

  it('unreadCount: thông báo role chưa có người gọi trong read_by mới tính chưa đọc', async () => {
    await service.unreadCount(callerUserId, UserRole.WAREHOUSE_STAFF);
    expect(notificationModel.countDocuments).toHaveBeenCalledWith({
      $or: [
        { recipient_user_id: callerUserId, is_read: false },
        { recipient_role: roleIn(UserRole.WAREHOUSE_STAFF), is_read: false, read_by: { $ne: callerUserId } },
      ],
    });
  });

  it('markAllAsRead: đích danh set is_read, role thêm read_by', async () => {
    expect(await service.markAllAsRead(callerUserId, UserRole.ADMIN)).toBe(2);
    expect(notificationModel.updateMany).toHaveBeenCalledTimes(2);
  });
});

//!=============================================
// BỔ SUNG (21/09/2026, báo cáo thật từ FE) — 2 hành vi mới: notify()
// ghi recipient_role dạng SỐ tường minh (không phụ thuộc schema tự
// cast), và 2 template message mới cho generate()/reject() (packaging).
//!=============================================
describe('NotificationsService — notify() ghi Number + 2 template mới', () => {
  let service: NotificationsService;
  let notificationModel: { create: jest.Mock };
  let userModel: { find: jest.Mock };
  let mailService: { sendNotificationEmail: jest.Mock };

  beforeEach(() => {
    notificationModel = {
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId().toString() }),
    };
    userModel = { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) };
    mailService = { sendNotificationEmail: jest.fn() };

    service = new NotificationsService(
      notificationModel as never,
      userModel as never,
      mailService as never,
    );
  });

  it('notify() ghi recipient_role dạng SỐ tường minh (Number()), không giữ nguyên kiểu input', async () => {
    await service.notify({
      recipientRole: UserRole.PACKAGING_STAFF,
      type: 'pending_approval' as never,
      severity: 'info',
      title: 't',
      message: 'm',
    });

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_role: UserRole.PACKAGING_STAFF }),
    );
    const createCall = notificationModel.create.mock.calls[0] as [{ recipient_role: unknown }];
    expect(typeof createCall[0].recipient_role).toBe('number');
  });

  it('recipientRole không truyền -> ghi null, KHÔNG ghi undefined/NaN', async () => {
    await service.notify({
      type: 'pending_approval' as never,
      severity: 'info',
      title: 't',
      message: 'm',
    });

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_role: null }),
    );
  });

  it('buildPendingPackagingPlanMessage trả đúng cấu trúc title/message, có nhắc groupId', () => {
    const result = service.buildPendingPackagingPlanMessage({
      groupId: 'GRP-1',
      boxSummary: 'thùng 20x20x20cm',
    });
    expect(result.title).toContain('GRP-1');
    expect(result.message).toContain('GRP-1');
    expect(result.message).toContain('thùng 20x20x20cm');
  });

  it('buildPackagingRejectedMessage trả đúng cấu trúc, có nhắc lý do từ chối', () => {
    const result = service.buildPackagingRejectedMessage({
      groupId: 'GRP-1',
      reason: 'Sai kích thước',
    });
    expect(result.title).toContain('GRP-1');
    expect(result.message).toContain('Sai kích thước');
  });
});
