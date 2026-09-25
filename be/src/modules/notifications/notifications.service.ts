import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
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
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
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
      // SỬA (21/09/2026) — Number() tường minh, không phụ thuộc schema
      // tự cast đúng — phòng thủ rõ ràng, khớp đúng kiểu Number đã sửa
      // ở schema (notification.schema.ts). TS tin `recipientRole` chắc
      // chắn là UserRole (số) theo type khai báo, nên coi 2 dòng dưới
      // là "thừa" — nhưng đây là phòng thủ RUNTIME có chủ đích: type
      // khai báo không đảm bảo giá trị THẬT lúc chạy luôn đúng kiểu
      // (VD dữ liệu đi qua JSON/JWT có thể ép kiểu sai mà TS không bắt
      // được) — đúng bài học đã rút ra từ bug recipient_role String
      // vs Number chính là ở tệp này.
      recipient_role:
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- phòng thủ runtime có chủ đích, xem comment trên
        input.recipientRole === undefined || input.recipientRole === null
          ? null
          : // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- phòng thủ runtime có chủ đích, xem comment trên
            Number(input.recipientRole),
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
        ? await this.userModel
            .find({ _id: input.recipientUserId })
            .select('email name')
            .lean()
        : await this.userModel
            .find({ role: input.recipientRole, is_active: true })
            .select('email name')
            .lean();

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
      this.logger.warn(
        `Gửi email thông báo thất bại cho notification ${String(notification._id)}.`,
        error,
      );
    }
  }

  /**
   * BỔ SUNG (21/09/2026, báo cáo thật từ FE) — dùng CHUNG cho list/
   * unread/markAsRead. Match CẢ 2 kiểu dữ liệu (`role` số THẬT, và
   * `String(role)` — dữ liệu CŨ trước khi sửa schema/migration) — cần
   * thiết cho tới khi `scripts/migrate-notification-role-types.ts`
   * chạy xong TRÊN MỌI MÔI TRƯỜNG (không chỉ máy dev) — xóa nhánh
   * String(role) khỏi $in sau khi chắc chắn không còn document nào
   * dạng cũ (xem CLAUDE.md mục lịch sử fix này để biết khi nào an
   * toàn dọn dẹp).
   */
  private recipientFilter(
    userId: string,
    role: UserRole,
  ): Record<string, unknown> {
    return {
      $or: [
        { recipient_user_id: userId },
        { recipient_role: { $in: [role, String(role)] } },
      ],
    };
  }

  async listForUser(
    userId: string,
    role: UserRole,
    isRead?: boolean,
  ): Promise<NotificationDocument[]> {
    const filter: Record<string, unknown> = this.recipientFilter(userId, role);
    if (isRead !== undefined) filter.is_read = isRead;

    return this.notificationModel
      .find(filter)
      .sort({ created_at: -1 })
      .limit(50)
      .lean();
  }

  async unreadCount(userId: string, role: UserRole): Promise<number> {
    return this.notificationModel.countDocuments({
      ...this.recipientFilter(userId, role),
      is_read: false,
    });
  }

  async markAsRead(
    notificationId: string,
    userId: string,
    role: UserRole,
  ): Promise<NotificationDocument> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new AppException(
        NOTIFICATION_ERROR_CODES.INVALID_ID,
        `"${notificationId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { notificationId },
      );
    }
    // Chỉ cho phép đánh dấu đã đọc thông báo thuộc về CHÍNH người gọi
    // (đích danh HOẶC broadcast theo đúng role của họ) — trước đây
    // thiếu điều kiện này, bất kỳ user nào cũng đánh dấu đã đọc được
    // thông báo của người khác (AOFP-XX). Không tìm thấy do sai id
    // HAY do không thuộc về mình đều trả cùng 404 NOT_FOUND — không
    // để lộ việc thông báo đó có tồn tại hay không nếu không phải của
    // người gọi.
    const updated = await this.notificationModel.findOneAndUpdate(
      {
        _id: notificationId,
        ...this.recipientFilter(userId, role),
      },
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

  // BỔ SUNG (21/09/2026, báo cáo thật từ FE — mục 2/3 checklist) —
  // 2 template mới cho notify sau generate()/reject() (packaging.service.ts).
  buildPendingPackagingPlanMessage(params: {
    groupId: string;
    boxSummary: string;
  }): { title: string; message: string } {
    return {
      title: `Có kế hoạch đóng gói mới chờ duyệt — Đơn hàng #${params.groupId}`,
      message: `Hệ thống vừa tính xong gợi ý đóng gói cho đơn hàng #${params.groupId} (${params.boxSummary}). Đề nghị kiểm tra lại hàng thật rồi duyệt hoặc điều chỉnh trước khi bàn giao đóng gói.`,
    };
  }

  buildPackagingRejectedMessage(params: { groupId: string; reason: string }): {
    title: string;
    message: string;
  } {
    return {
      title: `Gợi ý đóng gói bị từ chối — Đơn hàng #${params.groupId}`,
      message: `Packaging Staff đã từ chối gợi ý đóng gói hiện tại của đơn hàng #${params.groupId}. Lý do: "${params.reason}". Hàng vẫn giữ nguyên đã lấy — chờ tính lại gợi ý mới.`,
    };
  }
}
