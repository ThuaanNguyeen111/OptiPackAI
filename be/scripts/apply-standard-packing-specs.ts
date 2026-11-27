import { writeFileSync } from 'fs';
import mongoose, { type Model } from 'mongoose';
import { ProductCategory } from '../src/common/enums/product-category.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';
import type { OuterRequirement } from '../src/common/enums/outer-requirement.enum';
import { OrderGroup, OrderGroupSchema } from '../src/modules/order-groups/schemas/order-group.schema';
import { PackagingBag, PackagingBagSchema } from '../src/modules/packaging/schemas/packaging-bag.schema';
import { PackingPlan, PackingPlanSchema } from '../src/modules/packing/schemas/packing-plan.schema';
import type { ConfirmPackagingProfileDto } from '../src/modules/product-master/dto/confirm-packaging-profile.dto';
import { ProductMasterService } from '../src/modules/product-master/product-master.service';
import { ProductMaster, ProductMasterSchema } from '../src/modules/product-master/schemas/product-master.schema';

/**
 * ===================================================================
 * AOFP-343 (26/11/2026, user chốt) — nạp thông số đóng gói chuẩn
 * ===================================================================
 * Quần áo theo khuôn gấp (GLOSSARY "Khuôn gấp"): mọi size chung dài × rộng,
 * độ dày bỏ trống để BE tính từ GSM, size chỉ đổi cân nặng. Đã kiểm 1.364 tổ
 * hợp đơn 1–4 món đều vừa 1 kiện với danh mục thùng sau khi đổi BOX-S (issue #211).
 *
 * Ghi qua `ProductMasterService.confirmPackagingProfile` (không boot app, không
 * chạy cron) để có đủ kiểm tra túi zip và gỡ kẹt nhóm đơn như khi kho bấm xác nhận.
 * Kế hoạch đóng gói đã tính KHÔNG tự cập nhật — bấm "Tính lại" ở đơn cần.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/apply-standard-packing-specs.ts           (chạy thử)
 *        npx ts-node -r dotenv/config scripts/apply-standard-packing-specs.ts --apply   (ghi thật)
 * ===================================================================
 */

const SHOP_ID = '201182096267';

interface ModelSpec {
  category: ProductCategory;
  /** [dài, rộng] cho quần áo (độ dày tính từ GSM) hoặc [dài, rộng, cao]. */
  dims: [number, number] | [number, number, number];
  /** Cân (kg) theo size = đoạn cuối của seller_sku. */
  kgBySize: Record<string, number>;
  fragile?: boolean;
  upright?: boolean;
  stackKg?: number | null;
  zip?: string;
  outer: OuterRequirement;
}

const garment = (category: ProductCategory, dims: [number, number], kgBySize: Record<string, number>): ModelSpec => ({
  category,
  dims,
  kgBySize,
  zip: 'ZIP-S',
  outer: 'mailer_ok',
});

export const STANDARD_SPECS: Record<string, ModelSpec> = {
  'AOTHUN-001': garment(ProductCategory.T_SHIRT, [30, 22], { S: 0.18, M: 0.2, L: 0.22 }),
  'SOMI-002': garment(ProductCategory.SHIRT, [30, 22], { M: 0.22, L: 0.24 }),
  'KHOAC-003': garment(ProductCategory.JACKET, [30, 22], { M: 0.45, L: 0.5, XL: 0.55 }),
  'DAM-004': garment(ProductCategory.DRESS, [30, 22], { M: 0.3, L: 0.32 }),
  'VAY-005': garment(ProductCategory.DRESS, [30, 22], { S: 0.2, M: 0.22 }),
  'QUANDAI-006': garment(ProductCategory.TROUSERS, [30, 22], { M: 0.5, L: 0.55 }),
  'SHORT-007': garment(ProductCategory.SHORTS, [22, 15], { L: 0.22 }),
  // Đôi dép đặt cạnh nhau, đế úp xuống.
  'DEP-008': { category: ProductCategory.SANDALS, dims: [29, 20, 5], kgBySize: { '27': 0.45, '28': 0.5 }, stackKg: 3, zip: 'ZIP-M', outer: 'mailer_ok' },
  'TUIXACH-009': { category: ProductCategory.BAG, dims: [18, 6, 10], kgBySize: { '18': 0.5 }, upright: true, stackKg: 1, outer: 'box_required' },
  'MATKINH-010': { category: ProductCategory.ACCESSORY, dims: [16, 7, 6], kgBySize: { '48': 0.15, '52': 0.15 }, fragile: true, upright: true, outer: 'box_required' },
  'MU-011': { category: ProductCategory.ACCESSORY, dims: [26, 19, 12], kgBySize: { '54': 0.12 }, upright: true, stackKg: 0.5, outer: 'box_required' },
};

