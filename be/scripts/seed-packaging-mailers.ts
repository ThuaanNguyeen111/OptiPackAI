import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  PackagingMaterial,
  PackagingMaterialDocument,
} from '../src/modules/packaging-materials/schemas/packaging-material.schema';
import {
  DEFAULT_MAILER_MAX_LOAD_G,
  PackagingMaterialsService,
} from '../src/modules/packaging-materials/packaging-materials.service';

/**
 * ===================================================================
 * Seed túi niêm phong MẪU (AOFP-224, 31/10/2026)
 * ===================================================================
 * 4 cỡ có sẵn trên thị trường VN (docs/PACKAGING_STANDARD.md §4.4,
 * nguồn docs/research/PACKAGING_SOURCES.md). Khối lượng túi suy từ số
 * túi/kg của nhà sản xuất (20×30 ≈ 179 túi/kg ≈ 5,6 g), giá là SỐ GIẢ LẬP
 * (is_sample: true) — sửa qua PATCH /packaging-materials/:code khi có báo
 * giá thật. Chỉ tạo mã chưa tồn tại, mỗi mã mới nhập tồn qua stock-in
 * (có dòng sổ); chạy lại nhiều lần an toàn.
 *      npx ts-node scripts/seed-packaging-mailers.ts
 * ===================================================================
 */

const SAMPLE_MAILERS = [
  { code: 'MAILER-20X30', name: 'Túi niêm phong 20×30 (mẫu)', width_cm: 20, length_cm: 30, tare_g: 6, price_vnd: 600 },
  { code: 'MAILER-25X35', name: 'Túi niêm phong 25×35 (mẫu)', width_cm: 25, length_cm: 35, tare_g: 8, price_vnd: 800 },
  { code: 'MAILER-32X45', name: 'Túi niêm phong 32×45 (mẫu)', width_cm: 32, length_cm: 45, tare_g: 13, price_vnd: 1200 },
  { code: 'MAILER-38X52', name: 'Túi niêm phong 38×52 (mẫu)', width_cm: 38, length_cm: 52, tare_g: 18, price_vnd: 1600 },
] as const;

const SAMPLE_STOCK = 200;

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const materialModel = app.get<Model<PackagingMaterialDocument>>(getModelToken(PackagingMaterial.name));
  const materialsService = app.get(PackagingMaterialsService);

  let created = 0;
  for (const m of SAMPLE_MAILERS) {
    const result = await materialModel.updateOne(
      { code: m.code },
      {
        $setOnInsert: {
          code: m.code,
          name: m.name,
          kind: 'mailer',
          length_cm: m.length_cm,
          width_cm: m.width_cm,
          height_cm: null,
          flat: { width_mm: m.width_cm * 10, length_mm: m.length_cm * 10 },
          tare_g: m.tare_g,
          max_load_g: DEFAULT_MAILER_MAX_LOAD_G,
          unit_cost_vnd: m.price_vnd,
          reusable: false,
          qty_new: 0,
          qty_reused: 0,
          reorder_level: 50,
          is_sample: true,
          is_active: true,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      const doc = await materialModel.findOne({ code: m.code }).select('_id').lean();
      if (doc) await materialsService.stockInById(doc._id, SAMPLE_STOCK, null, 'Seed túi niêm phong mẫu');
    }
    created += result.upsertedCount;
  }
  console.log(`Seed túi niêm phong mẫu: tạo mới ${String(created)}/${String(SAMPLE_MAILERS.length)}.`);
  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
