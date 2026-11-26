import { writeFileSync } from 'fs';
import mongoose from 'mongoose';

/**
 * ===================================================================
 * AOFP-344 (26/11/2026, user chốt) — gối hơi chèn kín 90% lòng thùng
 * ===================================================================
 * Lưu bộ luật vật tư version mới: chép bộ luật đang dùng, thay luật gối hơi
 * theo bậc (`void_band`, tối đa vài cái) bằng `void_fill` — đủ gối để hàng + chèn
 * kín 90% lòng thùng, 800 ml/gối (giả định, kho đo gối thật rồi sửa trên màn
 * Vật tư). Làm giống PackagingMaterialService.saveRules: thêm version mới, tắt
 * bản cũ (giữ lịch sử). Kế hoạch đã tính KHÔNG tự cập nhật.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/apply-void-fill-rules.ts           (chạy thử)
 *        npx ts-node -r dotenv/config scripts/apply-void-fill-rules.ts --apply   (ghi thật)
 * ===================================================================
 */

const VOID_FILL = { basis: 'void_fill', quantity: 0, void_bands: [], target_fill_ratio: 0.9, unit_fill_ml: 800 };

interface RuleEntry {
  material_type: string;
  applies_to: string;
  basis: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(uri);
  console.log(apply ? '== GHI THẬT ==' : '== CHẠY THỬ (thêm --apply để ghi) ==');
  const col = mongoose.connection.collection<{ version: number; rules: RuleEntry[]; is_active: boolean }>('packaging_material_rules');

  const active = await col.findOne({ is_active: true }, { sort: { version: -1 } });
  if (!active) throw new Error('Chưa có bộ luật nào trong DB — engine đang dùng luật mặc định (đã là void_fill).');
  const latest = await col.findOne({}, { sort: { version: -1 }, projection: { version: 1 } });
  const version = (latest?.version ?? 0) + 1;

  let replaced = 0;
  const rules = active.rules.map((r) => {
    if (r.material_type !== 'air_pillow' || r.applies_to !== 'any' || r.basis !== 'void_band') return r;
    replaced += 1;
    return { ...r, ...VOID_FILL };
  });
  if (replaced === 0) rules.push({ material_type: 'air_pillow', applies_to: 'any', min_units: 1, ...VOID_FILL });
  console.log(`Bộ luật v${String(active.version)} → v${String(version)}: ${replaced > 0 ? 'thay' : 'thêm'} luật gối hơi = void_fill 90%, 800 ml/gối.`);

  if (apply) {
    const backup = `material-rules-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(backup, JSON.stringify(active, null, 2));
    console.log(`Đã ghi backup: ${backup}`);
    const session = await mongoose.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await col.insertOne(
          { version, rules, updated_by: null, is_active: true, created_at: new Date() } as never,
          { session },
        );
        await col.updateMany({ version: { $ne: version }, is_active: true }, { $set: { is_active: false } }, { session });
      });
    } finally {
      await session.endSession();
    }
    console.log('Đã ghi.');
  }
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
