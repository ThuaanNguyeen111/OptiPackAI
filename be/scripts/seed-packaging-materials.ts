import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
// Kho vật tư CHUNG (gộp main + thi_dev 04/10/2026) — vật tư chèn = kind 'cushioning'.
import {
  PackagingMaterial,
  PackagingMaterialDocument,
} from '../src/modules/packaging-materials/schemas/packaging-material.schema';
import { PackagingMaterialService } from '../src/modules/packaging/packaging-material.service';
import { DEFAULT_MATERIAL_RULES } from '../src/modules/packaging/engine';

/**
 * ===================================================================
 * Seed danh mục vật tư chèn MẪU (28/09/2026, P1)
 * ===================================================================
 * Tạo 5 vật tư mẫu (is_sample: true — SỐ GIẢ LẬP, thay bằng số thật khi
 * có: sửa qua PATCH /packaging/materials/:id, khối lượng/giá) mỗi loại
 * nhập sẵn tồn qua stock-in (có dòng sổ), và lưu bộ luật mặc định làm
 * version 1 nếu DB chưa có bộ luật nào. Chỉ tạo mã chưa tồn tại, KHÔNG
 * ghi đè vật tư thật, chạy lại nhiều lần an toàn.
 *      npx ts-node scripts/seed-packaging-materials.ts
 * ===================================================================
 */

const SAMPLE_MATERIALS = [
  { code: 'SAMPLE-FOAM-CORNER', name: 'Góc xốp bảo vệ hộp giày (mẫu)', type: 'foam_corner', unit: 'cái', weight_g_per_unit: 5, price_vnd_per_unit: 300, stock: 400 },
  { code: 'SAMPLE-DIVIDER', name: 'Tấm ngăn carton (mẫu)', type: 'corrugated_divider', unit: 'tấm', weight_g_per_unit: 40, price_vnd_per_unit: 1000, stock: 100 },
  { code: 'SAMPLE-AIR-PILLOW', name: 'Gối hơi lấp trống (mẫu)', type: 'air_pillow', unit: 'cái', weight_g_per_unit: 3, price_vnd_per_unit: 400, stock: 300 },
  { code: 'SAMPLE-BUBBLE-WRAP', name: 'Xốp hơi bọc hàng (mẫu)', type: 'bubble_wrap', unit: 'tấm', weight_g_per_unit: 10, price_vnd_per_unit: 800, stock: 200 },
  { code: 'SAMPLE-FRAGILE-TAPE', name: 'Tem cảnh báo hàng dễ vỡ (mẫu)', type: 'fragile_tape', unit: 'cái', weight_g_per_unit: 1, price_vnd_per_unit: 200, stock: 300 },
] as const;

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const materialModel = app.get<Model<PackagingMaterialDocument>>(getModelToken(PackagingMaterial.name));
  const materialService = app.get(PackagingMaterialService);

  let created = 0;
  for (const m of SAMPLE_MATERIALS) {
    const result = await materialModel.updateOne(
      { code: m.code },
      {
        $setOnInsert: {
          code: m.code,
          name: m.name,
          kind: 'cushioning',
          material_type: m.type,
          unit: m.unit,
          weight_g_per_unit: m.weight_g_per_unit,
          unit_cost_vnd: m.price_vnd_per_unit,
          reusable: false,
          qty_new: 0,
          qty_reused: 0,
          reorder_level: 20,
          is_sample: true,
          is_active: true,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      // Vật tư mẫu mới: nhập tồn qua stock-in để có dòng sổ xuất/nhập.
      const doc = await materialModel.findOne({ code: m.code }).select('_id').lean();
      if (doc) await materialService.stockIn(doc._id.toString(), m.stock, null, 'Seed vật tư mẫu');
    }
    created += result.upsertedCount;
  }
  console.log(`Seed vật tư mẫu: tạo mới ${String(created)}/${String(SAMPLE_MATERIALS.length)}.`);

  const rules = await materialService.getActiveRules();
  if (rules.isDefault) {
    // Chưa có bộ luật trong DB → lưu bản mặc định làm version 1 để Admin sửa được.
    await materialService.saveRules(
      DEFAULT_MATERIAL_RULES.map((r) => ({
        material_type: r.material_type,
        applies_to: r.applies_to,
        min_units: r.min_units,
        basis: r.basis,
        quantity: r.quantity,
        void_bands: r.void_bands,
      })),
      // saveRules cần userId hợp lệ (ObjectId) — dùng id giả của script hệ thống.
      '000000000000000000000000',
    );
    console.log('Đã lưu bộ luật vật tư mặc định (version 1).');
  } else {
    console.log(`Giữ nguyên bộ luật hiện có (version ${String(rules.version)}).`);
  }

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
