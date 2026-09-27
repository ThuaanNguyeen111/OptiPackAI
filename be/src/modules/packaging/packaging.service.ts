import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationDocument,
} from './schemas/packaging-recommendation.schema';
import { PackagingApprovalStatus } from './enums/packaging-approval-status.enum';
import { computeFallbackPackaging } from './utils/fallback-packaging.util';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import {
  OrderGroup,
  OrderGroupDocument,
} from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from '../order-groups/order-groups.errors';
import { AdjustPackagingDto } from './dto/adjust-packaging.dto';
import { PackableItem } from '../../common/interfaces/packaging.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

const ABNORMAL_WEIGHT_DEVIATION_THRESHOLD = 0.2; // 20% — đúng ngưỡng đã thống nhất khi nghiên cứu Actor (mục "Detect abnormal packages")

/**
 * ===================================================================
 * packaging.service.ts — MỚI (2026-09-09)
 * ===================================================================
 * generateFallbackRecommendation(): tạo PackagingRecommendation bằng
 * thuật toán fallback (KHÔNG phải AI thật — Package 3, thành viên
 * khác) — dùng để MỞ KHÓA test UC-04 + 5 endpoint fulfillment ngay,
 * không cần chờ AI thật xong.
 *
 * approve()/adjust()/reject(): UC-04 (Report 1) — MỖI hành động ghi
 * ĐỒNG THỜI 2 collection (packaging_recommendations + order_groups) ->
 * BẮT BUỘC transaction (Rule #6, CLAUDE.md) — đã xác nhận an toàn vì
 * project dùng MongoDB Atlas (luôn là replica set, xem CLAUDE.md mục
 * "ĐÃ XÁC NHẬN" trước đó).
 * ===================================================================
 */
@Injectable()
export class PackagingService {
  private readonly logger = new Logger(PackagingService.name);

  constructor(
    @InjectModel(PackagingRecommendationDoc.name)
    private readonly recommendationModel: Model<PackagingRecommendationDocument>,
    @InjectModel(OrderGroup.name)
    private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly notificationsService: NotificationsService,
    // BỎ (20/09/2026) — staffAssignmentService KHÔNG còn cần ở đây,
    // auto-assign đã dời sang order-groups.service.ts (startPickingPhase()),
    // chạy ngay lúc tạo group thay vì lúc Approve/Adjust.
  ) {}

  async generateFallbackRecommendation(
    groupId: string,
  ): Promise<PackagingRecommendationDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    // SỬA GẤP (21/09/2026, báo cáo thật từ FE — bug do CHÍNH mình tạo ra
    // ở đợt đảo luồng 20/09) — getActuallyPickedItemsForGroup() throw lỗi
    // nếu KHÔNG có pick_events nào — nhưng pick() (xác nhận hàng loạt)
    // KHÔNG bắt buộc phải quét từng SKU qua pick-item trước! Warehouse
    // Staff hoàn toàn có thể bấm "Đã lấy xong" hàng loạt mà chưa từng
    // quét gì — lúc đó generate() sẽ LUÔN LUÔN lỗi 409, chặn đứng cả
    // luồng đóng gói. Fix: fallback về getPackableItemsForGroup() (theo
    // đơn ĐẶT — vẫn đúng hướng "packable", chỉ kém chính xác hơn số
    // lượng THẬT đã quét) khi không có pick_events, thay vì throw cứng.
    const items = await this.resolveItemsForPackaging(groupId);

    const result = computeFallbackPackaging(items);

    await this.recommendationModel.updateMany(
      { order_group_id: group._id, is_active: true },
      { $set: { is_active: false } },
    );

    const recommendation = await this.recommendationModel.create({
      order_group_id: group._id,
      box_size: result.box_size,
      material_type: result.material_type,
      material_quantity: result.material_quantity,
      estimated_shipping_cost_vnd: result.estimated_shipping_cost_vnd,
      computation_time_ms: result.computation_time_ms,
      fallback_used: result.fallback_used,
      approval_status: PackagingApprovalStatus.PENDING,
      is_active: true,
    });

    await this.orderGroupsService.transitionFulfillmentStatus(
      groupId,
      GroupFulfillmentStatus.PENDING_APPROVAL,
      group.__v,
    );

    // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — notify Packaging Staff
    // biết có kế hoạch mới chờ duyệt. try/catch RIÊNG (best-effort) —
    // lỗi gửi thông báo KHÔNG được làm generate() thất bại.
    try {
      const boxSummary = `thùng ${String(result.box_size.length_cm)}x${String(result.box_size.width_cm)}x${String(result.box_size.height_cm)}cm, vật liệu ${result.material_type}`;
      const { title, message } =
        this.notificationsService.buildPendingPackagingPlanMessage({
          groupId,
          boxSummary,
        });
      await this.notificationsService.notify({
        recipientRole: UserRole.PACKAGING_STAFF,
        type: NotificationType.PENDING_APPROVAL,
        severity: 'info',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    } catch (error) {
      this.logger.warn(
        `Gửi thông báo generate() thất bại cho group ${groupId} — generate() vẫn thành công.`,
        error,
      );
    }

    this.logger.log(
      `Đã tạo PackagingRecommendation (fallback) cho group ${groupId}.`,
    );
    return recommendation;
  }

  /**
   * BỔ SUNG (21/09/2026, sửa gấp — báo cáo thật từ FE, xác nhận đúng bug
   * do chính mình tạo ra ở đợt đảo luồng 20/09/2026) — dùng CHUNG cho cả
   * generate/approve/adjust: ưu tiên tính theo số lượng THẬT đã quét
   * (pick_events, chính xác hơn — quan trọng khi có partial-pick), nhưng
   * KHÔNG BAO GIỜ chặn cứng nếu không có pick_events nào (Warehouse Staff
   * có quyền xác nhận "đã lấy xong" HÀNG LOẠT qua pick(), không bắt buộc
   * phải quét từng SKU qua pick-item trước — pick_events rỗng là tình
   * huống HỢP LỆ, không phải lỗi dữ liệu). Fallback về số lượng ĐẶT
   * (getPackableItemsForGroup — đã lọc sẵn đơn canceled/sự cố logistics)
   * khi thiếu pick_events — kém chính xác hơn 1 chút trong case
   * partial-pick, nhưng KHÔNG BAO GIỜ chặn đứng luồng đóng gói.
   */
  private async resolveItemsForPackaging(
    groupId: string,
  ): Promise<PackableItem[]> {
    try {
      const { items } =
        await this.orderGroupsService.getActuallyPickedItemsForGroup(groupId);
      return items;
    } catch (error: unknown) {
      const isNoPickEvents =
        error instanceof AppException &&
        error.errorCode === ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED;
      if (!isNoPickEvents) {
        throw error; // lỗi KHÁC (VD group không tồn tại) — ném lại nguyên vẹn, không nuốt lỗi thật
      }
      this.logger.warn(
        `Group ${groupId} chưa có pick_events nào (Warehouse xác nhận hàng loạt, không quét từng SKU) — fallback tính theo số lượng ĐẶT.`,
      );
      const { items } =
        await this.orderGroupsService.getPackableItemsForGroup(groupId);
      return items;
    }
  }

  private async findActiveRecommendationForGroup(
    groupId: string,
  ): Promise<PackagingRecommendationDocument> {
    const recommendation = await this.getActiveRecommendationOrNull(groupId);
    if (!recommendation) {
      throw new AppException(
        PACKAGING_ERROR_CODES.NO_ACTIVE_RECOMMENDATION,
        `Order Group "${groupId}" chưa có gợi ý đóng gói nào đang chờ duyệt.`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    if (recommendation.approval_status !== PackagingApprovalStatus.PENDING) {
      throw new AppException(
        PACKAGING_ERROR_CODES.ALREADY_DECIDED,
        `Gợi ý đóng gói này đã được quyết định (${recommendation.approval_status}) trước đó.`,
        HttpStatus.CONFLICT,
        { groupId, currentStatus: recommendation.approval_status },
      );
    }
    return recommendation;
  }

  /**
   * MỚI (2026-09-09, việc 2) — trả recommendation active BẤT KỂ
   * approval_status (khác findActiveRecommendationForGroup() chỉ chấp
   * nhận PENDING) — dùng cho GET /order-groups/:id/packaging, FE cần
   * xem chi tiết (box_size, material, cân thật, is_abnormal) dù đã
   * Approve/Adjust rồi, không chỉ lúc còn chờ duyệt. Trả null thay vì
   * throw khi chưa có recommendation nào — để Controller tự quyết định
   * trả 404 hay object rỗng tùy ngữ cảnh.
   */
  async getActiveRecommendationOrNull(
    groupId: string,
  ): Promise<PackagingRecommendationDocument | null> {
    if (!Types.ObjectId.isValid(groupId)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_RECOMMENDATION_ID,
        `"${groupId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { groupId },
      );
    }
    return this.recommendationModel.findOne({
      order_group_id: new Types.ObjectId(groupId),
      is_active: true,
    });
  }

  private detectAbnormal(
    estimatedWeightKg: number,
    actualWeightKg: number,
  ): boolean {
    if (estimatedWeightKg <= 0) return false;
    const deviation =
      Math.abs(actualWeightKg - estimatedWeightKg) / estimatedWeightKg;
    return deviation > ABNORMAL_WEIGHT_DEVIATION_THRESHOLD;
  }

  async approve(
    groupId: string,
    userId: string,
    actualMeasuredWeightKg: number,
    expectedGroupVersion: number,
  ): Promise<PackagingRecommendationDocument> {
    const recommendation = await this.findActiveRecommendationForGroup(groupId);

    // SỬA GẤP (21/09/2026) — cùng lý do đã ghi ở generateFallbackRecommendation() (fallback khi thiếu pick_events).
    const items = await this.resolveItemsForPackaging(groupId);
    const estimatedWeightKg = items.reduce(
      (sum, i) => sum + i.weight_kg * i.quantity,
      0,
    );
    const isAbnormal = this.detectAbnormal(
      estimatedWeightKg,
      actualMeasuredWeightKg,
    );

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.recommendationModel.updateOne(
          { _id: recommendation._id },
          {
            $set: {
              approval_status: PackagingApprovalStatus.APPROVED,
              approved_by: new Types.ObjectId(userId),
              approved_at: new Date(),
              actual_measured_weight_kg: actualMeasuredWeightKg,
              is_abnormal: isAbnormal,
            },
          },
          { session },
        );

        const updatedGroup = await this.orderGroupModel.findOneAndUpdate(
          { _id: groupId, __v: expectedGroupVersion },
          {
            $set: {
              fulfillment_status: GroupFulfillmentStatus.APPROVED_FOR_PACKING,
            },
            $inc: { __v: 1 },
          },
          { session, returnDocument: 'after' },
        );

        if (!updatedGroup) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
            `Order Group đã bị thay đổi bởi thao tác khác — vui lòng tải lại dữ liệu mới nhất rồi thử lại.`,
            HttpStatus.CONFLICT,
            { groupId, expectedGroupVersion },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    // ĐÃ CHUYỂN (20/09/2026, đảo luồng) — auto-assign Warehouse Staff
    // giờ chạy NGAY LÚC TẠO GROUP (order-groups.service.ts, hàm
    // startPickingPhase()), KHÔNG còn ở đây nữa — Approve xảy ra SAU
    // khi đã lấy hàng xong, gán ở bước này là quá muộn (Warehouse Staff
    // đã lấy hàng xong từ trước rồi).

    if (isAbnormal) {
      this.logger.warn(
        `Package BẤT THƯỜNG: group ${groupId} — cân ước tính ${String(estimatedWeightKg)}kg, cân thật ${String(actualMeasuredWeightKg)}kg (lệch >${String(ABNORMAL_WEIGHT_DEVIATION_THRESHOLD * 100)}%).`,
      );
    }

    const result = await this.recommendationModel.findById(recommendation._id);
    if (!result) {
      throw new AppException(
        PACKAGING_ERROR_CODES.RECOMMENDATION_NOT_FOUND,
        `Không tìm thấy recommendation sau khi cập nhật.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        { groupId },
      );
    }
    return result;
  }

  async adjust(
    groupId: string,
    userId: string,
    dto: AdjustPackagingDto,
  ): Promise<PackagingRecommendationDocument> {
    const recommendation = await this.findActiveRecommendationForGroup(groupId);

    // SỬA GẤP (21/09/2026) — cùng lý do đã ghi ở approve()/generateFallbackRecommendation().
    const items = await this.resolveItemsForPackaging(groupId);
    const estimatedWeightKg = items.reduce(
      (sum, i) => sum + i.weight_kg * i.quantity,
      0,
    );
    const isAbnormal = this.detectAbnormal(
      estimatedWeightKg,
      dto.actual_measured_weight_kg,
    );

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.recommendationModel.updateOne(
          { _id: recommendation._id },
          {
            $set: {
              approval_status: PackagingApprovalStatus.ADJUSTED,
              box_size: dto.box_size,
              material_type: dto.material_type,
              approved_by: new Types.ObjectId(userId),
              approved_at: new Date(),
              actual_measured_weight_kg: dto.actual_measured_weight_kg,
              is_abnormal: isAbnormal,
            },
          },
          { session },
        );

        const updatedGroup = await this.orderGroupModel.findOneAndUpdate(
          { _id: groupId, __v: dto.expected_group_version },
          {
            $set: {
              fulfillment_status: GroupFulfillmentStatus.APPROVED_FOR_PACKING,
            },
            $inc: { __v: 1 },
          },
          { session, returnDocument: 'after' },
        );

        if (!updatedGroup) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
            `Order Group đã bị thay đổi bởi thao tác khác — vui lòng tải lại dữ liệu mới nhất rồi thử lại.`,
            HttpStatus.CONFLICT,
            { groupId, expectedVersion: dto.expected_group_version },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    // ĐÃ CHUYỂN (20/09/2026, đảo luồng) — xem giải thích đầy đủ ở approve().

    const result = await this.recommendationModel.findById(recommendation._id);
    if (!result) {
      throw new AppException(
        PACKAGING_ERROR_CODES.RECOMMENDATION_NOT_FOUND,
        `Không tìm thấy recommendation sau khi cập nhật.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        { groupId },
      );
    }
    return result;
  }

  async reject(
    groupId: string,
    expectedGroupVersion: number,
    rejectionReason: string,
  ): Promise<{ message: string }> {
    const recommendation = await this.findActiveRecommendationForGroup(groupId);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.recommendationModel.updateOne(
          { _id: recommendation._id },
          {
            $set: {
              approval_status: PackagingApprovalStatus.REJECTED,
              is_active: false,
              // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — lưu lý do
              // ngay trên bản ghi bị reject, trước khi is_active tắt.
              rejection_reason: rejectionReason,
            },
          },
          { session },
        );

        const updatedGroup = await this.orderGroupModel.findOneAndUpdate(
          { _id: groupId, __v: expectedGroupVersion },
          // ĐỔI ĐÍCH (20/09/2026, đảo luồng) — quay về PICKED, KHÔNG
          // phải AWAITING_PACKAGING như bản cũ. Hàng ĐÃ lấy xong rồi —
          // Reject chỉ có nghĩa "gợi ý đóng gói tính sai/chưa phù hợp",
          // KHÔNG có nghĩa "lấy sai hàng". Không cần lấy lại, chỉ cần
          // tính lại gợi ý (generate() gọi lại được ngay từ PICKED).
          {
            $set: { fulfillment_status: GroupFulfillmentStatus.PICKED },
            $inc: { __v: 1 },
          },
          { session, returnDocument: 'after' },
        );

        if (!updatedGroup) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
            `Order Group đã bị thay đổi bởi thao tác khác — vui lòng tải lại dữ liệu mới nhất rồi thử lại.`,
            HttpStatus.CONFLICT,
            { groupId, expectedGroupVersion },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — notify Admin biết lý
    // do bị từ chối. try/catch RIÊNG (best-effort) — lỗi gửi thông báo
    // KHÔNG được làm Reject thất bại, transaction chính đã xong.
    try {
      const { title, message } =
        this.notificationsService.buildPackagingRejectedMessage({
          groupId,
          reason: rejectionReason,
        });
      await this.notificationsService.notify({
        recipientRole: UserRole.ADMIN,
        type: NotificationType.PACKAGING_REJECTED,
        severity: 'warning',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    } catch (error) {
      this.logger.warn(
        `Gửi thông báo Reject thất bại cho group ${groupId} — Reject vẫn thành công.`,
        error,
      );
    }

    this.logger.log(
      `Reject recommendation cho group ${groupId} — group quay lại PICKED, chờ tính lại gợi ý (không cần lấy lại hàng).`,
    );
    return {
      message:
        'Đã từ chối gợi ý đóng gói — hàng vẫn giữ nguyên đã lấy, chờ tính lại gợi ý mới.',
    };
  }
}
