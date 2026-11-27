import mongoose, { type Types } from 'mongoose';
import { DEFAULT_FEE_ESTIMATE } from '../src/modules/packing/solver/objective';
import { packingAccuracy, type AccuracyParcel } from '../src/modules/packing/utils/packing-accuracy.util';

/**
 * ===================================================================
 * Báo cáo độ chính xác engine đóng gói (22/11/2026)
 * ===================================================================
 * CHỈ ĐỌC. Lấy kế hoạch mới nhất của mỗi nhóm đơn có kiện đã cân thật, so:
 *   - cân thật lúc niêm phong với cân ước tính (theo kiện, theo thùng),
 *   - bậc cước theo cân ước tính với bậc theo cân thật,
 *   - phí dịch vụ GHN với cước ước tính (biểu cước ở packing_settings),
 *   - cân SKU trong hồ sơ với cân suy ra từ kiện chỉ có 1 SKU.
 * Số liệu ít thì chỉ để tham khảo; script không sửa hồ sơ SKU.
 *
 * Chạy:  npx ts-node --transpile-only -r dotenv/config scripts/report-packing-accuracy.ts
 * ===================================================================
 */

interface PlanRow {
  order_group_id: Types.ObjectId;
  revision: number;
  solver?: { inputs?: { billing_step_g?: number } | null };
  parcels: {
    parcel_no: number;
    box: { code: string };
    placements: { sku: string }[];
    items_weight_g: number;
    estimated_weight_g: number;
    volumetric_weight_g: number;
    actual_weight_kg: number | null;
  }[];
}

interface ShipmentRow {
  order_group_id: Types.ObjectId;
  carrier_parcels?: { parcel_no: number; fee?: { service_fee?: number } | null }[];
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(uri);
  const db = mongoose.connection;

  const plans = await db
    .collection<PlanRow>('packing_plans')
    .aggregate<PlanRow>([
      { $match: { 'parcels.actual_weight_kg': { $gt: 0 } } },
      { $sort: { order_group_id: 1, revision: -1 } },
      { $group: { _id: '$order_group_id', plan: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$plan' } },
      { $project: { order_group_id: 1, revision: 1, 'solver.inputs.billing_step_g': 1, parcels: 1 } },
    ])
    .toArray();

  const shipments = await db
    .collection<ShipmentRow>('shipments')
    .find({ order_group_id: { $in: plans.map((p) => p.order_group_id) } })
    .project<ShipmentRow>({ order_group_id: 1, 'carrier_parcels.parcel_no': 1, 'carrier_parcels.fee.service_fee': 1 })
    .toArray();
  const serviceFee = new Map(
    shipments.flatMap((s) => (s.carrier_parcels ?? []).map((c) => [`${s.order_group_id.toString()}|${String(c.parcel_no)}`, c.fee?.service_fee ?? null] as const)),
  );

  const settings = await db
    .collection<{ est_fee_first_step_vnd?: number; est_fee_per_extra_step_vnd?: number }>('packing_settings')
    .findOne({}, { projection: { est_fee_first_step_vnd: 1, est_fee_per_extra_step_vnd: 1 } });
  const fee = {
    firstStepVnd: settings?.est_fee_first_step_vnd ?? DEFAULT_FEE_ESTIMATE.firstStepVnd,
    perExtraStepVnd: settings?.est_fee_per_extra_step_vnd ?? DEFAULT_FEE_ESTIMATE.perExtraStepVnd,
  };
  // shortcut: một bước cước chung cho cả báo cáo (kế hoạch mới nhất ghi gì dùng nấy), tách theo hãng khi có hãng thứ 2.
  const stepG = plans.find((p) => p.solver?.inputs?.billing_step_g)?.solver?.inputs?.billing_step_g ?? 500;

  const parcels: AccuracyParcel[] = plans.flatMap((plan) =>
    plan.parcels
      .filter((p) => (p.actual_weight_kg ?? 0) > 0)
      .map((p) => ({
        group: plan.order_group_id.toString(),
        parcel_no: p.parcel_no,
        box_code: p.box.code,
        skus: p.placements.map((q) => q.sku),
        items_weight_g: p.items_weight_g,
        estimated_weight_g: p.estimated_weight_g,
        volumetric_weight_g: p.volumetric_weight_g,
        actual_weight_g: Math.round((p.actual_weight_kg ?? 0) * 1000),
        carrier_service_fee_vnd: serviceFee.get(`${plan.order_group_id.toString()}|${String(p.parcel_no)}`) ?? null,
      })),
  );

  const report = packingAccuracy(parcels, stepG, fee);
  console.log(
    JSON.stringify(
      {
        kien_da_can: report.parcels,
        lech_can_trung_binh_g: report.weight.mean_abs_error_g,
        lech_can_trung_binh_pct: report.weight.mean_abs_error_pct,
        engine_doan_nhe_hon_thuc_te_pct: report.weight.mean_error_pct,
        kien_lech_duoi_10pct: report.weight.within_10pct,
        kien_dung_bac_cuoc: report.same_bracket,
        buoc_cuoc_g: stepG,
        kien_co_cuoc_ghn: report.fee.parcels,
        cuoc_ghn_tru_uoc_tinh_trung_binh_vnd: report.fee.mean_diff_vnd,
      },
      null,
      2,
    ),
  );
  if (report.by_box.length) console.table(report.by_box);
  if (report.fee.rows.length) console.table(report.fee.rows);
  console.log(report.sku_suggestions.length ? 'Đề xuất sửa cân SKU (Admin đo lại rồi sửa ở hồ sơ SKU):' : 'Chưa có SKU nào đủ dữ liệu để đề xuất sửa cân.');
  if (report.sku_suggestions.length) console.table(report.sku_suggestions);
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await mongoose.disconnect();
  process.exitCode = 1;
});
