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
import { PackagingBoxService, type ConsumedBox } from './packaging-box.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  expandToUnits,
  packOrder,
  describePackingSteps,
  ALL_ORIENTATIONS,
  type BoxSpec,
  type Orientation,
  type PackingUnit,
  type PackResult,
  type Placement,
} from './engine';
import { PackingGuideAiService } from './packing-guide-ai.service';
import { PackagingBagService } from './packaging-bag.service';
import type { PackableItem } from '../../common/interfaces/packaging.interface';

const ABNORMAL_WEIGHT_DEVIATION_THRESHOLD = 0.2; // 20% — ngưỡng khởi đầu, cần hiệu chỉnh bằng dữ liệu thật
const ENGINE_VERSION = 'greedy-3d-v1';

/** Chụp loại sản phẩm + túi zip theo SKU từ hồ sơ lúc tính phương án. */
function toItemProfiles(items: PackableItem[]): {
  sku: string;
  product_category: string | null;
  zip_bag_code: string | null;
  zip_bag_folded: boolean;
}[] {
  return items.map((i) => ({
    sku: i.sku,
    product_category: i.product_category ?? null,
    zip_bag_code: i.zip_bag_code ?? null,
    zip_bag_folded: i.zip_bag_folded ?? false,
  }));
}

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
    private readonly packingGuideAi: PackingGuideAiService,
    private readonly bagService: PackagingBagService,
  ) {}

  /**
   * Tính phương án cho từng đơn trong group (group phải đang `picked`).
   * Vẫn gắn @Roles(ADMIN) ở controller — trigger tự động là BE-5.
   */
  async generateRecommendations(groupId: string): Promise<PackagingRecommendationDocument[]> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    this.assertTransition(group, GroupFulfillmentStatus.PENDING_APPROVAL);

    const allocations = await this.orderGroupsService.allocatePickedItemsToOrders(groupId);
    const [boxes, availability] = await Promise.all([
      this.boxService.listActiveSpecs(),
      // Không tính chỗ giữ của chính group này — phương án cũ sắp bị thay.
      this.boxService.listAvailability({ groupId }),
    ]);

    // (22/09/2026) Xếp TUẦN TỰ từng đơn, trừ dần số thùng còn trống: 2 đơn
    // trong cùng group không cùng giành 1 thùng cuối cùng.
    const remaining = new Map([...availability].map(([code, a]) => [code, a.available]));
    const planned = allocations.map((allocation) => {
      const result = packOrder(expandToUnits(allocation.items), boxes, { availability: remaining });
      if (result.status === 'ok') {
        remaining.set(result.box.code, (remaining.get(result.box.code) ?? 0) - 1);
      }
      return { allocation, result };
    });
    const docs = planned.map(({ allocation, result }) => ({
      order_group_id: group._id,
      order_id: new Types.ObjectId(allocation.order_id),
      platform_order_id: allocation.platform_order_id,
      ...this.resultToFields(result),
      item_profiles: toItemProfiles(allocation.items),
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

  /**
   * ===================================================================
   * MỚI (21/09/2026) — hướng dẫn đóng gói từng bước cho animation 3D.
   * ===================================================================
   * Dữ kiện (vị trí, cách xoay, món bên dưới) lấy từ placements engine
   * đã tính; AI (Groq) chỉ viết lại lời (xem PackingGuideAiService). Kết
   * quả được lưu vào recommendation để không gọi AI lặp lại mỗi lần mở
   * trang; `regenerate=true` để viết lại. Không đổi trạng thái group.
   */
  async getOrCreatePackingGuide(
    groupId: string,
    recommendationId: string,
    regenerate = false,
  ): Promise<PackagingRecommendationDocument> {
    this.assertObjectId(groupId);
    if (!Types.ObjectId.isValid(recommendationId)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_RECOMMENDATION_ID,
        `recommendationId "${recommendationId}" không đúng định dạng.`,
        HttpStatus.BAD_REQUEST,
        { recommendationId },
      );
    }
    const recommendation = await this.recommendationModel.findOne({
      _id: new Types.ObjectId(recommendationId),
      order_group_id: new Types.ObjectId(groupId),
      is_active: true,
    });
    if (!recommendation) {
      throw new AppException(
        PACKAGING_ERROR_CODES.RECOMMENDATION_NOT_FOUND,
        'Không tìm thấy phương án đóng gói đang dùng của group này.',
        HttpStatus.NOT_FOUND,
        { groupId, recommendationId },
      );
    }
    if (recommendation.packing_guide && !regenerate) return recommendation;

    const { box_code: code, box_name: name, box_inner_mm: inner, box_outer_mm: outer } = recommendation;
    if (recommendation.solution_status !== 'ok' || !code || !inner || recommendation.placements.length === 0) {
      throw new AppException(
        PACKAGING_ERROR_CODES.GUIDE_NOT_AVAILABLE,
        'Đơn này chưa có thùng xếp vừa (no_fit) — chọn thùng khác bằng adjust trước khi xem hướng dẫn.',
        HttpStatus.CONFLICT,
        { groupId, recommendationId },
      );
    }
    const box: BoxSpec = {
      code,
      name: name ?? code,
      inner,
      outer: outer ?? inner,
      tare_g: 0,
      max_load_g: 0,
      price_vnd: null,
    };
    const placements: Placement[] = recommendation.placements.map((p) => ({
      item_key: p.item_key,
      sku: p.sku,
      step: p.step,
      x: p.x,
      y: p.y,
      z: p.z,
      dx: p.dx,
      dy: p.dy,
      dz: p.dz,
      orientation: ALL_ORIENTATIONS.includes(p.orientation as Orientation) ? (p.orientation as Orientation) : 'LWH',
      folded: p.folded,
    }));
    const units = await this.loadUnitsForGuide(groupId, recommendation.order_id?.toString() ?? null);
    const bagCodes = [
      ...new Set(recommendation.item_profiles.map((p) => p.zip_bag_code).filter((c): c is string => c !== null)),
    ];
    const bagNames = await this.bagService.namesByCode(bagCodes);
    const profiles = new Map(
      recommendation.item_profiles.map((p) => [
        p.sku,
        {
          product_category: p.product_category,
          zip_bag:
            p.zip_bag_code === null
              ? null
              : { code: p.zip_bag_code, name: bagNames.get(p.zip_bag_code) ?? p.zip_bag_code, folded: p.zip_bag_folded },
        },
      ]),
    );
    const facts = describePackingSteps(placements, box, units, profiles);
    const guide = await this.packingGuideAi.writeGuide({
      box,
      facts,
      fill_ratio: recommendation.fill_ratio,
      bubble_wrap_count: recommendation.material_quantity,
    });

    const updated = await this.recommendationModel.findOneAndUpdate(
      { _id: recommendation._id, is_active: true },
      {
        $set: {
          packing_guide: {
            source: guide.source,
            model: guide.model,
            fallback_reason: guide.fallback_reason,
            summary: guide.summary,
            steps: guide.steps,
            generated_at: new Date(),
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
        'Phương án vừa bị thay đổi trong lúc tạo hướng dẫn — tải lại dữ liệu.',
        HttpStatus.CONFLICT,
        { groupId, recommendationId },
      );
    }
    return updated;
  }

  /**
   * Lấy độ nhạy/giới hạn chồng của từng món để hướng dẫn nhắc đúng lưu ý.
   * Không lấy được (VD đơn cũ, không còn lượt quét) → mảng rỗng, hướng
   * dẫn vẫn tạo được nhưng thiếu lưu ý dễ vỡ.
   */
  private async loadUnitsForGuide(groupId: string, orderId: string | null): Promise<PackingUnit[]> {
    if (!orderId) return [];
    try {
      const allocation = (await this.orderGroupsService.allocatePickedItemsToOrders(groupId)).find(
        (a) => a.order_id === orderId,
      );
      return allocation ? expandToUnits(allocation.items) : [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không lấy được hồ sơ món cho hướng dẫn đóng gói (group ${groupId}): ${message}`);
      return [];
    }
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
    // (22/09/2026) Thùng mới phải còn trống — không tính chỗ mà chính
    // phương án này đang giữ (đổi sang cùng loại thùng vẫn hợp lệ).
    const stock = (await this.boxService.listAvailability({ recommendationId: recommendation._id })).get(box.code);
    if (!stock || stock.available <= 0) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
        `Kho không còn thùng "${box.code}" trống (tồn ${String(stock?.onHand ?? 0)}, đang giữ chỗ ${String(stock?.reserved ?? 0)}).`,
        HttpStatus.CONFLICT,
        { boxCode: box.code, onHand: stock?.onHand ?? 0, reserved: stock?.reserved ?? 0 },
      );
    }
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

    // (22/09/2026) Dùng chung packOrder với đúng 1 thùng → có multi-start và
    // gập đôi hàng mềm khi cần, giống lúc generate. Tồn đã kiểm ở trên.
    const result = packOrder(expandToUnits(allocation.items), [box]);
    if (result.status !== 'ok') {
      throw new AppException(
        PACKAGING_ERROR_CODES.BOX_DOES_NOT_FIT,
        `Thùng "${box.code}" không xếp vừa hàng của đơn này.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { boxCode: box.code, violations: result.reasons.map((r) => r.reason) },
      );
    }

    const updated = await this.recommendationModel.updateOne(
      { _id: recommendation._id, is_active: true, approval_status: PackagingApprovalStatus.PENDING },
      {
        $set: {
          ...this.resultToFields(result),
          item_profiles: toItemProfiles(allocation.items),
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

    let consumed: ConsumedBox[] = [];
    const updatedGroup = await this.runInTransaction(async (session) => {
      // (22/09/2026) Trừ tồn thùng thật + ghi sổ; thiếu thùng → rollback
      // toàn bộ, group KHÔNG sang packed.
      consumed = await this.boxService.consumeForPack(
        session,
        decided
          .filter((rec) => rec.solution_status === 'ok' && rec.box_code !== null)
          .map((rec) => ({ boxCode: rec.box_code ?? '', recommendationId: rec._id })),
        group._id,
        userId,
      );
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
    // Chỉ báo đúng lần tồn vượt xuống ngưỡng (trước > mức, sau ≤ mức), không spam.
    for (const box of consumed.filter((c) => c.before > c.reorderLevel && c.after <= c.reorderLevel)) {
      await this.notifyLowBoxStock(box);
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
        packing_guide: null,
        preferred_box_out_of_stock: null,
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
      // Phương án xếp đổi → hướng dẫn cũ không còn đúng.
      packing_guide: null,
      preferred_box_out_of_stock: result.preferred_box_out_of_stock,
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

  /** (22/09/2026) Thùng carton xuống ≤ mức cảnh báo sau khi đóng gói. */
  private async notifyLowBoxStock(box: ConsumedBox): Promise<void> {
    const title = box.after === 0 ? `Đã hết thùng ${box.code}` : `Thùng ${box.code} sắp hết`;
    const message =
      box.after === 0
        ? `Kho vừa dùng thùng ${box.code} cuối cùng. Engine đóng gói sẽ chuyển sang thùng lớn hơn cho tới khi nhập thêm.`
        : `Kho còn ${String(box.after)} thùng ${box.code} (mức cảnh báo ${String(box.reorderLevel)}). Vui lòng nhập thêm.`;
    for (const recipientRole of [UserRole.ADMIN, UserRole.STORE_OWNER]) {
      try {
        await this.notificationsService.notify({
          recipientRole,
          type: NotificationType.LOW_BOX_STOCK,
          severity: 'warning',
          title,
          message,
          relatedEntityType: 'packaging_box',
          relatedEntityId: box.code,
        });
      } catch (error: unknown) {
        // Thông báo lỗi không được làm hỏng việc đã đóng gói xong.
        this.logger.error(
          `Gửi cảnh báo sắp hết thùng ${box.code} thất bại: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
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
