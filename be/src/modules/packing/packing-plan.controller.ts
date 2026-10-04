import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { PackingPlanService } from './packing-plan.service';
import { averageFill } from './utils/stock-suggestion.util';
import {
  LazadaPackSyncService,
  type LazadaPackSyncResult,
} from '../order-groups/lazada-pack-sync.service';
import type { PackingPlanDocument, PlanProofLabel } from './schemas/packing-plan.schema';
import {
  ApprovePlanDto,
  ChangeBoxDto,
  GuideDto,
  MoveItemDto,
  PackPlanDto,
  RecomputePlanDto,
  RejectPlanDto,
} from './dto/packing-plan.dto';

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
  }[];
  itemProfiles: {
    sku: string;
    productCategory: string | null;
    zipBagCode: string | null;
    zipBagFolded: boolean;
  }[];
  adjustments: { kind: string; detail: string; reason: string; note: string | null; at: Date }[];
  solver: {
    engineVersion: string;
    computationMs: number;
    options: { excludeBoxCodes: string[]; prefer: string };
  };
  totals: { parcels: number; packagingCostVnd: number; estimatedWeightG: number; avgFill: number };
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
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
    })),
    solver: {
      engineVersion: plan.solver.engine_version,
      computationMs: plan.solver.computation_ms,
      options: {
        excludeBoxCodes: plan.solver.options.exclude_box_codes,
        prefer: plan.solver.options.prefer,
      },
    },
    totals: {
      parcels: plan.parcels.length,
      packagingCostVnd: plan.parcels.reduce((s, p) => s + (p.box.price_vnd ?? 0) + p.materials_cost_vnd, 0),
      estimatedWeightG: plan.parcels.reduce((s, p) => s + p.estimated_weight_g, 0),
      avgFill: averageFill(
        plan.parcels.map((p) => ({ box: { inner: p.box.inner_mm }, placements: p.placements })),
      ),
    },
    approvedAt: plan.approved_at,
    rejectedAt: plan.rejected_at,
    rejectionReason: plan.rejection_reason,
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
    private readonly lazadaPackSyncService: LazadaPackSyncService,
  ) {}

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
    return { plan: toPlanResponse(await this.planService.approve(groupId, dto.expected_version, user.userId)) };
  }

  @Post('reject')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Chuyển xử lý ngoài hệ thống (ghi lý do, báo Admin); nhóm về picked, không tự tính lại.' })
  async reject(
    @Param('groupId') groupId: string,
    @Body() dto: RejectPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse }> {
    return {
      plan: toPlanResponse(await this.planService.reject(groupId, dto.expected_version, dto.reason, user.userId)),
    };
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

  @Post('pack')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đã đóng xong: cân thật từng kiện, trừ tồn thùng/vật tư, nhóm → packed. Sau khi commit, báo "đã đóng gói" lên Lazada (có cầu dao LAZADA_WRITE_APIS_ENABLED); lỗi Lazada không đổi trạng thái OptiPack, gửi lại qua POST /order-groups/:id/lazada-pack/retry.',
  })
  async pack(
    @Param('groupId') groupId: string,
    @Body() dto: PackPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ plan: PackingPlanResponse; lazadaPackSync: LazadaPackSyncResult }> {
    const plan = await this.planService.pack(groupId, dto, user.userId);
    // Gộp main (02/10/2026) — SAU khi đã commit `packed`. syncGroup không bao giờ ném lỗi.
    const lazadaPackSync = await this.lazadaPackSyncService.syncGroup(groupId);
    return { plan: toPlanResponse(plan), lazadaPackSync };
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
}

/** Tóm tắt kế hoạch của nhiều nhóm — bảng "Hàng chờ đóng gói" gọi 1 lần thay vì N lần. */
@ApiTags('Packing plan')
@ApiBearerAuth('JWT-auth')
@Controller('packing-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackingPlansController {
  constructor(private readonly planService: PackingPlanService) {}

  @Get('summary')
  @Roles(
    UserRole.PACKAGING_STAFF,
    UserRole.WAREHOUSE_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Tóm tắt kế hoạch đang hoạt động của các nhóm (?group_ids=a,b,c — tối đa 200).' })
  async summary(@Query('group_ids') groupIds = ''): Promise<{ summaries: PackingPlanSummary[] }> {
    const ids = groupIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const plans = await this.planService.listActiveByGroupIds(ids);
    return {
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
        };
      }),
    };
  }
}
