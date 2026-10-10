import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/modules/orders/orders.service';

/**
 * ===================================================================
 * 08/10/2026 (C1 — GHN) — bổ sung Tỉnh/Quận/Phường cho đơn Lazada cũ
 * ===================================================================
 * Đơn đồng bộ TRƯỚC 08/10/2026 chưa có recipient.province_name/district_name/
 * ward_name. Script đọc lại địa chỉ từ Lazada (GetOrders) rồi ghi 3 field đó.
 * Không tạo đơn mới, không đổi field khác, chạy lại an toàn.
 *
 * BƯỚC 1 — chạy thử, KHÔNG ghi DB, xem 5 mẫu để kiểm tra cách tách địa chỉ:
 *   npx ts-node -r dotenv/config scripts/backfill-order-recipient-areas.ts <shop_id> --dry-run
 * BƯỚC 2 — ghi thật (mặc định lấy đơn cập nhật trong 90 ngày):
 *   npx ts-node -r dotenv/config scripts/backfill-order-recipient-areas.ts <shop_id> [--days=90]
 * ===================================================================
 */
async function main(): Promise<void> {
  const shopId = process.argv[2];
  if (!shopId || shopId.startsWith('--')) {
    console.error(
      '❌ Thiếu shop_id. Cách dùng: npx ts-node -r dotenv/config scripts/backfill-order-recipient-areas.ts <shop_id> [--dry-run] [--days=90]',
    );
    process.exit(1);
  }
  // Cờ lạ (VD gõ nhầm "--dry-run~") → DỪNG, không âm thầm chạy ghi thật.
  const unknownFlags = process.argv
    .slice(3)
    .filter((arg) => arg !== '--dry-run' && !/^--days=\d+$/.test(arg));
  if (unknownFlags.length > 0) {
    console.error(
      `❌ Cờ không hợp lệ: ${unknownFlags.join(' ')}. Chỉ nhận --dry-run và --days=<số ngày>. Không ghi gì vào DB.`,
    );
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');
  const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
  const parsedDays = daysArg ? Number(daysArg.slice('--days='.length)) : 90;
  const lookbackDays =
    Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 90;

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const result = await app
      .get(OrdersService)
      .backfillRecipientAreas(shopId, { lookbackDays, dryRun });
    console.log(
      `${dryRun ? '🔎 CHẠY THỬ (không ghi DB)' : '✅ Đã ghi'} — Lazada trả ${String(result.fetched)} đơn trong ${String(lookbackDays)} ngày; ` +
        `${dryRun ? 'sẽ cập nhật' : 'đã cập nhật'} ${dryRun ? '(xem mẫu)' : String(result.matched)} đơn; ` +
        `${String(result.missingWard)} đơn không tách được phường, ${String(result.missingProvince)} đơn không tách được tỉnh, ` +
        `${String(result.maskedAddress)} đơn bị Lazada che address3/4/5; ${String(result.canceledOrders)} đơn đã huỷ.`,
    );
    console.table(result.samples);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
