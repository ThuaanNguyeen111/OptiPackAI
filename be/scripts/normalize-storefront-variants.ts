import mongoose, { Types } from 'mongoose';

/**
 * ===================================================================
 * CHUẨN HOÁ BIẾN THỂ CŨ CỦA WEBSITE AURELLE THEO QUY TẮC SKU OPTIPACK — 22/10/2026
 * ===================================================================
 * Biến thể tạo TRƯỚC khi có quy tắc SKU (màu/size gõ tự do, SKU ngẫu nhiên) làm 2 bên lệch:
 * OptiPack không tự nối được, màu không khớp danh mục màu. Script đổi các biến thể cũ
 * CHƯA CÓ ĐƠN NÀO sang SKU `{DANH MỤC CẤP 2}-{SỐ MẪU}-{MÀU}-{SIZE}`:
 *   - danh mục: mã đã lưu trên sản phẩm, không có thì lấy từ danh mục website đã nối OptiPack;
 *   - số mẫu: số đã lưu trên sản phẩm, không có thì cấp số kế tiếp trong danh mục đó;
 *   - màu: khớp tên/mã màu trong danh mục màu OptiPack (bỏ dấu, không phân biệt hoa thường);
 *   - size: phải thuộc thang size của danh mục.
 * Biến thể ĐÃ CÓ ĐƠN giữ nguyên mã (đơn cũ, liên kết kho bên OptiPack đang trỏ tới mã đó).
 * Không khớp được → in lý do để Admin sửa tay trên trang Admin website.
 *
 * Chỉ CẬP NHẬT, không xoá gì. Mặc định CHẠY THỬ. Thêm --apply để ghi. Chạy lại an toàn.
 *   cd be
 *   npx ts-node -r dotenv/config scripts/normalize-storefront-variants.ts
 *   npx ts-node -r dotenv/config scripts/normalize-storefront-variants.ts --apply
 * ===================================================================
 */
const APPLY = process.argv.includes('--apply');

interface ProductRow { _id: Types.ObjectId; name: string; category_id: Types.ObjectId | null; sku_category_code?: string | null; sku_model_no?: number | null }
interface VariantRow { _id: Types.ObjectId; product_id: Types.ObjectId; sku: string; color: string | null; size: string | null }
interface CategoryRow { _id: Types.ObjectId; name: string; sku_category_code?: string | null }
interface SkuCategoryRow { code: string; size_scale: string[] }
interface ColorRow { code: string; name: string }

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').trim().toLowerCase();
}

/** Màu tự do → mã màu OptiPack (khớp tên hoặc mã sau khi bỏ dấu). */
export function matchColorCode(raw: string | null, colors: ColorRow[]): string | null {
  if (!raw) return null;
  const key = foldText(raw);
  return colors.find((c) => foldText(c.name) === key || c.code.toLowerCase() === key)?.code ?? null;
}

