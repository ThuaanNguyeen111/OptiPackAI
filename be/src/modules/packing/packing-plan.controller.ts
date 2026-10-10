import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { PackingPlanService } from './packing-plan.service';
import { PackingSessionService, type ScanOutcome, type SessionResult } from './packing-session.service';
import { PackingSettingsService, type ActivePackingSettings } from './packing-settings.service';
import { PackingReportService, type PackingReport } from './packing-report.service';
import { PackingFeedbackService, type FeedbackReport } from './packing-feedback.service';
import { PackerAssignmentService } from './packer-assignment.service';
import { effectiveParcelStatus } from './utils/parcels.util';
import { PackingQueueService, type GroupQueueInfo } from './packing-queue.service';
import { averageFill } from './utils/stock-suggestion.util';
import {
  LazadaPackSyncService,
  type LazadaPackSyncResult,
} from '../order-groups/lazada-pack-sync.service';
import type { PackingPlanDocument, PlanProofLabel } from './schemas/packing-plan.schema';
import {
  ApprovePlanDto,
  ChangeBoxDto,
  ChangeBoxInSessionDto,
  GuideDto,
  BackToPickingDto,
  ManualPackDto,
  MoveItemDto,
  PackPlanDto,
  RecomputePlanDto,
  RejectPlanDto,
} from './dto/packing-plan.dto';
import {
  AssignPackerDto,
  FinishPackingDto,
  ReportIssueDto,
  ReviewParcelDto,
  ScanItemDto,
  SealParcelDto,
  StartPackingDto,
  UnpackParcelDto,
  UnsealParcelDto,
  UnscanItemDto,
  UpdatePackingSettingsDto,
} from './dto/packing-session.dto';

