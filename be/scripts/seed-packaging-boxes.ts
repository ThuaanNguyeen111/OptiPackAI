import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  PackagingBox,
  PackagingBoxDocument,
} from '../src/modules/packaging/schemas/packaging-box.schema';

/**
 * ===================================================================
 * Seed / import danh mục thùng carton (21/09/2026, Bước 0 engine 3D)
 * ===================================================================
 * 1) Không tham số — seed 3 thùng MẪU S/M/L (is_sample: true, số giả
 *    lập). Chỉ tạo nếu mã chưa tồn tại, không ghi đè thùng thật.
 *      npx ts-node scripts/seed-packaging-boxes.ts
 *
 * 2) Có file CSV — nhập/cập nhật thùng THẬT (is_sample: false). Đơn vị
 *    trong CSV là cm và g cho dễ đo; script đổi sang mm (lòng thùng làm
 *    tròn XUỐNG, ngoài thùng làm tròn LÊN — an toàn cho việc xếp).
 *      npx ts-node scripts/seed-packaging-boxes.ts ./boxes.csv
 *    Header bắt buộc (đúng thứ tự):
 *      code,name,inner_l_cm,inner_w_cm,inner_h_cm,outer_l_cm,outer_w_cm,outer_h_cm,tare_g,max_load_g,price_vnd
 * ===================================================================
 */

const SAMPLE_BOXES = [
  { code: 'SAMPLE-S', name: 'Thùng mẫu S (số giả lập)', inner: [200, 150, 100], outer: [206, 156, 106], tare_g: 90, max_load_g: 5000, price_vnd: 2500 },
  { code: 'SAMPLE-M', name: 'Thùng mẫu M (số giả lập)', inner: [350, 250, 200], outer: [356, 256, 206], tare_g: 200, max_load_g: 10000, price_vnd: 4500 },
  { code: 'SAMPLE-L', name: 'Thùng mẫu L (số giả lập)', inner: [500, 400, 350], outer: [506, 406, 356], tare_g: 380, max_load_g: 20000, price_vnd: 8000 },
] as const;

const CSV_HEADER =
  'code,name,inner_l_cm,inner_w_cm,inner_h_cm,outer_l_cm,outer_w_cm,outer_h_cm,tare_g,max_load_g,price_vnd';

function dims(values: readonly number[]): { length_mm: number; width_mm: number; height_mm: number } {
  const [length_mm = 0, width_mm = 0, height_mm = 0] = values;
  return { length_mm, width_mm, height_mm };
}

function parseCsv(path: string): {
  code: string;
  name: string;
  inner: number[];
  outer: number[];
  tare_g: number;
  max_load_g: number;
  price_vnd: number | null;
}[] {
  const lines = readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const [header, ...rows] = lines;
  if (header?.replace(/\s/g, '') !== CSV_HEADER) {
    throw new Error(`Header CSV sai. Cần đúng: ${CSV_HEADER}`);
  }
  return rows.map((row, index) => {
    const cells = row.split(',').map((c) => c.trim());
    if (cells.length !== 11) throw new Error(`Dòng ${String(index + 2)} cần 11 cột, có ${String(cells.length)}.`);
    const num = (i: number): number => {
      const value = Number(cells[i]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Dòng ${String(index + 2)} cột ${String(i + 1)} không phải số hợp lệ.`);
      }
      return value;
    };
    return {
      code: cells[0] ?? '',
      name: cells[1] ?? '',
      inner: [num(2), num(3), num(4)].map((cm) => Math.floor(cm * 10)),
      outer: [num(5), num(6), num(7)].map((cm) => Math.ceil(cm * 10)),
      tare_g: Math.round(num(8)),
      max_load_g: Math.round(num(9)),
      price_vnd: cells[10] === '' ? null : Math.round(num(10)),
    };
  });
}

async function run(): Promise<void> {
  const csvPath = process.argv[2];
  const app = await NestFactory.createApplicationContext(AppModule);
  const boxModel = app.get<Model<PackagingBoxDocument>>(getModelToken(PackagingBox.name));

  if (!csvPath) {
    let created = 0;
    for (const box of SAMPLE_BOXES) {
      const result = await boxModel.updateOne(
        { code: box.code },
        {
          $setOnInsert: {
            code: box.code,
            name: box.name,
            inner: dims(box.inner),
            outer: dims(box.outer),
            tare_g: box.tare_g,
            max_load_g: box.max_load_g,
            price_vnd: box.price_vnd,
            is_sample: true,
            is_active: true,
          },
        },
        { upsert: true },
      );
      created += result.upsertedCount;
    }
    console.log(`Seed thùng mẫu: tạo mới ${String(created)}/${String(SAMPLE_BOXES.length)}.`);
  } else {
    const boxes = parseCsv(csvPath);
    const result = await boxModel.bulkWrite(
      boxes.map((box) => ({
        updateOne: {
          filter: { code: box.code },
          update: {
            $set: {
              name: box.name,
              inner: dims(box.inner),
              outer: dims(box.outer),
              tare_g: box.tare_g,
              max_load_g: box.max_load_g,
              price_vnd: box.price_vnd,
              is_sample: false,
              is_active: true,
            },
          },
          upsert: true,
        },
      })),
    );
    console.log(
      `Import ${String(boxes.length)} thùng: tạo ${String(result.upsertedCount)}, cập nhật ${String(result.modifiedCount)}.`,
    );
  }

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