async function run(): Promise<void> {
  for (const arg of process.argv.slice(2)) {
    if (arg !== '--apply') throw new Error(`Không hiểu tham số "${arg}" (chỉ nhận --apply).`);
  }
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai');
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được kết nối database.');
  console.log(`Database: ${db.databaseName} — chế độ: ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'}`);

  const [legacy, colors, skuCategories, siteCategories] = await Promise.all([
    db.collection<VariantRow>('storefront_product_variants')
      .find({ is_active: true, $or: [{ sku_color_code: null }, { sku_color_code: { $exists: false } }] })
      .toArray(),
    db.collection<ColorRow>('colors').find({ is_active: true }).toArray(),
    db.collection<SkuCategoryRow>('categories').find({ level: 2, is_active: true }).toArray(),
    db.collection<CategoryRow>('storefront_categories').find({}).toArray(),
  ]);
  if (legacy.length === 0) {
    console.log('Không còn biến thể cũ nào — đã chuẩn hoá hết.');
    await mongoose.disconnect();
    return;
  }
  const withOrders = new Set(
    (await db.collection('storefront_order_items').distinct('variant_id', { variant_id: { $in: legacy.map((v) => v._id) } }))
      .map(String),
  );
  const products = new Map(
    (await db.collection<ProductRow>('storefront_products').find({ _id: { $in: [...new Set(legacy.map((v) => v.product_id.toString()))].map((id) => new Types.ObjectId(id)) } }).toArray())
      .map((p) => [p._id.toString(), p]),
  );
  const scaleOf = new Map(skuCategories.map((c) => [c.code, c.size_scale]));
  const siteLink = new Map(siteCategories.map((c) => [c._id.toString(), c.sku_category_code ?? null]));

  /** Số mẫu lớn nhất đã dùng theo danh mục (sản phẩm website + SKU nội bộ OptiPack). */
  const maxModel = new Map<string, number>();
  for (const p of await db.collection<ProductRow>('storefront_products').find({ sku_model_no: { $ne: null } }).toArray()) {
    if (p.sku_category_code && p.sku_model_no) maxModel.set(p.sku_category_code, Math.max(maxModel.get(p.sku_category_code) ?? 0, p.sku_model_no));
  }
  for (const m of await db.collection<{ category_code: string; model_no: number }>('master_skus').find({}).toArray()) {
    maxModel.set(m.category_code, Math.max(maxModel.get(m.category_code) ?? 0, m.model_no));
  }

  const takenSkus = new Set((await db.collection<{ sku: string }>('storefront_product_variants').find({}, { projection: { sku: 1 } }).toArray()).map((v) => v.sku));
  const assignedModel = new Map<string, number>(); // productId → số mẫu cấp trong lượt chạy
  let changed = 0;
  let skipped = 0;
  for (const variant of legacy) {
    const product = products.get(variant.product_id.toString());
    const label = `${product?.name ?? '?'} / ${variant.sku}`;
    const skip = (why: string): void => {
      skipped += 1;
      console.log(`  BỎ QUA ${label}: ${why}`);
    };
    if (!product) { skip('không thấy sản phẩm'); continue; }
    if (withOrders.has(variant._id.toString())) { skip('đã có đơn — giữ mã cũ'); continue; }
    const categoryCode = product.sku_category_code ?? (product.category_id ? siteLink.get(product.category_id.toString()) : null) ?? null;
    if (!categoryCode) { skip('chưa có danh mục OptiPack (nối danh mục website ở trang Admin → Danh mục)'); continue; }
    const scale = scaleOf.get(categoryCode);
    if (!scale) { skip(`danh mục ${categoryCode} không phải danh mục cấp 2 đang dùng`); continue; }
    const colorCode = matchColorCode(variant.color, colors);
    if (!colorCode) { skip(`màu "${variant.color ?? ''}" không có trong danh mục màu OptiPack`); continue; }
    const size = (variant.size ?? '').trim().toUpperCase();
    if (!scale.includes(size)) { skip(`size "${variant.size ?? ''}" không thuộc thang size ${categoryCode} (${scale.join(', ')})`); continue; }

    let modelNo = product.sku_model_no ?? assignedModel.get(product._id.toString()) ?? null;
    if (!modelNo) {
      modelNo = (maxModel.get(categoryCode) ?? 0) + 1;
      if (modelNo > 999) { skip(`danh mục ${categoryCode} đã hết số mẫu`); continue; }
      maxModel.set(categoryCode, modelNo);
      assignedModel.set(product._id.toString(), modelNo);
    }
    const sku = `${categoryCode}-${String(modelNo).padStart(3, '0')}-${colorCode}-${size}`;
    if (takenSkus.has(sku)) { skip(`mã mới ${sku} đã có`); continue; }
    takenSkus.add(sku);
    const colorName = colors.find((c) => c.code === colorCode)?.name ?? variant.color;
    changed += 1;
    console.log(`  ${label} → ${sku}`);
    if (!APPLY) continue;
    await db.collection('storefront_product_variants').updateOne(
      { _id: variant._id },
      { $set: { sku, sku_color_code: colorCode, color: colorName, size, variant_name: `${colorName ?? ''} / ${size}`, updated_at: new Date() } },
    );
    await db.collection('storefront_products').updateOne(
      { _id: product._id, $or: [{ sku_model_no: null }, { sku_model_no: { $exists: false } }] },
      { $set: { sku_category_code: categoryCode, sku_model_no: modelNo, updated_at: new Date() } },
    );
  }
  console.log(`Xong: ${String(changed)} biến thể ${APPLY ? 'đã đổi' : 'sẽ đổi'}, ${String(skipped)} bỏ qua.`);
  if (!APPLY && changed > 0) console.log('Chạy lại với --apply để ghi. Sau đó bấm "Đồng bộ sản phẩm" bên OptiPack để tự nối SKU.');
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(async (error: unknown) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
