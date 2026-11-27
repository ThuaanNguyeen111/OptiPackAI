import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import { join } from 'path';
import { inspectGlb } from '../src/modules/product-models/glb-inspect';

/**
 * ===================================================================
 * AOFP-352 (27/11/2026) — thư viện mô hình 3D (docs/specs/PRODUCT_3D_MODELS.md §6).
 * ===================================================================
 * 1. Nạp 9 "mô hình theo loại" từ fe/public/models (đọc khối bao + rig gập từ chính file GLB).
 * 2. Nạp 1 "hình đại diện" (hộp không bo góc) cho dép / khác / chưa có loại.
 * 3. Gắn model_id cho mọi SKU product_master chưa có — PHẢI chạy trước khi deploy BE có cổng
 *    `missing_model`, nếu không SKU ready cũ sẽ bị chặn đóng gói.
 * Chạy lại an toàn: mô hình upsert theo category_key, SKU đã có model_id giữ nguyên.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/migrate-product-models.ts           (chạy thử)
 *        npx ts-node -r dotenv/config scripts/migrate-product-models.ts --apply   (ghi thật)
 * ===================================================================
 */

/** Khớp ITEM_MODELS ở fe/src/components/packing/product-models.ts. */
export const CATEGORY_MODELS: { category: string; name: string; path: string; kind: 'garment' | 'rigid' }[] = [
  { category: 'shirt', name: 'Áo sơ mi / polo (theo loại)', path: '/models/somi.glb', kind: 'garment' },
  { category: 't_shirt', name: 'Áo thun (theo loại)', path: '/models/tshirt.glb', kind: 'garment' },
  { category: 'trousers', name: 'Quần dài (theo loại)', path: '/models/pants.glb', kind: 'garment' },
  { category: 'shorts', name: 'Quần short (theo loại)', path: '/models/shorts.glb', kind: 'garment' },
  { category: 'dress', name: 'Váy / đầm (theo loại)', path: '/models/dress.glb', kind: 'garment' },
  { category: 'jacket', name: 'Áo khoác (theo loại)', path: '/models/bomber.glb', kind: 'garment' },
  { category: 'shoes', name: 'Giày trong hộp (theo loại)', path: '/models/shoepack.glb', kind: 'rigid' },
  { category: 'bag', name: 'Túi xách (theo loại)', path: '/models/handbag.glb', kind: 'rigid' },
  { category: 'accessory', name: 'Phụ kiện trong hộp (theo loại)', path: '/models/materials/accessory_case.glb', kind: 'rigid' },
];

export const PLACEHOLDER_NAME = 'Hình đại diện — dựng từ kích thước';

const FE_PUBLIC = join(__dirname, '..', '..', 'fe', 'public');

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không mở được DB.');
  const models = db.collection('product_models');
  const products = db.collection('product_master');
  const now = new Date();

  const idByCategory = new Map<string, mongoose.Types.ObjectId>();
  for (const m of CATEGORY_MODELS) {
    const inspected = inspectGlb(readFileSync(join(FE_PUBLIC, m.path)));
    if (!inspected.ok) throw new Error(`${m.path} không đọc được: ${inspected.reason}`);
    if (m.kind === 'garment' && !inspected.hasFoldRig) throw new Error(`${m.path} thiếu rig gập.`);
    const existing = await models.findOne({ source: 'category', category_key: m.category });
    console.log(`${existing ? '=' : '+'} ${m.category.padEnd(10)} ${m.path}  rig=${String(inspected.hasFoldRig)}`);
    if (existing) {
      idByCategory.set(m.category, existing._id);
      continue;
    }
    const _id = new mongoose.Types.ObjectId();
    idByCategory.set(m.category, _id);
    if (apply) {
      await models.insertOne({
        _id,
        name: m.name,
        source: 'category',
        kind: m.kind,
        category_key: m.category,
        version: 1,
        file: { url: m.path, public_id: null, bytes: null, sha256: null },
        primitive: null,
        bbox_m: inspected.bbox,
        has_fold_rig: inspected.hasFoldRig,
        credit: { type: 'self_made', url: null, license: null },
        status: 'active',
        history: [],
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  let placeholder = await models.findOne({ source: 'primitive', name: PLACEHOLDER_NAME, 'primitive.shape': 'box' });
  const placeholderId = (placeholder?._id) ?? new mongoose.Types.ObjectId();
  console.log(`${placeholder ? '=' : '+'} hình đại diện (hộp)`);
  if (!placeholder && apply) {
    await models.insertOne({
      _id: placeholderId,
      name: PLACEHOLDER_NAME,
      source: 'primitive',
      kind: 'rigid',
      category_key: null,
      version: 1,
      file: null,
      primitive: {
        shape: 'box',
        corner_radius_pct: 0,
        cap_height_pct: null,
        shoulder_pct: null,
        neck_height_pct: null,
        neck_diameter_pct: null,
        crimp_pct: null,
        body_color: '#94a3b8',
        cap_color: null,
      },
      bbox_m: null,
      has_fold_rig: false,
      credit: { type: 'self_made', url: null, license: null },
      status: 'active',
      history: [],
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now,
    });
    placeholder = { _id: placeholderId };
  }

  const missing = await products.find({ $or: [{ model_id: null }, { model_id: { $exists: false } }] }).project({ product_category: 1 }).toArray();
  const counts = new Map<string, number>();
  for (const p of missing) {
    const cat = typeof p.product_category === 'string' ? p.product_category : null;
    const target = (cat && idByCategory.get(cat)) ?? placeholderId;
    const key = cat && idByCategory.has(cat) ? cat : 'hình đại diện';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (apply) await products.updateOne({ _id: p._id as mongoose.Types.ObjectId, model_id: { $in: [null] } }, { $set: { model_id: target } });
  }
  console.log(`SKU chưa có mô hình: ${String(missing.length)}`);
  for (const [k, n] of counts) console.log(`  ${k.padEnd(14)} ${String(n)}`);
  console.log(apply ? 'Đã ghi.' : 'Chạy thử — thêm --apply để ghi.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