interface DimsResponse {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PackingPlanResponse {
  id: string;
  orderGroupId: string;
  revision: number;
  version: number;
  status: string;
  failureReason: string | null;
  /** Nhãn YẾU NHẤT trong các đơn (cả nhóm chỉ "tối ưu" khi mọi đơn tối ưu). */
  proof: PlanProofLabel | null;
  /** Còn đơn đang chờ CP-SAT chứng minh (chạy nền). */
  cpSatPending: boolean;
  orders: {
    orderId: string;
    platformOrderId: string | null;
    status: string;
    unplaced: { itemKey: string; code: string; reason: string }[];
    proof: PlanProofLabel;
    lowerBoundParcels: number;
    explanation: string[];
    strategy: string;
    cpSat: string;
    overParcelLimit: boolean;
    stockSuggestion: {
      parcels: number;
      packagingCostVnd: number;
      avgFill: number;
      currentParcels: number;
      currentAvgFill: number;
      savingVnd: number;
      missing: { boxCode: string; boxName: string; needed: number; available: number }[];
    } | null;
  }[];
  parcels: {
    parcelNo: number;
    orderId: string;
    platformOrderId: string | null;
    box: {
      code: string;
      name: string;
      innerMm: DimsResponse;
      outerMm: DimsResponse;
      tareG: number;
      maxLoadG: number;
      priceVnd: number | null;
    };
    placements: {
      itemKey: string;
      sku: string;
      step: number;
      x: number;
      y: number;
      z: number;
      dx: number;
      dy: number;
      dz: number;
      orientation: string;
      folded: boolean;
    }[];
    fillRatio: number;
    /** true = kiện nhập tay, không có tọa độ xếp thật (3D không dựng được). */
    manualLayout: boolean;
    itemsWeightG: number;
    estimatedWeightG: number;
    volumetricWeightG: number;
    materials: {
      type: string;
      code: string | null;
      name: string;
      unit: string;
      quantity: number;
      weightG: number;
      costVnd: number;
    }[];
    materialsWeightG: number;
    materialsCostVnd: number;
    shippingCostVnd: number | null;
    guide: {
      source: 'ai' | 'template';
      model: string | null;
      fallbackReason: string | null;
      summary: string;
      steps: { step: number; instruction: string; tip: string | null }[];
      generatedAt: Date;
    } | null;
    actualWeightKg: number | null;
    isAbnormal: boolean;
    materialsShortfall: { code: string; missing: number }[];
    /** pending | sealed | held | to_unpack | voided (05/10/2026). */
    status: string;
    hasFragile: boolean;
    boxConsumed: boolean;
    scannedCount: number;
    itemCount: number;
    scans: { itemKey: string; sku: string; method: string; by: string | null; at: Date }[];
    sealedBy: string | null;
    sealedAt: Date | null;
    weighings: { weightKg: number; kind: string; isAbnormal: boolean; by: string | null; at: Date }[];
    reviews: { action: string; reason: string; note: string | null; by: string; at: Date }[];
    unpack: {
      reason: string;
      requestedAt: Date;
      boxCondition: string | null;
      unitsRestocked: number;
      recoveredMaterials: { code: string; quantity: number; outcome: string }[];
      note: string | null;
      by: string | null;
      doneAt: Date | null;
    } | null;
  }[];
  itemProfiles: {
    sku: string;
    productCategory: string | null;
    zipBagCode: string | null;
    zipBagFolded: boolean;
  }[];
  adjustments: { kind: string; detail: string; reason: string; note: string | null; at: Date; skus: string[]; boxCodes: string[]; oldBoxOutcome: 'unused' | 'damaged' | null; wasteCostVnd: number }[];
  issues: {
    parcelNo: number;
    itemKey: string;
    sku: string;
    issue: string;
    resolution: string;
    note: string | null;
    by: string;
    at: Date;
  }[];
  activity: { kind: string; parcelNo: number | null; detail: string; reason: string | null; by: string | null; at: Date }[];
  session: {
    assignedPackerId: string | null;
    assignedPackerAt: Date | null;
    startedBy: string | null;
    startedAt: Date | null;
    packMode: string | null;
    approveOverrideReason: string | null;
    /** Số kiện theo trạng thái — FE dựng tiến độ đóng. */
    parcelCounts: Record<string, number>;
  };
  solver: {
    engineVersion: string;
    computationMs: number;
    options: { excludeBoxCodes: string[]; prefer: string; fragileCushionMm: number };
  };
  totals: { parcels: number; packagingCostVnd: number; estimatedWeightG: number; avgFill: number };
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  /** Mã lý do từ chối + người xử lý + hạn + đã xử lý bằng cách nào (null = chưa). */
  rejection: {
    reasonCode: string | null;
    ownerId: string | null;
    dueAt: Date | null;
    overdue: boolean;
    resolution: 'recompute' | 'manual' | 'back_to_picking' | null;
    resolvedAt: Date | null;
  } | null;
  /** solver = bộ giải tính; manual = đóng thủ công sau khi từ chối. */
  source: 'solver' | 'manual';
  packedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const PROOF_RANK: Record<PlanProofLabel, number> = {
  optimal_global: 2,
  optimal_in_model: 1,
  heuristic: 0,
};

const dims = (d: { length_mm: number; width_mm: number; height_mm: number }): DimsResponse => ({
  lengthMm: d.length_mm,
  widthMm: d.width_mm,
  heightMm: d.height_mm,
});

export function toPlanResponse(plan: PackingPlanDocument): PackingPlanResponse {
  const weakest = plan.orders.reduce<PlanProofLabel | null>(
    (acc, o) => (acc === null || PROOF_RANK[o.proof] < PROOF_RANK[acc] ? o.proof : acc),
    null,
  );
  return {
    id: plan._id.toString(),
    orderGroupId: plan.order_group_id.toString(),
    revision: plan.revision,
    version: plan.version,
    status: plan.status,
    failureReason: plan.failure_reason,
    proof: weakest,
    cpSatPending: plan.orders.some((o) => o.cp_sat === 'pending'),
    orders: plan.orders.map((o) => ({
      orderId: o.order_id.toString(),
      platformOrderId: o.platform_order_id,
      status: o.status,
      unplaced: o.unplaced.map((u) => ({ itemKey: u.item_key, code: u.code, reason: u.reason })),
      proof: o.proof,
      lowerBoundParcels: o.lower_bound_parcels,
      explanation: o.explanation,
      strategy: o.strategy,
      cpSat: o.cp_sat,
      overParcelLimit: o.over_parcel_limit,
      // Bản ghi trước 04/10/2026 không có field này.
      stockSuggestion: o.stock_suggestion
        ? {
            parcels: o.stock_suggestion.parcels,
            packagingCostVnd: o.stock_suggestion.packaging_cost_vnd,
            avgFill: o.stock_suggestion.avg_fill,
            currentParcels: o.stock_suggestion.current_parcels,
            currentAvgFill: o.stock_suggestion.current_avg_fill,
            savingVnd: o.stock_suggestion.saving_vnd,
            missing: o.stock_suggestion.missing.map((m) => ({
              boxCode: m.box_code,
              boxName: m.box_name,
              needed: m.needed,
              available: m.available,
            })),
          }
        : null,
    })),
    parcels: plan.parcels.map((p) => ({
      parcelNo: p.parcel_no,
      orderId: p.order_id.toString(),
      platformOrderId: p.platform_order_id,
      box: {
        code: p.box.code,
        name: p.box.name,
        innerMm: dims(p.box.inner_mm),
        outerMm: dims(p.box.outer_mm),
        tareG: p.box.tare_g,
        maxLoadG: p.box.max_load_g,
        priceVnd: p.box.price_vnd,
      },
      placements: p.placements.map((q) => ({
        itemKey: q.item_key,
        sku: q.sku,
        step: q.step,
        x: q.x,
        y: q.y,
        z: q.z,
        dx: q.dx,
        dy: q.dy,
        dz: q.dz,
        orientation: q.orientation,
        folded: q.folded,
      })),
      fillRatio: p.fill_ratio,
      manualLayout: p.manual_layout,
      itemsWeightG: p.items_weight_g,
      estimatedWeightG: p.estimated_weight_g,
      volumetricWeightG: p.volumetric_weight_g,
      materials: p.materials.map((m) => ({
        type: m.type,
        code: m.code,
        name: m.name,
        unit: m.unit,
        quantity: m.quantity,
        weightG: m.weight_g,
        costVnd: m.cost_vnd,
      })),
      materialsWeightG: p.materials_weight_g,
      materialsCostVnd: p.materials_cost_vnd,
      shippingCostVnd: p.shipping_cost_vnd,
      guide: p.guide
        ? {
            source: p.guide.source,
            model: p.guide.model,
            fallbackReason: p.guide.fallback_reason,
            summary: p.guide.summary,
            steps: p.guide.steps.map((s) => ({ step: s.step, instruction: s.instruction, tip: s.tip })),
            generatedAt: p.guide.generated_at,
          }
        : null,
      actualWeightKg: p.actual_weight_kg,
      isAbnormal: p.is_abnormal,
      materialsShortfall: p.materials_shortfall.map((s) => ({ code: s.code, missing: s.missing })),
      status: effectiveParcelStatus(plan.status, p),
      hasFragile: p.has_fragile,
      boxConsumed: p.box_consumed || plan.status === 'packed',
      scannedCount: p.scans.length,
      itemCount: p.placements.length,
      scans: p.scans.map((x) => ({ itemKey: x.item_key, sku: x.sku, method: x.method, by: x.by?.toString() ?? null, at: x.at })),
      sealedBy: p.sealed_by?.toString() ?? null,
      sealedAt: p.sealed_at,
      weighings: p.weighings.map((w) => ({
        weightKg: w.weight_kg,
        kind: w.kind,
        isAbnormal: w.is_abnormal,
        by: w.by?.toString() ?? null,
        at: w.at,
      })),
      reviews: p.reviews.map((r) => ({ action: r.action, reason: r.reason, note: r.note, by: r.by.toString(), at: r.at })),
      unpack: p.unpack
        ? {
            reason: p.unpack.reason,
            requestedAt: p.unpack.requested_at,
            boxCondition: p.unpack.box_condition,
            unitsRestocked: p.unpack.units_restocked,
            recoveredMaterials: p.unpack.recovered_materials.map((m) => ({
              code: m.code,
              quantity: m.quantity,
              outcome: m.outcome,
            })),
            note: p.unpack.note,
            by: p.unpack.by?.toString() ?? null,
            doneAt: p.unpack.done_at,
          }
        : null,
    })),
    itemProfiles: plan.item_profiles.map((i) => ({
      sku: i.sku,
      productCategory: i.product_category,
      zipBagCode: i.zip_bag_code,
      zipBagFolded: i.zip_bag_folded,
    })),
    adjustments: plan.adjustments.map((a) => ({
      kind: a.kind,
      detail: a.detail,
      reason: a.reason,
      note: a.note,
      at: a.at,
      skus: a.skus,
      boxCodes: a.box_codes,
      oldBoxOutcome: a.old_box_outcome ?? null,
      wasteCostVnd: a.waste_cost_vnd ?? 0,
    })),
    issues: plan.issues.map((i) => ({
      parcelNo: i.parcel_no,
      itemKey: i.item_key,
      sku: i.sku,
      issue: i.issue,
      resolution: i.resolution,
      note: i.note,
      by: i.by.toString(),
      at: i.at,
    })),
    activity: plan.activity.map((a) => ({
      kind: a.kind,
      parcelNo: a.parcel_no,
      detail: a.detail,
      reason: a.reason,
      by: a.by?.toString() ?? null,
      at: a.at,
    })),
    session: {
      assignedPackerId: plan.assigned_packer_id?.toString() ?? null,
      assignedPackerAt: plan.assigned_packer_at,
      startedBy: plan.packing_started_by?.toString() ?? null,
      startedAt: plan.packing_started_at,
      packMode: plan.pack_mode,
      approveOverrideReason: plan.approve_override_reason,
      parcelCounts: plan.parcels.reduce<Record<string, number>>((acc, p) => {
        const status = effectiveParcelStatus(plan.status, p);
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      }, {}),
    },
    solver: {
      engineVersion: plan.solver.engine_version,
      computationMs: plan.solver.computation_ms,
      options: {
        excludeBoxCodes: plan.solver.options.exclude_box_codes,
        prefer: plan.solver.options.prefer,
        fragileCushionMm: plan.solver.options.fragile_cushion_mm,
      },
    },
    // Tổng chỉ tính kiện CÒN GIAO (kiện đang/đã tháo vì đơn hủy không tính).
    totals: (() => {
      const live = plan.parcels.filter((p) => p.status !== 'to_unpack' && p.status !== 'voided');
      return {
        parcels: live.length,
        packagingCostVnd: live.reduce((s, p) => s + (p.box.price_vnd ?? 0) + p.materials_cost_vnd, 0),
        estimatedWeightG: live.reduce((s, p) => s + p.estimated_weight_g, 0),
        avgFill: averageFill(live.map((p) => ({ box: { inner: p.box.inner_mm }, placements: p.placements }))),
      };
    })(),
    approvedAt: plan.approved_at,
    rejectedAt: plan.rejected_at,
    rejectionReason: plan.rejection_reason,
    rejection: plan.rejected_at
      ? {
          reasonCode: plan.rejection_reason_code,
          ownerId: plan.rejection_owner_id?.toString() ?? null,
          dueAt: plan.rejection_due_at,
          overdue:
            plan.status === 'rejected' && plan.rejection_due_at !== null && plan.rejection_due_at.getTime() < Date.now(),
          resolution: plan.rejection_resolution,
          resolvedAt: plan.rejection_resolved_at,
        }
      : null,
    source: plan.source,
    packedAt: plan.packed_at,
    createdAt: plan.created_at ?? null,
    updatedAt: plan.updated_at ?? null,
  };
}

/**
 * ===================================================================
 * Kế hoạch đóng gói của 1 nhóm đơn (04/10/2026, đợt 3 làm lại)
 * ===================================================================
 * Thay toàn bộ route cũ `order-groups/:groupId/packaging/*` và
 * `order-groups/:groupId/fulfillment/pack`. Kế hoạch được TỰ TÍNH khi
 * nhóm lấy hàng xong (cron 10 giây) — không còn nút "generate".
 * ===================================================================
 */
@ApiTags('Packing plan')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups/:groupId/packing-plan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackingPlanController {
  constructor(
    private readonly planService: PackingPlanService,
    private readonly sessionService: PackingSessionService,
    private readonly packerAssignment: PackerAssignmentService,
    private readonly lazadaPackSyncService: LazadaPackSyncService,
  ) {}

  /** Nhóm vừa sang packed → báo "đã đóng gói" lên Lazada SAU commit (syncGroup không ném lỗi). */
  private async withLazada(
    groupId: string,
    result: SessionResult,
  ): Promise<{ plan: PackingPlanResponse; completed: boolean; lazadaPackSync: LazadaPackSyncResult | null }> {
    const lazadaPackSync = result.completed ? await this.lazadaPackSyncService.syncGroup(groupId) : null;
    return { plan: toPlanResponse(result.plan), completed: result.completed, lazadaPackSync };
  }

  @Get()
  @Roles(
    UserRole.PACKAGING_STAFF,
    UserRole.WAREHOUSE_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Kế hoạch đóng gói đang hoạt động của nhóm (null nếu chưa có).' })
  async get(@Param('groupId') groupId: string): Promise<{ plan: PackingPlanResponse | null }> {
    const plan = await this.planService.getActivePlan(groupId);
    return { plan: plan ? toPlanResponse(plan) : null };
  }

  @Post('recompute')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tính lại (có điều kiện: loại trừ thùng, ưu tiên rẻ). Kế hoạch cũ bị thay, nhóm quay về picked rồi tính ngay; CP-SAT chạy nền.',
  })
  async recompute(
    @Param('groupId') groupId: string,
    @Body() dto: RecomputePlanDto,
  ): Promise<{ plan: PackingPlanResponse }> {
    const { plan, tasks } = await this.planService.recompute(groupId, dto);
    this.planService.runCpSatInBackground(tasks);
    return { plan: toPlanResponse(plan) };
  }