/** BOX-S: lòng 20×15×10 → 31×23×12 cm để vừa khuôn gấp 30×22 và mũ 26×19×12. */
const BOX_S_FROM = { length_mm: 200, width_mm: 150, height_mm: 100 };
const BOX_S_TO = {
  name: 'Thùng carton S',
  inner: { length_mm: 310, width_mm: 230, height_mm: 120 },
  outer: { length_mm: 316, width_mm: 236, height_mm: 126 },
  length_cm: 31.6,
  width_cm: 23.6,
  height_cm: 12.6,
  tare_g: 140,
  unit_cost_vnd: 3200,
};

export function specDto(sellerSku: string): ConfirmPackagingProfileDto | null {
  const spec = Object.entries(STANDARD_SPECS).find(([m]) => sellerSku.startsWith(`${m}-`))?.[1];
  if (!spec) return null;
  const size = sellerSku.slice(sellerSku.lastIndexOf('-') + 1);
  const kg = spec.kgBySize[size];
  if (kg === undefined) throw new Error(`${sellerSku}: chưa có cân cho size "${size}".`);
  return {
    length_cm: spec.dims[0],
    width_cm: spec.dims[1],
    ...(spec.dims.length === 3 && { height_cm: spec.dims[2] }),
    fabric_gsm: null,
    weight_kg: kg,
    is_fragile: spec.fragile ?? false,
    orientation_rule: spec.upright ? 'upright_only' : 'any',
    max_stack_load_kg: spec.stackKg ?? null,
    product_category: spec.category,
    zip_bag_code: spec.zip ?? null,
    zip_bag_folded: false,
    can_fold_in_half: spec.dims.length === 2,
    outer_requirement: spec.outer,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(uri);
  console.log(apply ? '== GHI THẬT ==' : '== CHẠY THỬ (thêm --apply để ghi) ==');

  const pmModel = mongoose.model(ProductMaster.name, ProductMasterSchema);
  const bagModel = mongoose.model(PackagingBag.name, PackagingBagSchema);
  const service = new ProductMasterService(
    pmModel as never,
    null as never, // orderModel — không dùng khi xác nhận hồ sơ
    bagModel as never,
    null as never,
    {},
    mongoose.model(OrderGroup.name, OrderGroupSchema) as never,
    mongoose.model(PackingPlan.name, PackingPlanSchema) as never,
  );

  const admin = await mongoose.connection
    .collection('users')
    .findOne({ role: UserRole.ADMIN, is_active: true }, { sort: { created_at: 1 }, projection: { name: 1 } });
  if (!admin) throw new Error('Không có Admin đang hoạt động để ghi người xác nhận.');

  const products = await (pmModel as Model<ProductMaster>)
    .find({ platform: MarketplacePlatform.LAZADA, shop_id: SHOP_ID, retired: { $ne: true } })
    .lean();
  const plan = products.flatMap((p) => {
    const dto = specDto(p.seller_sku);
    return dto ? [{ p, dto }] : [];
  });
  const skipped = products.filter((p) => !specDto(p.seller_sku)).map((p) => p.seller_sku);

  for (const { p, dto } of plan) {
    const d = p.dimension;
    const from = d ? `${String(d.package_length_cm)}×${String(d.package_width_cm)}×${String(d.package_height_cm)} ${String(d.package_weight_kg)}kg` : 'chưa đo';
    console.log(
      `${p.seller_sku.padEnd(26)} ${from.padEnd(20)} → ${String(dto.length_cm)}×${String(dto.width_cm)}×${String(dto.height_cm ?? 'GSM')} ${String(dto.weight_kg)}kg ${dto.product_category} ${dto.zip_bag_code ?? '—'} ${dto.outer_requirement ?? ''}`,
    );
  }
  console.log(`Tổng: ${String(plan.length)} SKU; bỏ qua (không thuộc mẫu chuẩn): ${skipped.join(', ') || 'không có'}.`);

  const materials = mongoose.connection.collection('packaging_materials');
  const boxSFilter = { code: 'BOX-S', kind: 'box', 'inner.length_mm': BOX_S_FROM.length_mm, 'inner.width_mm': BOX_S_FROM.width_mm, 'inner.height_mm': BOX_S_FROM.height_mm };
  const boxS = await materials.findOne(boxSFilter);
  const boxSOld = boxS !== null;
  console.log(`BOX-S: ${boxSOld ? 'lòng 20×15×10 → 31×23×12 cm' : 'không còn cỡ cũ — bỏ qua'}.`);

  if (apply) {
    const backup = `standard-packing-specs-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(backup, JSON.stringify({ products: plan.map(({ p }) => p), boxS }, null, 2));
    console.log(`Đã ghi backup: ${backup} (xác nhận bởi Admin "${String(admin.name)}")`);
    for (const { p, dto } of plan) {
      const { warnings } = await service.confirmPackagingProfile(String(p._id), String(admin._id), dto);
      if (warnings.length > 0) console.log(`  ${p.seller_sku}: ${warnings.join(' ')}`);
    }
    if (boxSOld) {
      // Điều kiện kèm cỡ cũ: ai vừa sửa BOX-S bằng tay thì không ghi đè.
      await materials.updateOne(
        boxSFilter,
        { $set: { ...BOX_S_TO, updated_at: new Date() } },
      );
    }
    console.log('Đã ghi.');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
