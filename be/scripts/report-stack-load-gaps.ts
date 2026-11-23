import mongoose from 'mongoose';
import { expandToUnits, FLAT_CATEGORIES } from '../src/modules/packaging/engine/units';
import type { BoxSpec } from '../src/modules/packaging/engine/types';
import { solveOrder } from '../src/modules/packing/solver';

/**
 * ===================================================================
 * Báo cáo SKU hàng cứng đã đo nhưng chưa nhập sức chịu đè (audit 20/11/2026, OPT-8)
 * ===================================================================
 * CHỈ ĐỌC. Hàng cứng để trống `max_stack_load_kg` bị engine coi là KHÔNG cho
 * đặt gì lên (quần áo trống = 5 kg). Script liệt kê các SKU đó và mô phỏng
 * đơn N món cùng SKU với danh mục thùng đang dùng: số kiện khi để trống so
 * với khi nhập thử `--kg`. Đội kho đo và điền số thật vào Product Master —
 * script không ghi gì.
 *
 * Chạy:  npx ts-node --transpile-only -r dotenv/config scripts/report-stack-load-gaps.ts [--qty=4] [--kg=3]
 * ===================================================================
 */

interface ProfileRow {
  seller_sku: string;
  shop_id: string;
  product_category?: string | null;
  is_fragile?: boolean;
  orientation_rule?: 'any' | 'upright_only';
  dimension?: { package_length_cm?: number; package_width_cm?: number; package_height_cm?: number; package_weight_kg?: number };
}

interface MaterialRow {
  code: string;
  name: string;
  inner?: { length_mm: number; width_mm: number; height_mm: number } | null;
  outer?: { length_mm: number; width_mm: number; height_mm: number } | null;
  tare_g: number | null;
  max_load_g: number | null;
  unit_cost_vnd: number | null;
}

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  const n = hit ? Number(hit.split('=')[1]) : fallback;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} phải là số dương.`);
  return n;
};

async function main(): Promise<void> {
  const qty = Math.floor(arg('qty', 4));
  const kg = arg('kg', 3);
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(uri);
  const db = mongoose.connection;

  const boxes: BoxSpec[] = (
    await db
      .collection<MaterialRow>('packaging_materials')
      .find({ kind: 'box', is_active: true, inner: { $ne: null }, outer: { $ne: null }, tare_g: { $ne: null }, max_load_g: { $ne: null } })
      .project<MaterialRow>({ code: 1, name: 1, inner: 1, outer: 1, tare_g: 1, max_load_g: 1, unit_cost_vnd: 1 })
      .toArray()
  ).flatMap((m) =>
    m.inner && m.outer && m.tare_g !== null && m.max_load_g !== null
      ? [{ code: m.code, name: m.name, inner: m.inner, outer: m.outer, tare_g: m.tare_g, max_load_g: m.max_load_g, price_vnd: m.unit_cost_vnd }]
      : [],
  );
  if (boxes.length === 0) throw new Error('Không có thùng đang dùng đủ số đo.');

  const rows = await db
    .collection<ProfileRow>('product_master')
    .find({
      retired: { $ne: true },
      packaging_profile_status: 'ready', // SKU chưa đo bị chặn trước bộ giải, không liên quan sức chịu đè
      is_fragile: { $ne: true },
      product_category: { $nin: [...FLAT_CATEGORIES] },
      $or: [{ max_stack_load_kg: null }, { max_stack_load_kg: { $exists: false } }],
    })
    .project<ProfileRow>({ seller_sku: 1, shop_id: 1, product_category: 1, is_fragile: 1, orientation_rule: 1, dimension: 1 })
    .toArray();

  const report = rows.flatMap((r) => {
    const d = r.dimension;
    if (!d?.package_length_cm || !d.package_width_cm || !d.package_height_cm || !d.package_weight_kg) return [];
    const base = {
      sku: r.seller_sku,
      quantity: qty,
      length_cm: d.package_length_cm,
      width_cm: d.package_width_cm,
      height_cm: d.package_height_cm,
      weight_kg: d.package_weight_kg,
      is_fragile: false,
      orientation_rule: r.orientation_rule ?? 'any',
      product_category: r.product_category ?? null,
    } as const;
    const now = solveOrder(expandToUnits([{ ...base, max_stack_load_kg: null }]), boxes, { maxEvaluations: 1500 });
    const withKg = solveOrder(expandToUnits([{ ...base, max_stack_load_kg: kg }]), boxes, { maxEvaluations: 1500 });
    return [{
      shop_id: r.shop_id,
      sku: r.seller_sku,
      category: r.product_category ?? '-',
      size_cm: `${String(d.package_length_cm)}×${String(d.package_width_cm)}×${String(d.package_height_cm)}`,
      kg_each: d.package_weight_kg,
      [`kien_${String(qty)}_mon_de_trong`]: now.parcels.length,
      [`kien_${String(qty)}_mon_chiu_${String(kg)}kg`]: withKg.parcels.length,
      bot_kien: now.parcels.length - withKg.parcels.length,
    }];
  });
  report.sort((a, b) => b.bot_kien - a.bot_kien || a.sku.localeCompare(b.sku));
  const noFit = report.filter((r) => r[`kien_${String(qty)}_mon_de_trong`] === 0);
  const saving = report.filter((r) => r.bot_kien > 0);
  console.log(
    JSON.stringify(
      {
        sku_hang_cung_chua_nhap_suc_chiu_de: rows.length,
        trong_do_chua_gan_loai_san_pham: rows.filter((r) => !r.product_category).length,
        thieu_so_do_khong_mo_phong_duoc: rows.length - report.length,
        khong_vua_thung_nao_dang_dung: noFit.length,
        [`bot_kien_khi_chiu_${String(kg)}kg`]: saving.length,
      },
      null,
      2,
    ),
  );
  if (saving.length > 0) console.table(saving.slice(0, 50));
  if (noFit.length > 0) console.log(`Không vừa thùng nào (kiểm tra số đo): ${noFit.slice(0, 20).map((r) => `${r.sku} ${r.size_cm}`).join('; ')}${noFit.length > 20 ? ' …' : ''}`);
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await mongoose.disconnect();
  process.exitCode = 1;
});
