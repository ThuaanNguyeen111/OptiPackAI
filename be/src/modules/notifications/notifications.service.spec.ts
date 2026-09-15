import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';
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
describe('NotificationsService — markAsRead (kiểm tra quyền sở hữu)', () => {
  let service: NotificationsService;

  let notificationModel: { findOneAndUpdate: jest.Mock };
  let userModel: { find: jest.Mock };
  let mailService: { sendNotificationEmail: jest.Mock };

  const notificationId = new Types.ObjectId().toString();
  const callerUserId = new Types.ObjectId().toString();

  beforeEach(() => {
    notificationModel = { findOneAndUpdate: jest.fn() };
    userModel = { find: jest.fn() };
    mailService = { sendNotificationEmail: jest.fn() };

    service = new NotificationsService(
      notificationModel as never,
      userModel as never,
      mailService as never,
    );
  });

  it('id sai định dạng ObjectId -> throw NOTI_INVALID_ID, KHÔNG chạm DB', async () => {
    await expect(
      service.markAsRead(
        'khong-phai-object-id',
        callerUserId,
        UserRole.WAREHOUSE_STAFF,
      ),
    ).rejects.toMatchObject({
      errorCode: NOTIFICATION_ERROR_CODES.INVALID_ID,
    });

    expect(notificationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('query gửi lên DB PHẢI kèm điều kiện sở hữu (đích danh HOẶC theo role) — đây là dòng fix chính', async () => {
    notificationModel.findOneAndUpdate.mockResolvedValue({
      _id: notificationId,
      is_read: true,
    });

    await service.markAsRead(
      notificationId,
      callerUserId,
      UserRole.STORE_OWNER,
    );

    expect(notificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: notificationId,
        $or: [
          { recipient_user_id: callerUserId },
          { recipient_role: UserRole.STORE_OWNER },
        ],
      },
      { $set: { is_read: true } },
      { returnDocument: 'after' },
    );
  });

  it('thông báo tồn tại nhưng KHÔNG thuộc về người gọi -> DB trả null -> throw NOTI_NOT_FOUND (404, không phải 403)', async () => {
    // Mô phỏng đúng hành vi Mongo thật: điều kiện $or không khớp ai cả
    // -> findOneAndUpdate trả null, dù document với _id đó CÓ tồn tại.
    notificationModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.markAsRead(
        notificationId,
        callerUserId,
        UserRole.WAREHOUSE_STAFF,
      ),
    ).rejects.toMatchObject({
      errorCode: NOTIFICATION_ERROR_CODES.NOT_FOUND,
    });
  });

  it('id không tồn tại trong DB -> CÙNG throw NOTI_NOT_FOUND y hệt case "không thuộc về mình" — không để lộ khác biệt', async () => {
    notificationModel.findOneAndUpdate.mockResolvedValue(null);

    const error = await service
      .markAsRead(
        new Types.ObjectId().toString(),
        callerUserId,
        UserRole.WAREHOUSE_STAFF,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      NOTIFICATION_ERROR_CODES.NOT_FOUND,
    );
    expect((error as AppException).getStatus()).toBe(404);
  });

  it('thông báo thuộc về đúng người gọi (đích danh) -> đánh dấu đã đọc thành công', async () => {
    const updated = {
      _id: notificationId,
      is_read: true,
      recipient_user_id: callerUserId,
    };
    notificationModel.findOneAndUpdate.mockResolvedValue(updated);

    const result = await service.markAsRead(
      notificationId,
      callerUserId,
      UserRole.PACKAGING_STAFF,
    );

    expect(result).toBe(updated);
  });
});
