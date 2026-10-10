import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CARRIER_ADAPTER, CarrierAdapter } from '../src/modules/carriers/carrier-adapter.interface';

/**
 * ===================================================================
 * 08/10/2026 (C2) — KIỂM TRA NHANH ADAPTER GHN VỚI MÔI TRƯỜNG THẬT (chỉ đọc)
 * ===================================================================
 * Gọi đúng adapter mà hệ thống dùng (theo CARRIER_MODE trong .env):
 *   1. Get Service tới Quận Bình Thạnh (district 1462)
 *   2. Calculate Fee cho 2 phương án đóng gói: túi 30×25×4 và thùng 40×30×20 (300 g)
 * KHÔNG tạo vận đơn, KHÔNG ghi DB.
 *
 *   npx ts-node -r dotenv/config scripts/ghn-smoke-test.ts
 * ===================================================================
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const carrier = app.get<CarrierAdapter>(CARRIER_ADAPTER);
    console.log(`Đơn vị vận chuyển đang dùng: ${carrier.code}`);

    const services = await carrier.getAvailableServices(1462);
    console.log('Gói dịch vụ tới Quận Bình Thạnh:', services);

    const destination = { to_district_id: 1462, to_ward_code: '21620' };
    const bag = await carrier.calculateFee({
      ...destination,
      parcel: { weight_g: 300, length_cm: 30, width_cm: 25, height_cm: 4 },
    });
    const carton = await carrier.calculateFee({
      ...destination,
      parcel: { weight_g: 300, length_cm: 40, width_cm: 30, height_cm: 20 },
    });
    console.table([
      { phuong_an: 'Túi niêm phong 30×25×4', ...bag },
      { phuong_an: 'Thùng carton 40×30×20', ...carton },
    ]);
    console.log(`✅ Chênh lệch: ${String(carton.total - bag.total)}đ`);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Kiểm tra thất bại:', err);
  process.exit(1);
});
