import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Notification,
  NotificationDocument,
} from '../src/modules/notifications/schemas/notification.schema';

/**
 * ===================================================================
 * MIGRATION 1 LẦN (AOFP-XX, 21/09/2026) — backfill recipient_role
 * string -> number trong notifications
 * ===================================================================
 * Báo cáo thật từ FE: schema `recipient_role` trước đây khai
 * `type: String` dù giá trị runtime luôn là SỐ (UserRole là enum số) —
 * Mongoose lưu "2" (chuỗi) thay vì 2 (số). Mọi nơi khác (JWT payload,
 * code so sánh role) đều dùng SỐ — lệch kiểu khiến Packaging Staff
 * không thấy chuông dù notify() đã chạy đúng.
 *
 * Code hiện tại đã sửa (schema type: Number, service ghi Number() +
 * query dual-match cả 2 kiểu) — script này dọn dẹp DỮ LIỆU CŨ đã lưu
 * dạng string, để về sau không còn cần dual-match nữa.
 *
 * Chạy 1 LẦN DUY NHẤT mỗi môi trường (dev, staging, production riêng —
 * KHÔNG dùng chung 1 lần chạy cho nhiều môi trường, mỗi DB độc lập):
 *
 *   npx ts-node -r dotenv/config scripts/migrate-notification-role-types.ts
 * ===================================================================
 */
async function migrateNotificationRoleTypes(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const notificationModel = app.get<Model<NotificationDocument>>(
    getModelToken(Notification.name),
  );

  const docs = await notificationModel
    .find({ recipient_role: { $type: 'string' } })
    .select('_id recipient_role')
    .lean();

  console.log(
    `Tìm thấy ${String(docs.length)} notification có recipient_role dạng chuỗi cần sửa.`,
  );

  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const numeric = Number(doc.recipient_role);
    if (Number.isNaN(numeric)) {
      console.warn(
        `⚠️  Notification ${String(doc._id)} có recipient_role="${String(doc.recipient_role)}" không convert được sang số — bỏ qua, cần kiểm tra tay.`,
      );
      skipped += 1;
      continue;
    }
    await notificationModel.updateOne(
      { _id: doc._id },
      { $set: { recipient_role: numeric } },
    );
    updated += 1;
  }

  console.log(
    `✅ Xong — đã sửa ${String(updated)} bản ghi, bỏ qua ${String(skipped)} bản ghi (không convert được).`,
  );
  await app.close();
}

migrateNotificationRoleTypes().catch((err: unknown) => {
  console.error('❌ Migration thất bại:', err);
  process.exit(1);
});
