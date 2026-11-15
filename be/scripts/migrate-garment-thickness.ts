import { writeFileSync } from 'fs';
import mongoose from 'mongoose';
import { ProductCategory } from '../src/common/enums/product-category.enum';
import { garmentThicknessCm, thicknessWarning } from '../src/modules/product-master/garment-thickness';

/**
 * ===================================================================
 * Sửa độ dày hồ sơ quần áo cũ theo GSM (13/11/2026, user chốt)
 * ===================================================================
 * docs/PACKAGING_STANDARD.md §5.2. Chỉ đụng hồ sơ quần áo có độ dày lệch quá
 * 50% so với số tính từ GSM (đúng các hồ sơ API sẽ cảnh báo). Ghi lại
 * `dimension.package_height_cm` theo công thức; KHÔNG đụng dài/rộng/cân.
 * `fabric_gsm` để nguyên (null = GSM mặc định của loại — chưa ai đo GSM thật).
 * Giá trị cũ ghi ra file backup JSON trước khi ghi.
 * Kế hoạch đóng gói đã tính KHÔNG tự cập nhật — bấm "Tính lại" ở đơn cần.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/migrate-garment-thickness.ts           (chạy thử)
 *        npx ts-node -r dotenv/config scripts/migrate-garment-thickness.ts --apply   (ghi thật)
 * ===================================================================
 */

/** Gán loại "áo thun" nhưng mã giống size dép — chỉ in ra để người kiểm tra, không sửa. */
const SUSPECT_CATEGORY = new Set(['SLL-BRN-37']);

interface ProfileRow {
  _id: mongoose.Types.ObjectId;
  seller_sku: string;
  shop_id: string;
  product_category: ProductCategory;
  fabric_gsm?: number | null;
  dimension: { package_height_cm: number };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(uri);
  const col = mongoose.connection.collection<ProfileRow>('product_master');
  console.log(apply ? '== GHI THẬT ==' : '== CHẠY THỬ (thêm --apply để ghi) ==');

  const rows = await col
    .find(
      { 'dimension.package_height_cm': { $gt: 0 }, product_category: { $exists: true } },
      { projection: { seller_sku: 1, shop_id: 1, product_category: 1, fabric_gsm: 1, dimension: 1 } },
    )
    .toArray();

  const changes: { row: ProfileRow; to: number }[] = [];
  for (const row of rows) {
    const gsm = row.fabric_gsm ?? null;
    if (thicknessWarning(row.product_category, gsm, row.dimension.package_height_cm) === null) continue;
    if (SUSPECT_CATEGORY.has(row.seller_sku)) {
      console.log(`BỎ QUA ${row.seller_sku} (${row.shop_id}): nghi gán sai loại "${row.product_category}" — kiểm tra tay.`);
      continue;
    }
    const to = garmentThicknessCm(row.product_category, gsm);
    if (to !== null) changes.push({ row, to });
  }

  for (const { row, to } of changes) {
    console.log(`${row.seller_sku.padEnd(22)} ${row.shop_id.padEnd(18)} ${row.product_category.padEnd(9)} ${String(row.dimension.package_height_cm)} cm → ${String(to)} cm`);
  }
  console.log(`Tổng: ${String(changes.length)} hồ sơ cần sửa.`);

  if (apply && changes.length > 0) {
    const backup = `garment-thickness-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(
      backup,
      JSON.stringify(
        changes.map(({ row }) => ({ _id: row._id.toString(), seller_sku: row.seller_sku, package_height_cm: row.dimension.package_height_cm })),
        null,
        2,
      ),
    );
    console.log(`Đã ghi backup: ${backup}`);
    await col.bulkWrite(
      changes.map(({ row, to }) => ({
        updateOne: {
          // Điều kiện kèm số cũ: hồ sơ vừa được sửa tay trong lúc chạy thì bỏ qua.
          filter: { _id: row._id, 'dimension.package_height_cm': row.dimension.package_height_cm },
          update: { $set: { 'dimension.package_height_cm': to } },
        },
      })),
    );
    console.log('Đã ghi.');
  }
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
