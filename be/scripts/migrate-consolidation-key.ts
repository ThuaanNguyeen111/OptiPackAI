import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Order,
  OrderDocument,
} from '../src/modules/orders/schemas/order.schema';
import { computeConsolidationKey } from '../src/modules/orders/utils/consolidation-key.util';

/**
 * ===================================================================
 * MIGRATION 1 LẦN (AOFP-XX, 2026-09-15) — tính lại consolidation_key
 * ===================================================================
 * computeConsolidationKey() vừa thêm tham số `platform` bắt buộc (fix
 * gộp nhầm đơn khác sàn) — công thức hash đổi, nên mọi Order ĐÃ CÓ
 * trong DB trước fix này đang giữ consolidation_key theo công thức
 * CŨ (không có platform), sẽ KHÔNG match được với đơn mới sync sau
 * fix (dù cùng khách hàng).
 *
 * Script này tính lại trực tiếp từ field `recipient` đã lưu sẵn trên
 * Order (không cần gọi lại Lazada). Vì dữ liệu hiện tại 100% là
 * Lazada, gán cứng platform = 'lazada' cho mọi bản ghi hiện có (đúng
 * thực tế dữ liệu, không phải giả định).
 *
 * Chạy 1 LẦN DUY NHẤT sau khi deploy code fix, TRƯỚC khi cron sync
 * tiếp theo chạy (tránh vừa có đơn mới theo công thức mới, vừa có
 * đơn cũ chưa migrate theo công thức cũ, xen kẽ nhau).
 *
 *   npx ts-node scripts/migrate-consolidation-key.ts
 * ===================================================================
 */
async function migrateConsolidationKey(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));

  const orders = await orderModel
    .find({})
    .select('_id platform recipient consolidation_key')
    .lean();

  console.log(
    `Tìm thấy ${String(orders.length)} đơn cần kiểm tra lại consolidation_key.`,
  );

  let updated = 0;
  let skipped = 0;

  for (const order of orders) {
    if (
      !order.recipient.phone ||
      !order.recipient.address_line1 ||
      !order.recipient.city
    ) {
      console.warn(
        `⚠️  Đơn ${String(order._id)} thiếu địa chỉ/SĐT đã lưu — bỏ qua, không tính lại được.`,
      );
      skipped += 1;
      continue;
    }

    const newKey = computeConsolidationKey(
      order.platform,
      order.recipient.phone,
      order.recipient.address_line1,
      order.recipient.city,
    );

    if (newKey === order.consolidation_key) {
      // Đã đúng công thức mới từ trước (VD chạy script 2 lần) — bỏ qua.
      skipped += 1;
      continue;
    }

    await orderModel.updateOne(
      { _id: order._id },
      { $set: { consolidation_key: newKey } },
    );
    updated += 1;
  }

  console.log(
    `✅ Xong — đã cập nhật ${String(updated)} đơn, bỏ qua ${String(skipped)} đơn (đã đúng hoặc thiếu dữ liệu).`,
  );
  await app.close();
}

migrateConsolidationKey().catch((err: unknown) => {
  console.error('❌ Migration thất bại:', err);
  process.exit(1);
});