  @Post('approve')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt kế hoạch → nhóm approved_for_packing. Mọi đơn phải xếp hết món.' })
  async approve(
    @Param('groupId') groupId: string,
    @Body() dto: ApprovePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return {
      plan: toPlanResponse(
        await this.planService.approve(groupId, dto.expected_version, user.userId, dto.override_reason),
      ),
    };
  }

  @Post('reject')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Từ chối kế hoạch: lý do theo MÃ, có người xử lý + hạn (2 giờ làm việc). Nhóm về picked, không tự tính lại; lối ra: recompute, manual hoặc back-to-picking.',
  })
  async reject(
    @Param('groupId') groupId: string,
    @Body() dto: RejectPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return {
      plan: toPlanResponse(
        await this.planService.reject(groupId, dto.expected_version, dto.reason, dto.note, user.userId, dto.owner_id),
      ),
    };
  }

  @Post('back-to-picking')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Lối ra thứ 3 sau khi từ chối: trả nhóm về bước lấy hàng. Khai món phải lấy lại (restock=true: món lấy nhầm còn tốt, cộng lại đúng ô; mặc định: món hỏng, loại bỏ). Kế hoạch cũ superseded, nhóm picked → picking; kho quét bù rồi xác nhận lấy xong, cron tự tính kế hoạch mới.',
  })
  async backToPicking(
    @Param('groupId') groupId: string,
    @Body() dto: BackToPickingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.planService.backToPicking(groupId, dto, user.userId)) };
  }

  @Post('manual')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đóng gói THỦ CÔNG sau khi từ chối: nhập kiện thật (thùng + món). Hệ thống kiểm đủ món, thùng còn tồn, quá tải; tạo kế hoạch mới chờ người KHÁC duyệt.',
  })
  async manual(
    @Param('groupId') groupId: string,
    @Body() dto: ManualPackDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.planService.manualPack(groupId, dto, user.userId)) };
  }

  @Post('parcels/:parcelNo/change-box')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Đổi thùng cho 1 kiện — xếp lại và phải qua validator.' })
  async changeBox(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: ChangeBoxDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.planService.changeBox(groupId, parcelNo, dto, user.userId)) };
  }

  @Post('parcels/:parcelNo/change-box-in-session')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đổi thùng khi ĐANG đóng (kế hoạch approved/packing, kiện chưa niêm phong). Bắt buộc khai thùng cũ: unused = trả kệ, không trừ; damaged = trừ tồn + ghi hao hụt. Giữ các lần quét đã có.',
  })
  async changeBoxInSession(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: ChangeBoxInSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.planService.changeBoxInSession(groupId, parcelNo, dto, user.userId)) };
  }

  @Post('parcels/:parcelNo/move-item')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Chuyển 1 món sang kiện khác cùng đơn, hoặc tách ra kiện mới.' })
  async moveItem(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: MoveItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.planService.moveItem(groupId, parcelNo, dto, user.userId)) };
  }

  @Post('parcels/:parcelNo/guide')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Hướng dẫn đóng gói từng bước cho 1 kiện (AI viết lời, có câu mẫu dự phòng).' })
  async guide(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: GuideDto,
  ): Promise<{ plan: PackingPlanResponse }> {
    return {
      plan: toPlanResponse(await this.planService.getOrCreateGuide(groupId, parcelNo, dto.regenerate === true)),
    };
  }

  // ------------------------------------------------------------ phiên đóng gói (05/10/2026)

  @Post('assign')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Giao người đóng (Packaging Staff): auto = ít việc nhất; manual = chỉ định staff_id.' })
  async assign(@Param('groupId') groupId: string, @Body() dto: AssignPackerDto): Promise<{ plan: PackingPlanResponse }> {
    const plan = await this.planService.requireActivePlan(groupId);
    return { plan: toPlanResponse(await this.packerAssignment.assign(plan, dto.mode, dto.staff_id)) };
  }

  @Post('start')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bắt đầu đóng (approved → packing), ghi người + giờ bắt đầu. Quét món đầu tiên cũng tự bắt đầu.' })
  async start(
    @Param('groupId') groupId: string,
    @Body() dto: StartPackingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.sessionService.start(groupId, dto.expected_version, user.userId)) };
  }

  @Post('parcels/:parcelNo/scan')
  @SkipThrottle()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Quét món vào kiện (SKU sàn hoặc SKU nội bộ). Sai kiện / quá số món bị chặn. Không cần expected_version; gửi lại cùng client_event_id không đếm 2 lần.',
  })
  async scan(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: ScanItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; scan: ScanOutcome }> {
    const result = await this.sessionService.scan(groupId, parcelNo, dto, user.userId);
    return { plan: toPlanResponse(result.plan), scan: result.scan };
  }

  @Post('parcels/:parcelNo/unscan')
  @SkipThrottle()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Gỡ 1 lần quét (quét nhầm) — bắt buộc lý do, ghi nhật ký.' })
  async unscan(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: UnscanItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.sessionService.unscan(groupId, parcelNo, dto, user.userId)) };
  }

  @Post('parcels/:parcelNo/seal')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Niêm phong + cân 1 kiện (đã quét đủ): trừ thùng/vật tư của kiện. Lệch cân quá ngưỡng → kiện "held" chờ người khác xem lại. Kiện cuối cùng → nhóm packed + báo Lazada.',
  })
  async seal(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: SealParcelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; completed: boolean; lazadaPackSync: LazadaPackSyncResult | null }> {
    return this.withLazada(groupId, await this.sessionService.seal(groupId, parcelNo, dto, user.userId));
  }

  @Post('parcels/:parcelNo/review')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Xem lại kiện lệch cân: accept (người KHÁC người niêm phong), reweigh (cân lại), reopen (mở ra đóng lại, không trừ thùng lần 2).',
  })
  async review(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: ReviewParcelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; completed: boolean; lazadaPackSync: LazadaPackSyncResult | null }> {
    return this.withLazada(groupId, await this.sessionService.review(groupId, parcelNo, dto, user.userId));
  }

  @Post('report-issue')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Báo món hỏng/thiếu/sai lúc đóng: replace = lấy món thay từ kệ ngay; back_to_picking = trả nhóm về lấy hàng (chỉ khi chưa niêm phong kiện nào).',
  })
  async reportIssue(
    @Param('groupId') groupId: string,
    @Body() dto: ReportIssueDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return { plan: toPlanResponse(await this.sessionService.reportIssue(groupId, dto, user.userId)) };
  }

  @Post('parcels/:parcelNo/unseal')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Hoàn tác niêm phong 1 kiện (sealed/held) để đóng lại. Kế hoạch đang đóng: nhân viên đóng gói làm được. Nhóm đã packed (chưa giao): chỉ Admin/Store Owner, nhóm quay về approved_for_packing. Thùng reusable = dùng lại, không trừ lần 2; damaged = mất, niêm phong lại trừ cái mới + ghi hao hụt. Lazada KHÔNG hoàn tác được Pack — response có cảnh báo.',
  })
  async unseal(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: UnsealParcelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; wasPacked: boolean; warnings: string[] }> {
    const { plan, wasPacked } = await this.sessionService.unseal(groupId, parcelNo, dto, user.userId, user.role);
    return {
      plan: toPlanResponse(plan),
      wasPacked,
      warnings: wasPacked
        ? ['Nếu đơn đã được báo "Đã đóng gói" lên Lazada, Lazada không hỗ trợ hoàn tác — trạng thái trên sàn giữ nguyên.']
        : [],
    };
  }

  @Post('parcels/:parcelNo/unpack')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tháo kiện của đơn bị hủy sau khi đóng: hàng về đúng ô đã lấy (sổ kho cancel_unpack), thùng còn tốt vào kho tái sử dụng, vật tư chèn khai trong recovered_materials được thu hồi.',
  })
  async unpack(
    @Param('groupId') groupId: string,
    @Param('parcelNo', ParseIntPipe) parcelNo: number,
    @Body() dto: UnpackParcelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    plan: PackingPlanResponse;
    completed: boolean;
    restocked: number;
    withoutLocation: number;
    box: string;
    materials: { code: string; quantity: number; outcome: string }[];
    lazadaPackSync: LazadaPackSyncResult | null;
  }> {
    const result = await this.sessionService.unpack(groupId, parcelNo, dto, user.userId);
    const lazadaPackSync = result.completed ? await this.lazadaPackSyncService.syncGroup(groupId) : null;
    return {
      plan: toPlanResponse(result.plan),
      completed: result.completed,
      restocked: result.restocked,
      withoutLocation: result.withoutLocation,
      box: result.box,
      materials: result.materials,
      lazadaPackSync,
    };
  }

  @Post('finish')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Hoàn tất khi mọi kiện còn giao đã niêm phong nhưng kế hoạch chưa tự sang packed.' })
  async finish(
    @Param('groupId') groupId: string,
    @Body() dto: FinishPackingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; completed: boolean; lazadaPackSync: LazadaPackSyncResult | null }> {
    return this.withLazada(groupId, await this.sessionService.finish(groupId, dto.expected_version, user.userId));
  }

  @Post('pack')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Lối tắt: cân cho ĐỦ các kiện chưa niêm phong trong 1 lần (không quét từng món — ghi "bypass"). Kiện lệch cân bị giữ chờ xem lại; hết kiện giữ → nhóm packed + báo Lazada (cầu dao LAZADA_WRITE_APIS_ENABLED). Bị chặn khi cài đặt require_scan = true.',
  })
  async pack(
    @Param('groupId') groupId: string,
    @Body() dto: PackPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; completed: boolean; lazadaPackSync: LazadaPackSyncResult | null }> {
    return this.withLazada(groupId, await this.sessionService.quickPack(groupId, dto, user.userId));
  }
}

