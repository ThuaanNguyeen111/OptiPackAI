import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationDocument,
} from './schemas/packaging-recommendation.schema';
import { PackagingApprovalStatus } from './enums/packaging-approval-status.enum';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { OrderGroup, OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { isValidStatusTransition } from '../order-groups/enums/allowed-status-transitions';
import { ORD_GROUP_ERROR_CODES } from '../order-groups/order-groups.errors';
import { AdjustPackagingDto } from './dto/adjust-packaging.dto';
import { PackGroupDto } from './dto/pack-group.dto';
import { PackagingBoxService } from './packaging-box.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  buildOk,
  expandToUnits,
  packIntoBox,
  packOrder,
  validateCandidate,
  type PackResult,
} from './engine';

const ABNORMAL_WEIGHT_DEVIATION_THRESHOLD = 0.2; // 20% — ngưỡng khởi đầu, cần hiệu chỉnh bằng dữ liệu thật
const ENGINE_VERSION = 'greedy-3d-v1';

/**
 * ===================================================================
 * packaging.service.ts — UC-03/UC-04
 * ===================================================================
 * 🔄 ĐÃ ĐỔI (21/09/2026, BE-3a/BE-4a):
 *  - MỖI ĐƠN MỘT KIỆN: generate chia hàng ĐÃ QUÉT về từng đơn nguồn rồi
 *    chạy engine greedy 3D + validator cho từng đơn (thay fallback chỉ
 *    so tổng thể tích). Không thùng nào hợp lệ → `no_fit`, KHÔNG trả
 *    thùng lớn nhất.
 *  - approve/adjust/reject áp cho toàn bộ phương án của group; chuyển
 *    trạng thái đi qua isValidStatusTransition(), ghi trong transaction.
 *  - Cân kiện thật chuyển sang pack(): so với hàng + bì (+ vật tư).
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
    private readonly boxService: PackagingBoxService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Tính phương án cho từng đơn trong group (group phải đang `picked`).
   * Vẫn gắn @Roles(ADMIN) ở controller — trigger tự động là BE-5.
   */
  async generateRecommendations(groupId: string): Promise<PackagingRecommendationDocument[]> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    this.assertTransition(group, GroupFulfillmentStatus.PENDING_APPROVAL);

    const allocations = await this.orderGroupsService.allocatePickedItemsToOrders(groupId);
    const boxes = await this.boxService.listActiveSpecs();

    const planned = allocations.map((allocation) => ({
      allocation,
      result: packOrder(expandToUnits(allocation.items), boxes),
    }));
    const docs = planned.map(({ allocation, result }) => ({
      order_group_id: group._id,
      order_id: new Types.ObjectId(allocation.order_id),
      platform_order_id: allocation.platform_order_id,
      ...this.resultToFields(result),
      approval_status: PackagingApprovalStatus.PENDING,
      is_active: true,
    }));

    await this.runInTransaction(async (session) => {
      await this.recommendationModel.updateMany(
        { order_group_id: group._id, is_active: true },
        { $set: { is_active: false } },
        { session },
      );
      await this.recommendationModel.insertMany(docs, { session });
      await this.transitionGroup(
        groupId,
        group.__v,
        GroupFulfillmentStatus.PENDING_APPROVAL,
        session,
      );
    });

    const noFit = planned.filter((p) => p.result.status === 'no_fit').length;
    this.logger.log(
      `Tạo ${String(docs.length)} phương án đóng gói (engine ${ENGINE_VERSION}) cho group ${groupId}; ${String(noFit)} đơn no_fit.`,
    );
    return this.listActiveRecommendations(groupId);
  }

  async listActiveRecommendations(groupId: string): Promise<PackagingRecommendationDocument[]> {
    this.assertObjectId(groupId);
    return this.recommendationModel
      .find({ order_group_id: new Types.ObjectId(groupId), is_active: true })
      .sort({ created_at: 1, _id: 1 });
  }

  async approve(
    groupId: string,
    userId: string,
    expectedGroupVersion: number,
  ): Promise<PackagingRecommendationDocument[]> {
    const recommendations = await this.getPendingRecommendations(groupId);
    const noFit = recommendations.filter((r) => r.solution_status === 'no_fit');
    if (noFit.length > 0) {
      throw new AppException(
        PACKAGING_ERROR_CODES.HAS_NO_FIT,
        `Còn ${String(noFit.length)} đơn chưa có thùng hợp lệ — dùng adjust chọn thùng khác, hoặc reject để tính lại.`,
        HttpStatus.CONFLICT,
        { groupId, orderIds: noFit.map((r) => r.order_id?.toString() ?? null) },
      );
    }

    const now = new Date();
    const approvedBy = new Types.ObjectId(userId);
    await this.runInTransaction(async (session) => {
      const ids = recommendations.map((r) => r._id);
      // Đơn đã đổi thùng giữ dấu ADJUSTED, còn lại APPROVED.
      await this.recommendationModel.updateMany(
        { _id: { $in: ids }, adjustment_reason: { $ne: null } },
        { $set: { approval_status: PackagingApprovalStatus.ADJUSTED, approved_by: approvedBy, approved_at: now } },
        { session },
      );
      await this.recommendationModel.updateMany(
        { _id: { $in: ids }, adjustment_reason: null },
        { $set: { approval_status: PackagingApprovalStatus.APPROVED, approved_by: approvedBy, approved_at: now } },
        { session },
      );
      await this.transitionGroup(
        groupId,
        expectedGroupVersion,
        GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        session,
      );
    });
    return this.listActiveRecommendations(groupId);
  }

  /**
   * Đổi thùng cho MỘT đơn: engine xếp lại vào đúng thùng đã chọn, phải
   * qua validator (không nhận kích thước tùy ý). Group vẫn chờ approve.
   */
  async adjust(
    groupId: string,
    userId: string,
    dto: AdjustPackagingDto,
  ): Promise<PackagingRecommendationDocument[]> {
    if (dto.adjustment_reason === 'OTHER' && !dto.adjustment_note?.trim()) {
      throw new AppException(
        PACKAGING_ERROR_CODES.ADJUSTMENT_NOTE_REQUIRED,
        'Chọn lý do "Khác" thì phải ghi chú cụ thể.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    if (
      group.fulfillment_status !== GroupFulfillmentStatus.PENDING_APPROVAL ||
      group.__v !== dto.expected_group_version
    ) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
        'Order Group đã bị thay đổi hoặc không còn chờ duyệt — tải lại dữ liệu rồi thử lại.',
        HttpStatus.CONFLICT,
        { groupId, expectedVersion: dto.expected_group_version },
      );
    }

    const recommendation = await this.recommendationModel.findOne({
      order_group_id: group._id,
      order_id: new Types.ObjectId(dto.order_id),
      is_active: true,
    });
    if (!recommendation) {
      throw new AppException(
        PACKAGING_ERROR_CODES.ORDER_NOT_IN_PLAN,
        `Đơn "${dto.order_id}" không có phương án đóng gói đang hoạt động trong group này.`,
        HttpStatus.NOT_FOUND,
        { groupId, orderId: dto.order_id },
      );
    }
    this.assertPending(recommendation);

    const box = await this.boxService.findActiveSpecByCode(dto.box_code);
    const allocation = (await this.orderGroupsService.allocatePickedItemsToOrders(groupId)).find(
      (a) => a.order_id === dto.order_id,
    );
    if (!allocation) {
      throw new AppException(
        PACKAGING_ERROR_CODES.ORDER_NOT_IN_PLAN,
        `Đơn "${dto.order_id}" không còn hàng đã lấy để đóng gói.`,
        HttpStatus.CONFLICT,
        { groupId, orderId: dto.order_id },
      );
    }

    const startedAt = Date.now();
    const units = expandToUnits(allocation.items);
    const placements = packIntoBox(units, box);
    const violations = placements ? validateCandidate(units, box, placements) : [];
    if (!placements || violations.length > 0) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BOX_DOES_NOT_FIT,
        `Thùng "${box.code}" không xếp vừa hàng của đơn này.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { boxCode: box.code, violations: violations.map((v) => v.message) },
      );
    }
    const result = buildOk(units, box, placements, Date.now() - startedAt);

    const updated = await this.recommendationModel.updateOne(
      { _id: recommendation._id, is_active: true, approval_status: PackagingApprovalStatus.PENDING },
      {
        $set: {
          ...this.resultToFields(result),
          adjustment_reason: dto.adjustment_reason,
          adjustment_note: dto.adjustment_note?.trim() ?? null,
          adjusted_from_box_code: recommendation.box_code,
          adjusted_by: new Types.ObjectId(userId),
        },
      },
    );
    if (updated.matchedCount === 0) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
        'Phương án vừa được người khác quyết định — tải lại dữ liệu.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    return this.listActiveRecommendations(groupId);
  }

  async reject(groupId: string, expectedGroupVersion: number): Promise<{ message: string }> {
    const recommendations = await this.getPendingRecommendations(groupId);

    await this.runInTransaction(async (session) => {
      await this.recommendationModel.updateMany(
        { _id: { $in: recommendations.map((r) => r._id) } },
        { $set: { approval_status: PackagingApprovalStatus.REJECTED, is_active: false } },
        { session },
      );
      // Hàng ĐÃ lấy xong — reject chỉ nghĩa là phương án chưa phù hợp;
      // quay về PICKED để generate lại, không cần lấy lại hàng.
      await this.transitionGroup(groupId, expectedGroupVersion, GroupFulfillmentStatus.PICKED, session);
    });

    this.logger.log(`Reject phương án đóng gói group ${groupId} — quay lại picked, chờ tính lại.`);
    return {
      message: 'Đã từ chối gợi ý đóng gói — hàng vẫn giữ nguyên đã lấy, chờ tính lại gợi ý mới.',
    };
  }

  /**
   * MỚI (21/09/2026, BE-4a) — "Đã đóng xong": ghi cân THẬT từng kiện, so
   * với cân ước tính (hàng + bì + vật tư đã biết), lệch > 20% đánh dấu
   * bất thường + thông báo Store Owner; group → packed trong transaction.
   */
  async pack(
    groupId: string,
    userId: string,
    dto: PackGroupDto,
  ): Promise<{ fulfillmentStatus: GroupFulfillmentStatus; version: number; recommendations: PackagingRecommendationDocument[] }> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    this.assertTransition(group, GroupFulfillmentStatus.PACKED);

    const recommendations = await this.listActiveRecommendations(groupId);
    const decided = recommendations.filter(
      (r) =>
        r.approval_status === PackagingApprovalStatus.APPROVED ||
        r.approval_status === PackagingApprovalStatus.ADJUSTED,
    );
    const weights = this.matchPackagesToRecommendations(groupId, decided, dto);

    const now = new Date();
    const abnormal = decided
      .map((rec) => ({ rec, actualKg: weights.get(rec._id.toString()) ?? 0 }))
      .filter(({ rec, actualKg }) => this.isAbnormal(rec.estimated_package_weight_g, actualKg));
    const abnormalIds = new Set(abnormal.map(({ rec }) => rec._id.toString()));

    const updatedGroup = await this.runInTransaction(async (session) => {
      for (const rec of decided) {
        const actualKg = weights.get(rec._id.toString()) ?? 0;
        const isAbnormal = abnormalIds.has(rec._id.toString());
        await this.recommendationModel.updateOne(
          { _id: rec._id },
          {
            $set: {
              actual_measured_weight_kg: actualKg,
              is_abnormal: isAbnormal,
              packed_at: now,
              packed_by: new Types.ObjectId(userId),
            },
          },
          { session },
        );
      }
      return this.transitionGroup(groupId, dto.expected_version, GroupFulfillmentStatus.PACKED, session);
    });

    for (const { rec, actualKg } of abnormal) {
      await this.notifyAbnormal(groupId, rec, actualKg);
    }

    return {
      fulfillmentStatus: updatedGroup.fulfillment_status,
      version: updatedGroup.__v,
      recommendations: await this.listActiveRecommendations(groupId),
    };
  }

  // ------------------------------------------------------------------

  private resultToFields(result: PackResult): Record<string, unknown> {
    if (result.status === 'no_fit') {
      return {
        solution_status: 'no_fit',
        no_fit_reasons: result.reasons,
        box_code: null,
        box_name: null,
        box_size: null,
        box_inner_mm: null,
        box_outer_mm: null,
        placements: [],
        materials: [],
        material_type: 'none',
        material_quantity: 0,
        estimated_shipping_cost_vnd: null,
        items_weight_g: null,
        estimated_package_weight_g: null,
        volumetric_weight_g: null,
        fill_ratio: null,
        computation_time_ms: result.computation_time_ms,
        engine_version: ENGINE_VERSION,
        fallback_used: false,
      };
    }
    const bubble = result.materials.reduce((sum, m) => sum + m.quantity, 0);
    const { inner, outer } = result.box;
    return {
      solution_status: 'ok',
      no_fit_reasons: [],
      box_code: result.box.code,
      box_name: result.box.name,
      box_size: {
        length_cm: inner.length_mm / 10,
        width_cm: inner.width_mm / 10,
        height_cm: inner.height_mm / 10,
      },
      box_inner_mm: inner,
      box_outer_mm: outer,
      placements: result.placements,
      materials: result.materials,
      material_type: bubble > 0 ? 'Bubble Wrap' : 'none',
      material_quantity: bubble,
      // Chưa có bảng cước thật → null (không bịa đơn giá/kg).
      estimated_shipping_cost_vnd: null,
      items_weight_g: result.items_weight_g,
      estimated_package_weight_g: result.estimated_package_weight_g,
      volumetric_weight_g: result.volumetric_weight_g,
      fill_ratio: result.fill_ratio,
      computation_time_ms: result.computation_time_ms,
      engine_version: ENGINE_VERSION,
      fallback_used: false,
    };
  }

  private async getPendingRecommendations(groupId: string): Promise<PackagingRecommendationDocument[]> {
    const recommendations = await this.listActiveRecommendations(groupId);
    if (recommendations.length === 0) {
      throw new AppException(
        PACKAGING_ERROR_CODES.NO_ACTIVE_RECOMMENDATION,
        `Order Group "${groupId}" chưa có gợi ý đóng gói nào đang chờ duyệt.`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    recommendations.forEach((r) => {
      this.assertPending(r);
    });
    return recommendations;
  }

  private assertPending(recommendation: PackagingRecommendationDocument): void {
    if (recommendation.approval_status !== PackagingApprovalStatus.PENDING) {
      throw new AppException(
        PACKAGING_ERROR_CODES.ALREADY_DECIDED,
        `Gợi ý đóng gói này đã được quyết định (${recommendation.approval_status}) trước đó.`,
        HttpStatus.CONFLICT,
        { currentStatus: recommendation.approval_status },
      );
    }
  }

  /** Danh sách cân phải khớp ĐÚNG các kiện (mỗi đơn đúng 1 lần). */
  private matchPackagesToRecommendations(
    groupId: string,
    decided: PackagingRecommendationDocument[],
    dto: PackGroupDto,
  ): Map<string, number> {
    const weights = new Map<string, number>();
    const mismatch = (reason: string): AppException =>
      new AppException(PACKAGING_ERROR_CODES.PACK_PACKAGES_MISMATCH, reason, HttpStatus.BAD_REQUEST, {
        groupId,
        expectedOrderIds: decided.map((r) => r.order_id?.toString() ?? null),
      });

    if (decided.length === 0) {
      throw new AppException(
        PACKAGING_ERROR_CODES.NO_ACTIVE_RECOMMENDATION,
        `Order Group "${groupId}" chưa có phương án đóng gói đã duyệt.`,
        HttpStatus.CONFLICT,
        { groupId },
      );
    }

    // Bản legacy (trước 21/09): 1 phương án/group, không có order_id.
    const legacy = decided.length === 1 && decided[0]?.order_id === null ? decided[0] : undefined;
    if (legacy) {
      const [only] = dto.packages;
      if (dto.packages.length !== 1 || !only) throw mismatch('Group này có đúng 1 kiện — gửi đúng 1 cân nặng.');
      weights.set(legacy._id.toString(), only.actual_weight_kg);
      return weights;
    }

    const byOrder = new Map(decided.map((r) => [r.order_id?.toString() ?? '', r]));
    for (const pkg of dto.packages) {
      const rec = byOrder.get(pkg.order_id);
      if (!rec) throw mismatch(`Đơn "${pkg.order_id}" không có kiện đã duyệt trong group này.`);
      if (weights.has(rec._id.toString())) throw mismatch(`Đơn "${pkg.order_id}" bị gửi cân hai lần.`);
      weights.set(rec._id.toString(), pkg.actual_weight_kg);
    }
    if (weights.size !== decided.length) {
      throw mismatch(`Cần cân cho đủ ${String(decided.length)} kiện, mới có ${String(weights.size)}.`);
    }
    return weights;
  }

  private isAbnormal(estimatedPackageWeightG: number | null, actualKg: number): boolean {
    if (estimatedPackageWeightG === null || estimatedPackageWeightG <= 0) return false;
    const estimatedKg = estimatedPackageWeightG / 1000;
    return Math.abs(actualKg - estimatedKg) / estimatedKg > ABNORMAL_WEIGHT_DEVIATION_THRESHOLD;
  }

  private async notifyAbnormal(
    groupId: string,
    rec: PackagingRecommendationDocument,
    actualKg: number,
  ): Promise<void> {
    const label = rec.platform_order_id ?? groupId;
    const estimatedKg = (rec.estimated_package_weight_g ?? 0) / 1000;
    this.logger.warn(
      `Kiện BẤT THƯỜNG: đơn ${label} — ước tính ${String(estimatedKg)} kg, cân thật ${String(actualKg)} kg.`,
    );
    try {
      const { title, message } = this.notificationsService.buildAbnormalPackageMessage({
        groupId: label,
        estimatedWeightKg: estimatedKg,
        actualWeightKg: actualKg,
      });
      await this.notificationsService.notify({
        recipientRole: UserRole.STORE_OWNER,
        type: NotificationType.ABNORMAL_PACKAGE,
        severity: 'warning',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    } catch (error: unknown) {
      // Thông báo lỗi không được làm hỏng việc đã đóng gói xong.
      this.logger.error(
        `Gửi thông báo kiện bất thường thất bại: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private assertTransition(group: OrderGroupDocument, target: GroupFulfillmentStatus): void {
    if (!isValidStatusTransition(group.fulfillment_status, target)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
        `Không thể chuyển Order Group từ trạng thái "${group.fulfillment_status}" sang "${target}".`,
        HttpStatus.BAD_REQUEST,
        { groupId: group._id.toString(), from: group.fulfillment_status, to: target },
      );
    }
  }

  /**
   * Chuyển trạng thái group TRONG transaction: kiểm tra bảng chuyển trạng
   * thái + optimistic lock theo `__v` (Rule #18).
   */
  private async transitionGroup(
    groupId: string,
    expectedVersion: number,
    target: GroupFulfillmentStatus,
    session: ClientSession,
  ): Promise<OrderGroupDocument> {
    const current = await this.orderGroupModel.findById(groupId).session(session);
    if (!current) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
        `Không tìm thấy order group với id "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    this.assertTransition(current, target);
    const updated = await this.orderGroupModel.findOneAndUpdate(
      { _id: current._id, __v: expectedVersion, fulfillment_status: current.fulfillment_status },
      { $set: { fulfillment_status: target }, $inc: { __v: 1 } },
      { session, returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
        'Order Group đã bị thay đổi bởi thao tác khác — vui lòng tải lại dữ liệu mới nhất rồi thử lại.',
        HttpStatus.CONFLICT,
        { groupId, expectedVersion },
      );
    }
    return updated;
  }

  private async runInTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  private assertObjectId(groupId: string): void {
    if (!Types.ObjectId.isValid(groupId)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_RECOMMENDATION_ID,
        `"${groupId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { groupId },
      );
    }
  }
}
