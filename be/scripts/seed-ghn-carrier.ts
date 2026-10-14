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
 * C4 (14/10/2026) — thêm hãng GHN kiểu 'live' vào danh mục hãng (shipping_carriers)
 * ===================================================================
 * GHN xuất hiện CẠNH các hãng mẫu của module shipping: màn báo giá thấy thêm dòng
 * "GHN" với cước THẬT (gọi Preview cho từng kiện), tạo vận đơn với `carrier_code: "GHN"`
 * thì BE tạo đơn ở GHN cho từng kiện. Gọi GHN staging hay mock theo CARRIER_MODE.
 *
 *   cd be
 *   npx ts-node -r dotenv/config scripts/seed-ghn-carrier.ts
 *
 * Chạy lại an toàn: có rồi thì cập nhật tên/dịch vụ/kind, không tạo trùng.
 * Muốn ẩn GHN khỏi báo giá: PATCH /shipping/carriers/:id { "is_active": false }.
 * ===================================================================
 */
const GHN_CARRIER = {
  code: 'GHN',
  name: 'Giao Hàng Nhanh (GHN)',
  kind: 'live' as const,
  // Chỉ dùng để HIỂN THỊ cân quy đổi trên báo giá — phí thật luôn do GHN tính.
  volumetric_divisor: 5000,
  is_sample: false,
  is_active: true,
  services: [
    {
      code: 'LIGHT',
      name: 'GHN — Hàng nhẹ (dưới 20 kg)',
      eta_min_days: 1,
      eta_max_days: 3,
      bands: [],
      extra_price_vnd_per_500g: 0,
      carrier_service_type_id: 2,
    },
    {
      code: 'HEAVY',
      name: 'GHN — Hàng nặng (từ 20 kg)',
      eta_min_days: 2,
      eta_max_days: 5,
      bands: [],
      extra_price_vnd_per_500g: 0,
      carrier_service_type_id: 5,
    },
  ],
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const model = app.get<Model<ShippingCarrierDocument>>(getModelToken(ShippingCarrier.name));
  const existing = await model.findOne({ code: GHN_CARRIER.code });
  if (existing) {
    await model.updateOne(
      { _id: existing._id },
      { $set: { name: GHN_CARRIER.name, kind: GHN_CARRIER.kind, services: GHN_CARRIER.services, is_sample: false } },
    );
    console.log(`= ${GHN_CARRIER.code} đã có — cập nhật dịch vụ LIGHT/HEAVY, kind=live`);
  } else {
    await model.create(GHN_CARRIER);
    console.log(`+ Đã tạo hãng ${GHN_CARRIER.code} (kind=live, dịch vụ LIGHT=type 2, HEAVY=type 5)`);
  }
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
