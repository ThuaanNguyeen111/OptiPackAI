import mongoose from 'mongoose';

/**
 * ===================================================================
 * Gộp kho vật tư đóng gói về MỘT collection `packaging_materials`
 * (gộp main + thi_dev 04/10/2026)
 * ===================================================================
 * Trước khi gộp, DB có thể chứa:
 *  - `packaging_materials` dạng main (kind, qty_new/qty_reused, unit_cost_vnd)
 *  - `packaging_materials` dạng thi_dev (type, quantity_on_hand,
 *    price_vnd_per_unit) — vật tư chèn của engine (CÙNG tên collection!)
 *  - `packaging_boxes` — danh mục thùng của engine (số đo mm, tồn riêng)
 *  - `packaging_stock_movements`, `packaging_material_movements` — sổ cũ
 *
 * Script này:
 *  1. Chuẩn hóa tài liệu dạng thi_dev trong `packaging_materials` sang dạng
 *     chung (kind = cushioning, material_type, qty_new, unit_cost_vnd).
 *  2. Đưa `packaging_boxes` vào `packaging_materials` (kind = box). Nếu đã có
 *     thùng cùng mã (do main tạo): CHỈ bổ sung số đo cho engine, GIỮ tồn của
 *     main (không cộng 2 lần) và in ra để kho đối chiếu tay.
 *  3. Chép sổ cũ sang `packaging_movements` (đánh dấu `migrated_from`).
 *  Không xóa collection cũ — kiểm tra xong mới tự xóa bằng tay.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/migrate-unify-packaging-materials.ts           (chạy thử)
 *        npx ts-node -r dotenv/config scripts/migrate-unify-packaging-materials.ts --apply   (ghi thật)
 * ===================================================================
 */

