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
/**
 * (09/10/2026) Hình dạng trả cho FE — trước đây trả nguyên document (`_id`,
 * `__v`, `read_by`, `channels_sent`). Giữ snake_case như FE đang đọc; `is_read`
 * là trạng thái CỦA NGƯỜI GỌI (thông báo theo role mỗi người đọc riêng).
 */
export interface NotificationView {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: Date | null;
}

type NotificationLean = Pick<
  Notification,
  'recipient_user_id' | 'type' | 'severity' | 'title' | 'message' | 'related_entity_type' | 'related_entity_id' | 'is_read'
> & { _id: Types.ObjectId; read_by?: Types.ObjectId[]; created_at?: Date };

export function toNotificationView(doc: NotificationLean, userId: string): NotificationView {
  const isRead = doc.recipient_user_id
    ? doc.is_read
    : doc.is_read || (doc.read_by ?? []).some((id) => id.toString() === userId);
  return {
    id: doc._id.toString(),
    type: doc.type,
    severity: doc.severity,
    title: doc.title,
    message: doc.message,
    related_entity_type: doc.related_entity_type,
    related_entity_id: doc.related_entity_id ? doc.related_entity_id.toString() : null,
    is_read: isRead,
    created_at: doc.created_at ?? null,
  };
}

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
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- phòng thủ runtime có chủ đích, xem comment trên
          : Number(input.recipientRole),
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
        if (input.type === NotificationType.MFA_DISABLED) {
          await this.mailService.sendMfaDisabled({
            to: recipient.email,
            name: recipient.name,
          });
        } else {
          await this.mailService.sendNotificationEmail({
            to: recipient.email,
            title: input.title,
            message: input.message,
          });
        }
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
  private recipientFilter(userId: string, role: UserRole): Record<string, unknown> {
    return {
      $or: [
        { recipient_user_id: userId },
        { recipient_role: { $in: [role, String(role)] } },
      ],
    };
  }

  /** Filter có `role` dạng chuỗi (dữ liệu cũ) — kiểu strict của Mongoose không diễn tả được. */
  private asFilter(filter: Record<string, unknown>): Record<string, unknown> {
    return filter;
  }

  /** Điều kiện "đã đọc/chưa đọc" theo NGƯỜI GỌI (đích danh dùng is_read, theo role dùng read_by). */
  private readStateFilter(userId: string, role: UserRole, isRead: boolean): Record<string, unknown> {
    const roles = { $in: [role, String(role)] };
    return isRead
      ? {
          $or: [
            { recipient_user_id: userId, is_read: true },
            { recipient_role: roles, $or: [{ is_read: true }, { read_by: userId }] },
          ],
        }
      : {
          $or: [
            { recipient_user_id: userId, is_read: false },
            { recipient_role: roles, is_read: false, read_by: { $ne: userId } },
          ],
        };
  }

  /**
   * Danh sách thông báo của người gọi, mới nhất trước. Phân trang bằng con trỏ
   * `before` (created_at của dòng cuối trang trước), `limit` 1–100 (mặc định 50).
   */
  async listForUser(
    userId: string,
    role: UserRole,
    isRead?: boolean,
    options: { before?: Date; limit?: number } = {},
  ): Promise<NotificationView[]> {
    const filter: Record<string, unknown> =
      isRead === undefined ? this.recipientFilter(userId, role) : this.readStateFilter(userId, role, isRead);
    if (options.before) filter.created_at = { $lt: options.before };
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const docs = await this.notificationModel.find(filter).sort({ created_at: -1 }).limit(limit).lean();
    return docs.map((d) => toNotificationView(d, userId));
  }

  async unreadCount(userId: string, role: UserRole): Promise<number> {
    return this.notificationModel.countDocuments(this.readStateFilter(userId, role, false));
  }

  async markAsRead(notificationId: string, userId: string, role: UserRole): Promise<NotificationView> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new AppException(
        NOTIFICATION_ERROR_CODES.INVALID_ID,
        `"${notificationId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { notificationId },
      );
    }
    // Chỉ thông báo của CHÍNH người gọi (đích danh hoặc theo role của họ). Không
    // tìm thấy do sai id hay do không phải của mình đều trả cùng 404.
    const updated =
      (await this.notificationModel
        .findOneAndUpdate(
          this.asFilter({ _id: notificationId, recipient_user_id: userId }),
          { $set: { is_read: true } },
          { returnDocument: 'after' },
        )
        .lean()) ??
      (await this.notificationModel
        .findOneAndUpdate(
          this.asFilter({ _id: notificationId, recipient_role: { $in: [role, String(role)] } }),
          { $addToSet: { read_by: new Types.ObjectId(userId) } },
          { returnDocument: 'after' },
        )
        .lean());
    if (!updated) {
      throw new AppException(
        NOTIFICATION_ERROR_CODES.NOT_FOUND,
        `Không tìm thấy thông báo với id "${notificationId}".`,
        HttpStatus.NOT_FOUND,
        { notificationId },
      );
    }
    return toNotificationView(updated, userId);
  }

  /** (09/10/2026) Đánh dấu tất cả thông báo của người gọi là đã đọc. Trả số dòng đã đổi. */
  async markAllAsRead(userId: string, role: UserRole): Promise<number> {
    const [direct, byRole] = await Promise.all([
      this.notificationModel.updateMany(this.asFilter({ recipient_user_id: userId, is_read: false }), {
        $set: { is_read: true },
      }),
      this.notificationModel.updateMany(
        this.asFilter({ recipient_role: { $in: [role, String(role)] }, is_read: false, read_by: { $ne: userId } }),
        { $addToSet: { read_by: new Types.ObjectId(userId) } },
      ),
    ]);
    return direct.modifiedCount + byRole.modifiedCount;
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

  /**
   * MỚI (29/09/2026, N1) — toàn bộ đơn trong 1 nhóm đã chuyển sang trạng
   * thái không còn fulfill được (khách tự hủy qua webhook, hàng thất lạc...)
   * — hệ thống tự động hủy nhóm và nhả giữ chỗ đóng gói, báo lại để nhân
   * viên biết không cần xử lý nhóm này nữa.
   */
  buildGroupAutoCanceledMessage(params: {
    groupId: string;
  }): { title: string; message: string } {
    return {
      title: `Đơn hàng #${params.groupId} đã bị hủy`,
      message: `Toàn bộ đơn thuộc nhóm #${params.groupId} đã chuyển sang trạng thái không còn xử lý được (khách hủy đơn hoặc sự cố vận chuyển). Hệ thống đã tự động hủy nhóm và nhả các chỗ giữ đóng gói liên quan — không cần tiếp tục xử lý đơn này.`,
    };
  }

  buildPackagingPlanInvalidatedMessage(params: { groupId: string }): {
    title: string;
    message: string;
  } {
    return {
      title: `Phương án đóng gói của nhóm #${params.groupId} không còn hiệu lực`,
      message: `Có đơn trong nhóm #${params.groupId} vừa bị hủy hoặc gặp sự cố sau khi đã tính phương án đóng gói. Hệ thống đã vô hiệu hóa phương án cũ và đưa nhóm về trạng thái đã lấy hàng để tính lại. Hàng đã lấy cho đơn bị hủy cần được đối soát và nhập lại kho thủ công.`,
    };
  }

  buildReturnReceivedMessage(params: {
    groupId: string;
    goodUnits: number;
    damagedUnits: number;
  }): { title: string; message: string } {
    const damaged =
      params.damagedUnits > 0
        ? ` Có ${String(params.damagedUnits)} sản phẩm hư hỏng, không được nhập lại tồn kho.`
        : '';
    return {
      title: `Đã nhận hàng hoàn của nhóm #${params.groupId}`,
      message: `Kho đã nhận hàng hoàn của nhóm #${params.groupId}: ${String(params.goodUnits)} sản phẩm đạt chất lượng đã nhập lại tồn kho.${damaged}`,
    };
  }

  buildMfaDisabledMessage(params: { name: string }): { title: string; message: string } {
    return {
      title: 'Xác thực 2 lớp (MFA) đã được tắt',
      message: `Chào ${params.name}, Quản trị viên vừa tắt xác thực 2 lớp trên tài khoản của bạn. Lần đăng nhập tiếp theo sẽ không yêu cầu mã xác thực. Nếu bạn vẫn dùng được ứng dụng Authenticator, hãy vào Hồ sơ để thiết lập lại. Nếu không phải bạn yêu cầu, liên hệ Quản trị viên ngay.`,
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

  buildPackagingRejectedMessage(params: {
    groupId: string;
    reason: string;
  }): { title: string; message: string } {
    return {
      title: `Gợi ý đóng gói bị từ chối — Đơn hàng #${params.groupId}`,
      message: `Packaging Staff đã từ chối gợi ý đóng gói hiện tại của đơn hàng #${params.groupId}. Lý do: "${params.reason}". Hàng vẫn giữ nguyên đã lấy — cần xử lý trong hệ thống: tính lại, đóng gói thủ công hoặc trả về lấy hàng.`,
    };
  }
}
