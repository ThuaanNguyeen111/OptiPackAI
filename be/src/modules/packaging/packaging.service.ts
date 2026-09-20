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
    // BỎ (20/09/2026) — staffAssignmentService KHÔNG còn cần ở đây,
    // auto-assign đã dời sang order-groups.service.ts (startPickingPhase()),
    // chạy ngay lúc tạo group thay vì lúc Approve/Adjust.
  ) {}

  async generateFallbackRecommendation(
    groupId: string,
  ): Promise<PackagingRecommendationDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    // ĐỔI NGUỒN (20/09/2026, đảo luồng theo yêu cầu Thuận) — trước đây
    // dùng getPackableItemsForGroup() (theo số lượng ĐẶT). Giờ dùng
    // getActuallyPickedItemsForGroup() (theo số lượng THẬT đã quét,
    // pick_events) — vì generate() giờ CHỈ gọi được sau khi group đã
    // PICKED (đã lấy hàng xong), phải tính đúng theo hàng THẬT đang có
    // trong tay, không phải số lượng đặt ban đầu (nếu thiếu hàng, tính
    // theo số đặt sẽ ra thùng to hơn thực tế cần — sai logic).
    const { items } =
      await this.orderGroupsService.getActuallyPickedItemsForGroup(groupId);

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

    this.logger.log(
      `Đã tạo PackagingRecommendation (fallback) cho group ${groupId}.`,
    );
    return recommendation;
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

    // ĐỔI NGUỒN (20/09/2026) — cùng lý do đã ghi ở generateFallbackRecommendation():
    // so sánh cân THẬT với ước tính theo số lượng ĐÃ QUÉT, không phải
    // số lượng đặt ban đầu — nếu không, phát hiện "bất thường" (is_abnormal)
    // sẽ sai lệch giả tạo khi group là partial-pick (thiếu hàng, duyệt tiếp).
    const { items } =
      await this.orderGroupsService.getActuallyPickedItemsForGroup(groupId);
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

    // ĐỔI NGUỒN (20/09/2026) — cùng lý do đã ghi ở approve()/generateFallbackRecommendation().
    const { items } =
      await this.orderGroupsService.getActuallyPickedItemsForGroup(groupId);
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

    this.logger.log(
      `Reject recommendation cho group ${groupId} — group quay lại PICKED, chờ tính lại gợi ý (không cần lấy lại hàng).`,
    );
    return {
      message:
        'Đã từ chối gợi ý đóng gói — hàng vẫn giữ nguyên đã lấy, chờ tính lại gợi ý mới.',
    };
  }
}
