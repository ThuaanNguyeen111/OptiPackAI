import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  ShippingCarrier,
  ShippingCarrierDocument,
} from '../src/modules/shipping/schemas/shipping-carrier.schema';

/**
 * ===================================================================
 * Hãng vận chuyển MẪU (30/09/2026)
 * ===================================================================
 * Tạo 2 hãng mẫu (nhanh + tiết kiệm) với bảng cước SỐ TỰ ĐẶT (`is_sample: true`)
 * để chạy được luồng báo giá → tạo vận đơn khi chưa có bảng cước thật. Đây KHÔNG
 * phải cước của hãng nào ngoài đời — Admin thay bằng số thật qua
 * PATCH /shipping/carriers/:id (đặt `is_sample: false`).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/seed-shipping-carriers.ts
 *
 * Chỉ tạo mã chưa có, an toàn chạy lại.
 * ===================================================================
 */
const SAMPLE_CARRIERS: Pick<ShippingCarrier, 'code' | 'name' | 'volumetric_divisor' | 'services'>[] = [
  {
    code: 'SAMPLE-EXPRESS',
    name: 'Hãng mẫu — Giao nhanh (số giả lập)',
    volumetric_divisor: 5000,
    services: [
      {
        code: 'FAST',
        name: 'Giao nhanh 1-2 ngày',
        eta_min_days: 1,
        eta_max_days: 2,
        bands: [
          { up_to_g: 500, price_vnd: 32000 },
          { up_to_g: 1000, price_vnd: 38000 },
          { up_to_g: 2000, price_vnd: 48000 },
          { up_to_g: 5000, price_vnd: 75000 },
        ],
        extra_price_vnd_per_500g: 8000,
      },
    ],
  },
  {
    code: 'SAMPLE-ECONOMY',
    name: 'Hãng mẫu — Tiết kiệm (số giả lập)',
    volumetric_divisor: 6000,
    services: [
      {
        code: 'STANDARD',
        name: 'Tiêu chuẩn 3-5 ngày',
        eta_min_days: 3,
        eta_max_days: 5,
        bands: [
          { up_to_g: 500, price_vnd: 18000 },
          { up_to_g: 1000, price_vnd: 22000 },
          { up_to_g: 2000, price_vnd: 29000 },
          { up_to_g: 5000, price_vnd: 48000 },
        ],
        extra_price_vnd_per_500g: 4500,
      },
      {
        code: 'BULK',
        name: 'Hàng cồng kềnh 4-7 ngày',
        eta_min_days: 4,
        eta_max_days: 7,
        bands: [
          { up_to_g: 5000, price_vnd: 42000 },
          { up_to_g: 10000, price_vnd: 70000 },
        ],
        extra_price_vnd_per_500g: 3500,
      },
    ],
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const model = app.get<Model<ShippingCarrierDocument>>(getModelToken(ShippingCarrier.name));
  for (const carrier of SAMPLE_CARRIERS) {
    const exists = await model.exists({ code: carrier.code });
    if (exists) {
      console.log(`= ${carrier.code} đã có, bỏ qua`);
      continue;
    }
    await model.create({ ...carrier, is_sample: true, is_active: true });
    console.log(`+ Đã tạo ${carrier.code} (${String(carrier.services.length)} dịch vụ, cước mẫu)`);
  }
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