export interface PackingPlanSummary {
  orderGroupId: string;
  status: string;
  version: number;
  proof: PlanProofLabel | null;
  cpSatPending: boolean;
  parcels: number;
  packagingCostVnd: number;
  failureReason: string | null;
  assignedPackerId: string | null;
  /** Số kiện theo trạng thái (pending/sealed/held/to_unpack/voided). */
  parcelCounts: Record<string, number>;
}

/** Tóm tắt kế hoạch của nhiều nhóm — bảng "Hàng chờ đóng gói" gọi 1 lần thay vì N lần. */
@ApiTags('Packing plan')
@ApiBearerAuth('JWT-auth')
@Controller('packing-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackingPlansController {
  constructor(
    private readonly planService: PackingPlanService,
    private readonly queueService: PackingQueueService,
  ) {}

  @Get('summary')
  @Roles(
    UserRole.PACKAGING_STAFF,
    UserRole.WAREHOUSE_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Tóm tắt kế hoạch đang hoạt động của các nhóm (?group_ids=a,b,c — tối đa 200).' })
  async summary(
    @Query('group_ids') groupIds = '',
  ): Promise<{ summaries: PackingPlanSummary[]; groups: GroupQueueInfo[] }> {
    const ids = groupIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const [plans, groups] = await Promise.all([
      this.planService.listActiveByGroupIds(ids),
      this.queueService.describeGroups(ids),
    ]);
    return {
      groups,
      summaries: plans.map((plan) => {
        const full = toPlanResponse(plan);
        return {
          orderGroupId: full.orderGroupId,
          status: full.status,
          version: full.version,
          proof: full.proof,
          cpSatPending: full.cpSatPending,
          parcels: full.totals.parcels,
          packagingCostVnd: full.totals.packagingCostVnd,
          failureReason: full.failureReason,
          assignedPackerId: full.session.assignedPackerId,
          parcelCounts: full.session.parcelCounts,
        };
      }),
    };
  }
}

/** Luật đóng gói Store Owner/Admin chỉnh được (05/10/2026). */
@ApiTags('Packing settings & reports')
@ApiBearerAuth('JWT-auth')
@Controller('packing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackingSettingsController {
  constructor(
    private readonly settingsService: PackingSettingsService,
    private readonly reportService: PackingReportService,
    private readonly feedbackService: PackingFeedbackService,
    private readonly packerAssignment: PackerAssignmentService,
  ) {}

  @Get('staff')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách Packaging Staff đang hoạt động kèm số kế hoạch đang mở (?q tìm theo tên/email). Dùng cho dropdown giao người đóng (packing-plan/assign) và người xử lý khi từ chối (reject.owner_id).',
  })
  async listPackers(
    @Query('q') q?: string,
  ): Promise<{ staff: { staffId: string; fullName: string; email: string; activeWorkload: number }[] }> {
    return { staff: await this.packerAssignment.listPackers(q) };
  }

  @Get('settings')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cài đặt đóng gói đang dùng (version null = mặc định trong code).' })
  async getSettings(): Promise<{ settings: ActivePackingSettings }> {
    return { settings: await this.settingsService.get() };
  }

  @Put('settings')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lưu cài đặt mới (tạo version mới, giữ lịch sử). Trường không gửi giữ nguyên.' })
  async updateSettings(
    @Body() dto: UpdatePackingSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ settings: ActivePackingSettings }> {
    return { settings: await this.settingsService.update(dto, user.userId) };
  }

  @Get('reports/summary')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Hiệu suất đóng gói trong khoảng ngày (?from&to ISO, mặc định 30 ngày; ?staff_id lọc 1 người): thời gian, tỷ lệ lệch cân, duyệt nguyên vẹn, đạt số kiện tối thiểu, quét kiểm, chi phí, theo nhân viên.',
  })
  async report(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staff_id') staffId?: string,
  ): Promise<{ report: PackingReport }> {
    return { report: await this.reportService.summary(from, to, staffId) };
  }

  @Get('reports/feedback')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Vòng phản hồi (08/10/2026): gom các lần nhân viên làm KHÁC gợi ý (chỉnh tay, từ chối, lệch cân) theo lý do × SKU × thùng và ĐỀ XUẤT việc Admin nên sửa (hồ sơ SKU, danh mục thùng, cài đặt). ?from&to ISO (mặc định 30 ngày); ?min_count số lần tối thiểu để sinh đề xuất (mặc định 3).',
  })
  async feedback(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('min_count') minCount?: string,
  ): Promise<{ report: FeedbackReport }> {
    const parsed = minCount === undefined ? 3 : Number(minCount);
    return { report: await this.feedbackService.report(from, to, Number.isFinite(parsed) ? parsed : 3) };
  }
}
