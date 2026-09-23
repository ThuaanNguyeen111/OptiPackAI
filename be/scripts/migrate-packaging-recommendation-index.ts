import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationDocument,
} from '../src/modules/packaging/schemas/packaging-recommendation.schema';
import { PackagingApprovalStatus } from '../src/modules/packaging/enums/packaging-approval-status.enum';

/**
 * ===================================================================
 * MIGRATION 1 LẦN (21/09/2026, BE-3a — mỗi đơn một kiện)
 * ===================================================================
 * Trước đây index `order_group_id_1` unique (partial is_active) buộc
 * 1 group chỉ có 1 recommendation active. Giờ mỗi ĐƠN có 1 bản active
 * → group nhiều đơn sẽ bị E11000 nếu index cũ còn trong Atlas (Mongoose
 * tự TẠO index mới nhưng KHÔNG tự XÓA index cũ).
 *
 * Script: (1) drop index cũ nếu còn; (2) vô hiệu hóa bản legacy đang
 * chờ duyệt (không có order_id/placements) để group tính lại bằng
 * engine mới — bản đã approved/adjusted giữ nguyên làm lịch sử;
 * (3) syncIndexes tạo index mới.
 *
 *   npx ts-node scripts/migrate-packaging-recommendation-index.ts
 *
 * Group đang `pending_approval` với bản legacy: sau script cần Reject
 * (quay về picked) rồi generate lại.
 * ===================================================================
 */
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const model = app.get<Model<PackagingRecommendationDocument>>(
    getModelToken(PackagingRecommendationDoc.name),
  );

  const indexes = await model.collection.indexes();
  const legacy = indexes.find((i) => i.name === 'order_group_id_1' && i.unique === true);
  if (legacy) {
    await model.collection.dropIndex('order_group_id_1');
    console.log('Đã drop index cũ order_group_id_1 (unique).');
  } else {
    console.log('Không còn index cũ order_group_id_1 — bỏ qua.');
  }

  const result = await model.updateMany(
    { order_id: null, is_active: true, approval_status: PackagingApprovalStatus.PENDING },
    { $set: { is_active: false } },
  );
  console.log(`Vô hiệu hóa ${String(result.modifiedCount)} recommendation legacy đang chờ duyệt.`);

  await model.syncIndexes();
  console.log('Đã đồng bộ index theo schema mới.');
  await app.close();
}

run().catch((error: unknown) => {
  console.error('Migration thất bại:', error);
  process.exit(1);
});