type Doc = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dims(value: unknown): { length_mm: number; width_mm: number; height_mm: number } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const l = num(v.length_mm, NaN);
  const w = num(v.width_mm, NaN);
  const h = num(v.height_mm, NaN);
  return Number.isFinite(l) && Number.isFinite(w) && Number.isFinite(h) ? { length_mm: l, width_mm: w, height_mm: h } : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;
  if (!db) throw new Error('Không mở được database.');
  const materials = db.collection<Doc>('packaging_materials');
  const boxes = db.collection<Doc>('packaging_boxes');
  const movements = db.collection<Doc>('packaging_movements');
  const now = new Date();
  console.log(apply ? '== GHI THẬT ==' : '== CHẠY THỬ (thêm --apply để ghi) ==');

  // 1. Vật tư chèn dạng thi_dev
  const legacyMaterials = await materials.find({ kind: { $exists: false }, type: { $exists: true } }).toArray();
  console.log(`1) Vật tư chèn dạng cũ cần chuẩn hóa: ${String(legacyMaterials.length)}`);
  for (const m of legacyMaterials) {
    console.log(`   - ${String(m.code)}: tồn ${String(num(m.quantity_on_hand))} → qty_new`);
    if (!apply) continue;
    await materials.updateOne(
      { _id: m._id },
      {
        $set: {
          kind: 'cushioning',
          material_type: m.type,
          unit_cost_vnd: num(m.price_vnd_per_unit),
          qty_new: num(m.quantity_on_hand),
          qty_reused: 0,
          qty_internal: 0,
          reusable: false,
          max_reuse_cycles: 3,
          length_cm: null,
          width_cm: null,
          height_cm: null,
          match_material_type: null,
          inner: null,
          outer: null,
          tare_g: null,
          max_load_g: null,
          updated_at: now,
        },
        $unset: { type: '', price_vnd_per_unit: '', quantity_on_hand: '' },
      },
    );
  }

  // 2. Thùng của engine
  const engineBoxes = await boxes.find({}).toArray();
  console.log(`2) Thùng trong packaging_boxes: ${String(engineBoxes.length)}`);
  const cm = (mm: number): number => Math.round(mm) / 10;
  for (const b of engineBoxes) {
    const outer = dims(b.outer);
    const inner = dims(b.inner);
    const engineFields = {
      inner,
      outer,
      tare_g: num(b.tare_g, 0),
      max_load_g: num(b.max_load_g, 1),
      reorder_level: num(b.reorder_level, 10),
      storage_location: typeof b.storage_location === 'string' ? b.storage_location : null,
      is_sample: b.is_sample === true,
    };
    const existing = await materials.findOne({ code: b.code });
    if (existing) {
      console.log(
        `   - ${String(b.code)}: ĐÃ CÓ trong kho chung (tồn ${String(num(existing.qty_new))} mới + ${String(num(existing.qty_reused))} tái SD) — chỉ bổ sung số đo; tồn cũ của engine ${String(num(b.quantity_on_hand))} KHÔNG cộng, kho đối chiếu tay.`,
      );
      if (apply) await materials.updateOne({ _id: existing._id }, { $set: { ...engineFields, kind: 'box', updated_at: now } });
      continue;
    }
    console.log(`   - ${String(b.code)}: thêm mới, tồn ${String(num(b.quantity_on_hand))} → qty_new`);
    if (!apply) continue;
    await materials.insertOne({
      _id: b._id,
      code: b.code,
      name: b.name,
      kind: 'box',
      length_cm: outer ? cm(outer.length_mm) : null,
      width_cm: outer ? cm(outer.width_mm) : null,
      height_cm: outer ? cm(outer.height_mm) : null,
      match_material_type: null,
      unit_cost_vnd: num(b.price_vnd),
      reusable: true,
      max_reuse_cycles: 3,
      qty_new: num(b.quantity_on_hand),
      qty_reused: 0,
      qty_internal: 0,
      material_type: null,
      unit: null,
      weight_g_per_unit: null,
      is_active: b.is_active !== false,
      created_at: b.created_at instanceof Date ? b.created_at : now,
      updated_at: now,
      ...engineFields,
    });
  }

  // 3. Sổ cũ
  const already = await movements.countDocuments({ migrated_from: { $exists: true } });
  if (already > 0) {
    console.log(`3) Sổ cũ đã được chép trước đó (${String(already)} dòng) — bỏ qua.`);
  } else {
    const oldRows = [
      ...(await db.collection<Doc>('packaging_stock_movements').find({}).toArray()).map((r) => ({ r, code: r.box_code })),
      ...(await db.collection<Doc>('packaging_material_movements').find({}).toArray()).map((r) => ({ r, code: r.material_code })),
    ];
    console.log(`3) Dòng sổ cũ cần chép: ${String(oldRows.length)}`);
    if (apply && oldRows.length > 0) {
      await movements.insertMany(
        oldRows.map(({ r, code }) => ({
          _id: new mongoose.Types.ObjectId(),
          material_code: code,
          condition: 'new',
          type: r.reason === 'pack' ? 'consume' : 'purchase',
          followed_recommendation: null,
          delta: num(r.delta),
          saving_vnd: 0,
          ref_type: r.order_group_id ? 'order_group' : null,
          ref_id: r.order_group_id instanceof mongoose.Types.ObjectId ? r.order_group_id.toString() : null,
          note: typeof r.note === 'string' ? r.note : null,
          actor_id: r.user_id instanceof mongoose.Types.ObjectId ? r.user_id.toString() : 'system',
          packing_plan_id: r.packing_plan_id ?? null,
          parcel_no: typeof r.parcel_no === 'number' ? r.parcel_no : null,
          balance_after: typeof r.balance_after === 'number' ? r.balance_after : null,
          created_at: r.created_at instanceof Date ? r.created_at : now,
          migrated_from: r._id,
        })),
      );
    }
  }

  console.log(apply ? 'Xong. Kiểm tra lại rồi mới xóa packaging_boxes / packaging_stock_movements / packaging_material_movements.' : 'Chạy thử xong — không ghi gì.');
  await conn.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
