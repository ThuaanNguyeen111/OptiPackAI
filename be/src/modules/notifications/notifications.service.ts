import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { NotificationType } from './enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { AppException } from '../../common/exceptions/app-exception';
import { NOTIFICATION_ERROR_CODES } from './notifications.errors';

interface CreateNotificationInput {
  recipientUserId?: string;
  recipientRole?: UserRole;
  type: NotificationType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * ===================================================================
 * notifications.service.ts — MỚI (2026-09-10)
 * ===================================================================
 * "Cổng thông báo chung" (generic notification port) đã hứa trước khi
 * code report-missing — mọi module khác (packaging/, order-groups/,
 * marketplace-integration/ tương lai) gọi qua ĐÚNG 1 method `notify()`,
 * không cần biết chi tiết bên trong (in-app + email đồng thời, đúng
 * yêu cầu "tất cả kênh" của user).
 *
 * VĂN PHONG THÔNG BÁO — CHUYÊN NGHIỆP, không đùa cợt, không giọng
 * điệu máy móc lộ liễu. Toàn bộ template dựng sẵn trong
 * `buildMissingItemMessage()` và các hàm tương tự — KHÔNG để caller tự
 * ghép chuỗi tùy tiện, đảm bảo văn phong nhất quán trên toàn hệ thống.
 * ===================================================================
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly mailService: MailService,
  ) {}

  /**
   * Gửi 1 thông báo — ghi in-app NGAY (đồng bộ, để FE polling thấy
   * ngay lập tức), gửi email SONG SONG không chờ (bất đồng bộ — lỗi
   * SMTP không được làm chậm/fail nghiệp vụ chính đang gọi notify()).
   */
  async notify(input: CreateNotificationInput): Promise<NotificationDocument> {
    const notification = await this.notificationModel.create({
      recipient_user_id: input.recipientUserId ?? null,
      recipient_role: input.recipientRole ?? null,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      channels_sent: ['in_app'],
    });

    // Gửi email KHÔNG chờ (fire-and-forget) — đúng nguyên tắc đã áp
    // dụng ở MailService.send(): lỗi SMTP không được chặn nghiệp vụ
    // chính. Xác định người nhận email: đích danh 1 user, hoặc TẤT CẢ
    // user thuộc role (broadcast).
    void this.sendEmailAsync(notification, input);

    return notification;
  }

  private async sendEmailAsync(
    notification: NotificationDocument,
    input: CreateNotificationInput,
  ): Promise<void> {
    try {
      const recipients = input.recipientUserId
        ? await this.userModel.find({ _id: input.recipientUserId }).select('email name').lean()
        : await this.userModel.find({ role: input.recipientRole, is_active: true }).select('email name').lean();

      for (const recipient of recipients) {
        await this.mailService.sendNotificationEmail({
          to: recipient.email,
          title: input.title,
          message: input.message,
        });
      }

      if (recipients.length > 0) {
        await this.notificationModel.updateOne(
          { _id: notification._id },
          { $addToSet: { channels_sent: 'email' } },
        );
      }
    } catch (error) {
      this.logger.warn(`Gửi email thông báo thất bại cho notification ${String(notification._id)}.`, error);
    }
  }

  async listForUser(userId: string, role: UserRole, isRead?: boolean): Promise<NotificationDocument[]> {
    const filter: Record<string, unknown> = {
      $or: [{ recipient_user_id: userId }, { recipient_role: role }],
    };
    if (isRead !== undefined) filter.is_read = isRead;

    return this.notificationModel.find(filter).sort({ created_at: -1 }).limit(50).lean();
  }

  async unreadCount(userId: string, role: UserRole): Promise<number> {
    return this.notificationModel.countDocuments({
      $or: [{ recipient_user_id: userId }, { recipient_role: role }],
      is_read: false,
    });
  }

  async markAsRead(notificationId: string): Promise<NotificationDocument> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new AppException(
        NOTIFICATION_ERROR_CODES.INVALID_ID,
        `"${notificationId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { notificationId },
      );
    }
    const updated = await this.notificationModel.findByIdAndUpdate(
      notificationId,
      { $set: { is_read: true } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        NOTIFICATION_ERROR_CODES.NOT_FOUND,
        `Không tìm thấy thông báo với id "${notificationId}".`,
        HttpStatus.NOT_FOUND,
        { notificationId },
      );
    }
    return updated;
  }

  // ===================================================================
  // TEMPLATE VĂN PHONG CHUYÊN NGHIỆP — dùng chung, KHÔNG để caller tự
  // ghép chuỗi. Mở rộng thêm khi có sự kiện mới (SLA, abnormal...).
  // ===================================================================

  buildMissingItemMessage(params: {
    groupId: string;
    sku: string;
    requestedQuantity: number;
    reportedBy: string;
  }): { title: string; message: string } {
    return {
      title: `Thiếu hàng — Đơn hàng #${params.groupId}`,
      message: `Nhân viên kho ${params.reportedBy} đã ghi nhận sản phẩm mã "${params.sku}" không đủ số lượng yêu cầu (${String(params.requestedQuantity)}) tại thời điểm soạn hàng cho đơn #${params.groupId}. Đơn hàng hiện đang tạm dừng, chờ xác nhận trước khi tiếp tục xử lý. Đề nghị kiểm tra tồn kho và phê duyệt phương án xử lý trong thời gian sớm nhất.`,
    };
  }

  buildAbnormalPackageMessage(params: {
    groupId: string;
    estimatedWeightKg: number;
    actualWeightKg: number;
  }): { title: string; message: string } {
    return {
      title: `Cảnh báo sai lệch cân nặng — Đơn hàng #${params.groupId}`,
      message: `Cân nặng thực tế của đơn hàng #${params.groupId} (${String(params.actualWeightKg)} kg) chênh lệch đáng kể so với ước tính hệ thống (${String(params.estimatedWeightKg)} kg). Đề nghị kiểm tra lại nội dung đóng gói trước khi bàn giao vận chuyển.`,
    };
  }
}
